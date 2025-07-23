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
import { derivePublicationFromChallengeRequest, isStringDomain } from "@plebbit/plebbit-js/dist/node/util.js";
import { getPlebbitAddressFromPublicKey } from "@plebbit/plebbit-js/dist/node/signer/util.js";
import { normalize } from "viem/ens";
import { isAddress } from "viem";

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
        option: "transferCooldownSeconds",
        label: "Transfer Cooldown (seconds)",
        default: "604800", // 1 week
        description: "Cooldown period in seconds before a transferred NFT can be used by new owner",
        placeholder: "604800"
    },
    {
        option: "error",
        label: "Error Message",
        default: "You need a MintPass NFT to post in this community. Visit https://plebbitlabs.com/mintpass/request/{authorAddress} to get verified.",
        description: "Error message shown to users who don't have the required NFT"
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
    }
];

/**
 * Get chain provider with safety checks
 */
const _getChainProviderWithSafety = (plebbit: Plebbit, chainTicker: string) => {
    const chainProvider = plebbit.chainProviders[chainTicker];
    if (!chainProvider) throw Error(`plebbit.chainProviders[${chainTicker}] is not defined`);
    return chainProvider;
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
    const viemClient = props.plebbit._domainResolver._createViemClientIfNeeded(
        "eth",
        _getChainProviderWithSafety(props.plebbit, "eth").urls[0]
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

    // Cache timestamp to prevent replay attacks
    const cache = await props.plebbit._createStorageLRU({
        cacheName: "challenge_mintpass_wallet_last_timestamp",
        maxItems: Number.MAX_SAFE_INTEGER
    });
    
    const cacheKey = props.chainTicker + authorWallet.address;
    const lastTimestampOfAuthor = <number | undefined>await cache.getItem(cacheKey);
    if (typeof lastTimestampOfAuthor === "number" && lastTimestampOfAuthor > authorWallet.timestamp) {
        return "The author is trying to use an old wallet signature";
    }
    if ((lastTimestampOfAuthor || 0) < authorWallet.timestamp) {
        await cache.setItem(cacheKey, authorWallet.timestamp);
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
        plebbit: props.plebbit
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
}): Promise<string | undefined> => {

    try {
        // Create viem client for the specified chain
        const viemClient = props.plebbit._domainResolver._createViemClientIfNeeded(
            props.chainTicker,
            _getChainProviderWithSafety(props.plebbit, props.chainTicker).urls[0]
        );

        // Check if user owns the required token type
        const ownsTokenType = await viemClient.readContract({
            address: <"0x${string}">props.contractAddress,
            abi: MINTPASS_ABI,
            functionName: "ownsTokenType",
            args: [props.authorWalletAddress, props.requiredTokenType]
        });

        if (!ownsTokenType) {
            // Replace {authorAddress} placeholder in error message
            const errorMessage = props.error.replace("{authorAddress}", props.authorAddress);
            return errorMessage;
        }

        // If cooldown is disabled (0), skip cooldown check
        if (props.transferCooldownSeconds === 0) {
            return undefined; // Success
        }

        // Get all tokens owned by the user to check transfer cooldown
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

        // Check transfer cooldown for each token
        const transferCooldownCache = await props.plebbit._createStorageLRU({
            cacheName: "challenge_mintpass_transfer_cooldown",
            maxItems: Number.MAX_SAFE_INTEGER
        });

        const now = Math.floor(Date.now() / 1000);
        let hasValidToken = false;

        for (const token of requiredTokens) {
            const tokenCacheKey = `${props.contractAddress}_${token.tokenId.toString()}`;
            const lastUsageRecord = <{authorAddress: string; timestamp: number} | undefined>await transferCooldownCache.getItem(tokenCacheKey);
            
            // If token was never used, or was used by the same author, it's valid
            if (!lastUsageRecord || lastUsageRecord.authorAddress === props.authorAddress) {
                hasValidToken = true;
                
                // Update the cache with current usage
                await transferCooldownCache.setItem(tokenCacheKey, {
                    authorAddress: props.authorAddress,
                    timestamp: now
                });
                break;
            }
            
            // If token was used by different author, check cooldown
            const timeSinceLastUse = now - lastUsageRecord.timestamp;
            if (timeSinceLastUse >= props.transferCooldownSeconds) {
                hasValidToken = true;
                
                // Update the cache with current usage
                await transferCooldownCache.setItem(tokenCacheKey, {
                    authorAddress: props.authorAddress,
                    timestamp: now
                });
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

    const viemClient = props.plebbit._domainResolver._createViemClientIfNeeded(
        "eth",
        _getChainProviderWithSafety(props.plebbit, "eth").urls[0]
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
        plebbit: props.plebbit
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
        error 
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
    
    const sharedProps = {
        plebbit: subplebbit._plebbit,
        publication,
        chainTicker,
        contractAddress,
        requiredTokenType: requiredTokenTypeNum,
        transferCooldownSeconds: cooldownSeconds,
        error: error || `You need a MintPass NFT to post in this community. Visit https://plebbitlabs.com/mintpass/request/${publication.author.address} to get verified.`
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