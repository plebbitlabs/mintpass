import type { 
    Challenge, 
    ChallengeFile, 
    ChallengeResult, 
    SubplebbitChallengeSetting
} from "@plebbit/plebbit-js/dist/node/subplebbit/types.js";
import type { 
    DecryptedChallengeRequestMessageTypeWithSubplebbitAuthor,
    PublicationWithSubplebbitAuthorFromDecryptedChallengeRequest 
} from "@plebbit/plebbit-js/dist/node/pubsub-messages/types.js";
import type { Plebbit } from "@plebbit/plebbit-js/dist/node/plebbit/plebbit.js";
import { normalize } from "viem/ens";
import { isAddress } from "viem";
import envPaths from "env-paths";
import Keyv from "keyv";
import KeyvSqlite from "@keyv/sqlite";
import fs from "fs";
import path from "path";

// Simple utility function replacements
function isStringDomain(address: string): boolean {
    return address.includes('.') && !address.startsWith('0x');
}

function getPlebbitAddressFromPublicKey(publicKey: string): string {
    // For now, return the public key as-is - this is a simplified implementation
    // In practice, this would involve cryptographic derivation
    return publicKey;
}

function derivePublicationFromChallengeRequest(
    challengeRequestMessage: DecryptedChallengeRequestMessageTypeWithSubplebbitAuthor
): PublicationWithSubplebbitAuthorFromDecryptedChallengeRequest | undefined {
    // Support all publication kinds that can trigger a challenge
    // Order does not really matter, but keep most common first
    const possibleKeys = [
        "comment",
        "vote",
        "commentEdit",
        "commentModeration",
        "subplebbitEdit"
    ] as const;

    for (const key of possibleKeys) {
        const maybe = (challengeRequestMessage as any)[key];
        if (maybe && typeof maybe === "object") {
            return maybe as PublicationWithSubplebbitAuthorFromDecryptedChallengeRequest;
        }
    }

    // Some implementations may place a generic `publication` field
    const generic = (challengeRequestMessage as any)?.publication;
    if (generic && typeof generic === "object") {
        return generic as PublicationWithSubplebbitAuthorFromDecryptedChallengeRequest;
    }

    return undefined;
}

// Challenge option inputs for subplebbit configuration
const optionInputs = <NonNullable<ChallengeFile["optionInputs"]>>[
    {
        option: "chainTicker",
        label: "Chain Ticker",
        default: "base",
        description: "The chain ticker where MintPass contract is deployed",
        placeholder: "base",
        required: true
    },
    {
        option: "contractAddress", 
        label: "Contract Address",
        default: "0x13d41d6B8EA5C86096bb7a94C3557FCF184491b9", // Base Sepolia deployed address
        description: "The MintPass contract address",
        placeholder: "0x...",
        required: true
    },
    {
        option: "requiredTokenType",
        label: "Required Token Type",
        default: "0",
        description: "The token type required to pass (0 = SMS verification, 1 = Email, etc.)",
        placeholder: "0",
        required: true
    },
    {
        option: "bindToFirstAuthor",
        label: "Bind NFT to First Author (per sub)",
        default: "true",
        description: "When enabled, the first author that uses a token in this sub gets bound to that tokenId; subsequent different authors are rejected.",
        placeholder: "true"
    },
    
    {
        option: "transferCooldownSeconds",
        label: "Transfer Cooldown (seconds)",
        default: "604800", // 1 week
        description: "Cooldown period in seconds before a transferred NFT can be used by new owner",
        placeholder: "604800"
    },
    {
        option: "error",
        label: "Error Message",
        default: "You need a MintPass NFT to post in this community. Visit https://mintpass.org/request/{authorAddress} to get verified.",
        description: "Error message shown to users who don't have the required NFT"
    },
    {
        option: "rpcUrl",
        label: "Custom RPC URL",
        default: "",
        description: "Optional custom RPC URL for blockchain calls (for testing). If not provided, uses default chain RPC.",
        placeholder: "http://127.0.0.1:8545"
    }
];

const description = "Verify that the author owns a MintPass NFT of the required type, with transfer cooldown protection.";

// MintPass contract ABI - only the functions we need
const MINTPASS_ABI = [
    {
        "inputs": [{"internalType": "address", "name": "owner", "type": "address"}],
        "name": "tokensOfOwner", 
        "outputs": [{"components": [{"internalType": "uint256", "name": "tokenId", "type": "uint256"}, {"internalType": "uint16", "name": "tokenType", "type": "uint16"}], "internalType": "struct MintPassV1.TokenInfo[]", "name": "", "type": "tuple[]"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "address", "name": "owner", "type": "address"}, {"internalType": "uint16", "name": "tokenType", "type": "uint16"}],
        "name": "ownsTokenType",
        "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function"
    },
    
];

// Persistent storage (Keyv + SQLite) for bindings, cooldowns, and timestamps
const paths = envPaths("mintpass");
const dataDir = paths.data;

let storesInitialized: Promise<void> | null = null;
let walletTimestampsStore: Keyv<number> | null = null;
let transferCooldownStore: Keyv<{ authorAddress: string; timestamp: number }> | null = null;
let bindingsStore: Keyv<string> | null = null;

async function initializeStores() {
    if (!storesInitialized) {
        storesInitialized = (async () => {
            try {
                await fs.promises.mkdir(dataDir, { recursive: true });
                const dbFile = path.join(dataDir, "challenge-bindings.sqlite");
                const sqliteUri = "sqlite://" + dbFile.replace(/\\/g, "/");
                const store = new KeyvSqlite(sqliteUri);

                walletTimestampsStore = new Keyv<number>({ store, namespace: "wallet-ts" });
                transferCooldownStore = new Keyv<{ authorAddress: string; timestamp: number }>({ store, namespace: "cooldown" });
                bindingsStore = new Keyv<string>({ store, namespace: "bindings" });

                // Avoid crashing on storage errors; they will surface as validation failures
                walletTimestampsStore.on("error", () => {});
                transferCooldownStore.on("error", () => {});
                bindingsStore.on("error", () => {});
            } catch (e) {
                console.error("MintPass challenge: failed to initialize persistent stores", e);
                throw e;
            }
        })();
    }
    return storesInitialized;
}

function getStores() {
    if (!walletTimestampsStore || !transferCooldownStore || !bindingsStore) {
        throw new Error("Storage not initialized");
    }
    return { walletTimestampsStore, transferCooldownStore, bindingsStore };
}

/**
 * Get chain provider with safety checks and fallbacks
 */
const _getChainProviderWithSafety = (plebbit: Plebbit, chainTicker: string, customRpcUrl?: string) => {
    // If custom RPC URL is provided (e.g., for testing), use it
    if (customRpcUrl) {
        return {
            urls: [customRpcUrl],
            chainId: customRpcUrl.includes('127.0.0.1') || customRpcUrl.includes('localhost') ? 1337 : 1
        };
    }
    
    // If plebbit has chainProviders configured, use them
    if (plebbit.chainProviders && plebbit.chainProviders[chainTicker]) {
        return plebbit.chainProviders[chainTicker];
    }
    
    // Fallback to default RPC URLs if no chainProviders configured
    const defaultProviders: Record<string, any> = {
        eth: {
            urls: ["https://rpc.ankr.com/eth"],
            chainId: 1
        },
        base: {
            urls: ["https://mainnet.base.org"],
            chainId: 8453
        }
    };
    
    const defaultProvider = defaultProviders[chainTicker];
    if (!defaultProvider) {
        throw Error(`No chain provider found for ${chainTicker} and no default available`);
    }
    
    return defaultProvider;
};

/**
 * Create viem client for a specific chain and RPC URL
 * This replaces the private plebbit-js API to avoid dependency on internal APIs
 */
const createViemClientForChain = async (chainTicker: string, rpcUrl: string) => {
    const { createPublicClient, http } = await import('viem');
    
    // Define chain configurations
    const chainConfigs: Record<string, any> = {
        eth: {
            id: 1,
            name: 'Ethereum',
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: { default: { http: [rpcUrl] } }
        },
        base: {
            id: 8453,
            name: 'Base',
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: { default: { http: [rpcUrl] } }
        },
        // For local testing (hardhat)
        hardhat: {
            id: 1337,
            name: 'Hardhat',
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: { default: { http: [rpcUrl] } }
        }
    };

    // Determine chain config based on RPC URL and chainTicker
    let chainConfig = chainConfigs[chainTicker];
    
    // If using localhost, assume it's hardhat regardless of chainTicker
    if (rpcUrl.includes('127.0.0.1') || rpcUrl.includes('localhost')) {
        chainConfig = chainConfigs.hardhat;
    }

    if (!chainConfig) {
        throw new Error(`Unsupported chain ticker: ${chainTicker}`);
    }

    return createPublicClient({
        chain: chainConfig,
        transport: http(rpcUrl)
    });
};

/**
 * Check if author has required MintPass NFT and handle transfer cooldown
 */
const verifyAuthorMintPass = async (props: {
    publication: PublicationWithSubplebbitAuthorFromDecryptedChallengeRequest;
    chainTicker: string;
    contractAddress: string;
    requiredTokenType: number;
    transferCooldownSeconds: number;
    error: string;
    plebbit: Plebbit;
    rpcUrl?: string;
    bindToFirstAuthor: boolean;
}): Promise<string | undefined> => {
    
    const authorWallet = props.publication.author.wallets?.[props.chainTicker];
    if (typeof authorWallet?.address !== "string") {
        return "Author wallet address is not defined. Please set your wallet address in settings.";
    }

    // Verify wallet signature first
    if (isStringDomain(authorWallet.address)) {
        // Handle ENS/domain resolution
        const resolvedWalletAddress = await props.plebbit.resolveAuthorAddress(authorWallet.address);
        const publicationSignatureAddress = await getPlebbitAddressFromPublicKey(props.publication.signature.publicKey);
        if (resolvedWalletAddress !== publicationSignatureAddress) {
            return "The author wallet address's plebbit-author-address text record should resolve to the public key of the signature";
        }
    }

    // Validate wallet address format
    if (!isAddress(authorWallet.address)) {
        return "Invalid wallet address format";
    }

    // Verify the wallet signature
    const viemClient = await createViemClientForChain(
        "eth",
        _getChainProviderWithSafety(props.plebbit, "eth", props.rpcUrl).urls[0]
    );

    const messageToBeSigned: any = {};
    messageToBeSigned["domainSeparator"] = "plebbit-author-wallet";
    messageToBeSigned["authorAddress"] = props.publication.author.address;
    messageToBeSigned["timestamp"] = authorWallet.timestamp;

    const valid = await viemClient.verifyMessage({
        address: <"0x${string}">authorWallet.address,
        message: JSON.stringify(messageToBeSigned),
        signature: <"0x${string}">authorWallet.signature.signature
    });

    if (!valid) {
        return "The signature of the wallet is invalid";
    }

    // Cache timestamp to prevent replay attacks (persistent)
    await initializeStores();
    const { walletTimestampsStore } = getStores();
    const cacheKey = props.chainTicker + authorWallet.address;
    const lastTimestampOfAuthor = <number | undefined>await walletTimestampsStore.get(cacheKey);
    if (typeof lastTimestampOfAuthor === "number" && lastTimestampOfAuthor > authorWallet.timestamp) {
        return "The author is trying to use an old wallet signature";
    }
    if ((lastTimestampOfAuthor || 0) < authorWallet.timestamp) {
        await walletTimestampsStore.set(cacheKey, authorWallet.timestamp);
    }

    // Check MintPass NFT ownership
    const mintPassValidationFailure = await validateMintPassOwnership({
        authorWalletAddress: authorWallet.address,
        contractAddress: props.contractAddress,
        chainTicker: props.chainTicker,
        requiredTokenType: props.requiredTokenType,
        transferCooldownSeconds: props.transferCooldownSeconds,
        authorAddress: props.publication.author.address,
        error: props.error,
        plebbit: props.plebbit,
        rpcUrl: props.rpcUrl,
        bindToFirstAuthor: props.bindToFirstAuthor,
        subplebbitAddress: (<any>props.publication)?.subplebbitAddress
    });

    return mintPassValidationFailure;
};

/**
 * Check if author owns required MintPass NFT with transfer cooldown
 */
const validateMintPassOwnership = async (props: {
    authorWalletAddress: string;
    contractAddress: string;
    chainTicker: string;
    requiredTokenType: number;
    transferCooldownSeconds: number;
    authorAddress: string;
    error: string;
    plebbit: Plebbit;
    rpcUrl?: string;
    bindToFirstAuthor: boolean;
    subplebbitAddress?: string;
}): Promise<string | undefined> => {



    try {
        // Create viem client for the specified chain
        const viemClient = await createViemClientForChain(
            props.chainTicker,
            _getChainProviderWithSafety(props.plebbit, props.chainTicker, props.rpcUrl).urls[0]
        );

        // Check if user owns the required token type (optionally bound to author)
        let owns: boolean = false;
        try {
            const result = await viemClient.readContract({
                address: <"0x${string}">props.contractAddress,
                abi: MINTPASS_ABI,
                functionName: "ownsTokenType",
                args: [props.authorWalletAddress, props.requiredTokenType]
            });
            owns = Boolean(result);
        } catch (networkError: any) {
            // Handle network connectivity issues gracefully (common in test environments)
            if (networkError?.message?.includes?.('fetch failed') || 
                networkError?.message?.includes?.('HTTP request failed') ||
                networkError?.cause?.message?.includes?.('ECONNREFUSED')) {
                return "Failed to check MintPass NFT ownership. Please try again.";
            }
            // Re-throw unexpected errors
            throw networkError;
        }

        if (!owns) {
            // Replace {authorAddress} placeholder in error message
            const errorMessage = props.error.replace("{authorAddress}", props.authorAddress);
            return errorMessage;
        }

        // Get all tokens owned by the user to perform binding and optional cooldown checks
        const tokensInfo = await viemClient.readContract({
            address: <"0x${string}">props.contractAddress,
            abi: MINTPASS_ABI,
            functionName: "tokensOfOwner",
            args: [props.authorWalletAddress]
        }) as Array<{ tokenId: bigint; tokenType: number }>;

        // Find tokens of the required type
        const requiredTokens = tokensInfo.filter(token => token.tokenType === props.requiredTokenType);
        
        if (requiredTokens.length === 0) {
            const errorMessage = props.error.replace("{authorAddress}", props.authorAddress);
            return errorMessage;
        }

        // Check transfer cooldown and optional author binding for each token (persistent)
        await initializeStores();
        const { transferCooldownStore, bindingsStore } = getStores();

        const now = Math.floor(Date.now() / 1000);
        let hasValidToken = false;

        for (const token of requiredTokens) {
            const tokenCacheKey = `${props.contractAddress}_${token.tokenId.toString()}`;
            const lastUsageRecord = <{authorAddress: string; timestamp: number} | undefined>await transferCooldownStore.get(tokenCacheKey);
            // Per-sub binding key (bind to first author that uses this tokenId in this sub)
            const subKeyPrefix = props.subplebbitAddress ? `${props.subplebbitAddress}_` : '';
            const bindingKey = `${subKeyPrefix}${tokenCacheKey}_binding`;
            const boundAuthor = <string | undefined>await bindingsStore.get(bindingKey);
            
            // If token was never used, or was used by the same author, it's valid
            if (!lastUsageRecord || lastUsageRecord.authorAddress === props.authorAddress) {
                hasValidToken = true;
                
                // Update the cache with current usage
                await transferCooldownStore.set(tokenCacheKey, {
                    authorAddress: props.authorAddress,
                    timestamp: now
                });
                // Bind to first author if enabled
                if (props.bindToFirstAuthor && !boundAuthor) {
                    await bindingsStore.set(bindingKey, props.authorAddress);
                }
                // If binding exists and mismatches, reject
                if (props.bindToFirstAuthor && boundAuthor && boundAuthor !== props.authorAddress) {
                    return `This MintPass NFT is already bound to another author in this community.`;
                }
                break;
            }
            
            // If token was used by different author, check cooldown
            const timeSinceLastUse = now - lastUsageRecord.timestamp;
            if (timeSinceLastUse >= props.transferCooldownSeconds) {
                hasValidToken = true;
                
                // Update the cache with current usage
                await transferCooldownStore.set(tokenCacheKey, {
                    authorAddress: props.authorAddress,
                    timestamp: now
                });
                // Bind to first author if enabled
                if (props.bindToFirstAuthor && !boundAuthor) {
                    await bindingsStore.set(bindingKey, props.authorAddress);
                }
                if (props.bindToFirstAuthor && boundAuthor && boundAuthor !== props.authorAddress) {
                    return `This MintPass NFT is already bound to another author in this community.`;
                }
                break;
            }
        }

        if (!hasValidToken) {
            return `Your MintPass NFT is in cooldown period after being transferred. Please wait ${Math.ceil(props.transferCooldownSeconds / 86400)} days before using it.`;
        }

        return undefined; // Success

    } catch (error) {
        console.error("Failed to validate MintPass ownership:", error);
        return "Failed to check MintPass NFT ownership. Please try again.";
    }
};

/**
 * Verify author ENS address owns required MintPass
 */
const verifyAuthorENSMintPass = async (props: Parameters<typeof verifyAuthorMintPass>[0]): Promise<string | undefined> => {
    if (!props.publication.author.address.endsWith(".eth")) {
        return "Author address is not an ENS domain";
    }

    const viemClient = await createViemClientForChain(
        "eth",
        _getChainProviderWithSafety(props.plebbit, "eth", props.rpcUrl).urls[0]
    );

    const ownerOfAddress = await viemClient.getEnsAddress({
        name: normalize(props.publication.author.address)
    });

    if (!ownerOfAddress) {
        return "Failed to resolve ENS address";
    }

    // Check MintPass ownership for the ENS owner
    const mintPassValidationFailure = await validateMintPassOwnership({
        authorWalletAddress: ownerOfAddress,
        contractAddress: props.contractAddress,
        chainTicker: props.chainTicker,
        requiredTokenType: props.requiredTokenType,
        transferCooldownSeconds: props.transferCooldownSeconds,
        authorAddress: props.publication.author.address,
        error: props.error,
        plebbit: props.plebbit,
        rpcUrl: props.rpcUrl,
        bindToFirstAuthor: props.bindToFirstAuthor,
        subplebbitAddress: (<any>props.publication)?.subplebbitAddress
    });

    return mintPassValidationFailure;
};

/**
 * Main challenge function
 */
const getChallenge = async (
    subplebbitChallengeSettings: SubplebbitChallengeSetting,
    challengeRequestMessage: DecryptedChallengeRequestMessageTypeWithSubplebbitAuthor,
    challengeIndex: number,
    subplebbit: any // LocalSubplebbit type
): Promise<ChallengeResult> => {

    const { 
        chainTicker = "base", 
        contractAddress,
        requiredTokenType = "0",
        transferCooldownSeconds = "604800", // 1 week default
        error,
        rpcUrl,
        bindToFirstAuthor = "true"
    } = subplebbitChallengeSettings?.options || {};
    

    if (!contractAddress) {
        throw Error("Missing option contractAddress");
    }

    const requiredTokenTypeNum = parseInt(requiredTokenType);
    const cooldownSeconds = parseInt(transferCooldownSeconds);
    
    if (isNaN(requiredTokenTypeNum) || requiredTokenTypeNum < 0) {
        throw Error("Invalid requiredTokenType - must be a non-negative number");
    }

    if (isNaN(cooldownSeconds) || cooldownSeconds < 0) {
        throw Error("Invalid transferCooldownSeconds - must be a non-negative number");
    }

    const publication = derivePublicationFromChallengeRequest(challengeRequestMessage);
    if (!publication) {
        return {
            success: false,
            error: "Could not derive publication from challenge request."
        };
    }
    
    const sharedProps = {
        plebbit: subplebbit._plebbit,
        publication,
        chainTicker,
        contractAddress,
        requiredTokenType: requiredTokenTypeNum,
        transferCooldownSeconds: cooldownSeconds,
        error: error || `You need a MintPass NFT to post in this community. Visit https://mintpass.org/request/${publication.author.address} to get verified.`,
        rpcUrl,
        bindToFirstAuthor: String(bindToFirstAuthor).toLowerCase() === 'true' || String(bindToFirstAuthor) === '1'
    };

    // Try wallet verification first
    const walletFailureReason = await verifyAuthorMintPass(sharedProps);
    if (!walletFailureReason) {
        return { success: true };
    }

    // Try ENS verification if wallet fails
    const ensFailureReason = await verifyAuthorENSMintPass(sharedProps);
    if (!ensFailureReason) {
        return { success: true };
    }

    // Both verification methods failed
    const errorString = 
        `Author (${publication.author.address}) failed MintPass verification. ` +
        `Wallet: ${walletFailureReason}, ENS: ${ensFailureReason}`;
    
    console.log("MintPass challenge failed:", errorString);
    
    return { 
        success: false, 
        error: walletFailureReason // Show the more user-friendly wallet error
    };
};

/**
 * Challenge file factory function
 */
function ChallengeFileFactory(subplebbitChallengeSettings: SubplebbitChallengeSetting): ChallengeFile {
    const { chainTicker = "base" } = subplebbitChallengeSettings?.options || {};
    const type = <Challenge["type"]>("chain/" + chainTicker);
    
    return { 
        getChallenge, 
        optionInputs, 
        type, 
        description 
    };
}

export default ChallengeFileFactory; 