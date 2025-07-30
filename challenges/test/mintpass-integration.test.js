const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const path = require('path');

// Function to generate ETH wallet from plebbit private key (matching challenge expected format)
const getEthWalletFromPlebbitPrivateKey = async (privateKeyBase64, authorAddress, authorPublicKey) => {
  if (privateKeyBase64 === 'private key') return;

  const privateKeyBytes = Uint8Array.from(atob(privateKeyBase64), c => c.charCodeAt(0));
  if (privateKeyBytes.length !== 32) {
    throw Error('failed getting eth address from private key not 32 bytes');
  }
  
  const privateKeyHex = '0x' + Array.from(privateKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const wallet = new ethers.Wallet(privateKeyHex);
  const timestamp = Math.floor(Date.now() / 1000);
  
  // Use the exact message format expected by the challenge
  const messageToSign = JSON.stringify({
    domainSeparator: "plebbit-author-wallet",
    authorAddress: authorAddress,
    timestamp: timestamp
  });
  const signature = await wallet.signMessage(messageToSign);
  
  return {
    address: wallet.address, 
    timestamp, 
    signature: {
      signature, 
      publicKey: authorPublicKey,
      type: "eip191",
      signedPropertyNames: ["domainSeparator", "authorAddress", "timestamp"]
    }
  };
};

// Helper to create challenge settings
const createChallengeSettings = (contractAddress, chainProviderUrl, chainId, chainTicker = 'base', useCustomRpc = true) => {
  const options = {
    chainTicker,
    contractAddress,
    requiredTokenType: '0',
    transferCooldownSeconds: '0',
    error: 'You need a MintPass NFT to post in this community. This is a test message.'
  };
  
  // Conditionally add custom RPC settings
  if (useCustomRpc) {
    options.rpcUrl = chainProviderUrl;
    options.chainId = chainId.toString();
  }
  
  return {
    path: path.resolve(__dirname, '../dist/mintpass.js'),
    options
  };
};

// Simple utility to wait for a condition
const waitForCondition = (obj, condition, timeout = 30000) => {
  return new Promise((resolve, reject) => {
    const checkInterval = setInterval(() => {
      if (condition(obj)) {
        clearInterval(checkInterval);
        resolve(obj);
      }
    }, 100);

    setTimeout(() => {
      clearInterval(checkInterval);
      reject(new Error(`Condition not met within ${timeout}ms`));
    }, timeout);
  });
};

describe("MintPass Challenge Integration Test", function () {
  let mintpass, admin, minter, plebbit, plebbitForPublishing, chainProviderUrl, ipfsProcess;
  
  const NAME = "MintPassV1";
  const SYMBOL = "MINT1";
  const BASE_URI = "https://plebbitlabs.com/mintpass/mint1/";
  const SMS_TOKEN_TYPE = 0;

  this.timeout(300000);

  before(async function () {
    console.log("\n🚀 Setting up MintPass Challenge Integration Test Environment");
    
    [admin, minter] = await ethers.getSigners();
    
    console.log("📋 Deploying MintPass contract...");
    const MintPassV1Factory = await ethers.getContractFactory("MintPassV1");
    mintpass = await MintPassV1Factory.deploy(NAME, SYMBOL, BASE_URI, admin.address, minter.address);
    await mintpass.waitForDeployment();
    console.log(`✅ MintPass deployed at: ${await mintpass.getAddress()}`);

    chainProviderUrl = network.config.url || "http://127.0.0.1:8545";
    console.log(`🔗 Using chain provider: ${chainProviderUrl}`);

    console.log("🚀 Starting IPFS...");
    const startKubo = await import('../src/test/start-kubo.js');
    const result = await startKubo.default();
    ipfsProcess = result.ipfsProcess;
    console.log("✅ IPFS daemon ready");

    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log("🌐 Setting up Plebbit instance for local testing...");
    const { default: Plebbit } = await import('@plebbit/plebbit-js');
    
    // Use exact plebbitOptions from Esteban's working example - NO default chain providers
    const plebbitOptions = {
      httpRoutersOptions: [],
      kuboRpcClientsOptions: ['http://127.0.0.1:5001/api/v0'], 
      updateInterval: 1000
      // DO NOT use default plebbit chain providers - use custom RPC in challenge settings instead
    };
    
    plebbit = await Plebbit(plebbitOptions);
    
    // Create second plebbit instance for publishing (Esteban's bug workaround)
    plebbitForPublishing = await Plebbit(plebbitOptions);
    console.log("✅ Plebbit instances created for local testing");
  });

  after(async function () {
    console.log("\n🧹 Cleaning up test environment...");
    
    if (plebbit) {
      try {
        await plebbit.destroy();
        console.log("✅ Plebbit destroyed");
      } catch (error) {
        console.log("⚠️ Error destroying plebbit:", error.message);
      }
    }

    if (plebbitForPublishing) {
      try {
        await plebbitForPublishing.destroy();
        console.log("✅ Plebbit for publishing destroyed");
      } catch (error) {
        console.log("⚠️ Error destroying plebbitForPublishing:", error.message);
      }
    }

    if (ipfsProcess) {
      try {
        ipfsProcess.kill('SIGTERM');
        console.log("✅ IPFS daemon stopped");
      } catch (error) {
        console.log("⚠️ Error stopping IPFS:", error.message);
      }
    }
  });

  it("Test 1: Publishing should fail when author has no NFT", async function () {
    this.timeout(120000);
    console.log("\n🧪 Test 1: Publishing should fail when author has no NFT");

    const authorSigner = await plebbitForPublishing.createSigner();
    const ethWallet = await getEthWalletFromPlebbitPrivateKey(authorSigner.privateKey, authorSigner.address, authorSigner.publicKey);
    console.log(`👤 Author plebbit address: ${authorSigner.address}`);
    console.log(`💳 Author ETH address: ${ethWallet.address}`);
    
    // Verify user doesn't have NFT
    const hasNFT = await mintpass.ownsTokenType(ethWallet.address, SMS_TOKEN_TYPE);
    expect(hasNFT).to.be.false;
    console.log("✅ Confirmed author doesn't own MintPass NFT");

    // Create subplebbit using the original plebbit instance
    const subplebbit = await plebbit.createSubplebbit({
      title: 'MintPass Test Community',
      description: 'Testing mintpass challenge integration with local publishing'
    });
    
    // Configure challenge with custom RPC URL and chainId (NO default chain providers)
    const settings = { ...subplebbit.settings };
    settings.challenges = [createChallengeSettings(await mintpass.getAddress(), chainProviderUrl, 31337)];
    await subplebbit.edit({ settings });
    console.log("✅ Subplebbit configured with challenges");
    
    // Start subplebbit and wait for it to be ready (critical step per Esteban)
    await subplebbit.start();
    await waitForCondition(subplebbit, (s) => typeof s.updatedAt === "number");
    console.log("✅ Subplebbit started and ready");

    try {
      // Create comment using DIFFERENT plebbit instance (Esteban's bug workaround)
      const comment = await plebbitForPublishing.createComment({
        signer: authorSigner,
        subplebbitAddress: subplebbit.address,
        title: 'Test comment without NFT',
        content: 'This comment should fail the mintpass challenge',
        // Set wallet information during creation
        author: { 
          wallets: {
            base: ethWallet
          } 
        }
      });

      // Wait for challengeverification and check challengeSuccess
      let challengeVerificationReceived = false;
      let challengeSuccessValue = null;
      let challengeErrorsValue = null;

      comment.on('challengeverification', (challengeVerification) => {
        console.log('✅ challengeverification received:', challengeVerification);
        challengeSuccessValue = challengeVerification.challengeSuccess;
        challengeErrorsValue = challengeVerification.challengeErrors;
        challengeVerificationReceived = true;
      });

      comment.on('challenge', (challenge) => {
        console.log("✅ challenge received:", challenge);
        comment.publishChallengeAnswers(['test']);
      });

      comment.on('publishingstatechange', (state) => {
        console.log(`📊 Publishing state: ${state}`);
      });

      console.log("📤 Publishing comment...");
      await comment.publish();

      // Wait for challengeverification
      await waitForCondition({}, () => challengeVerificationReceived, 30000);
      
            // Expect proper NFT ownership verification failure
      expect(challengeSuccessValue).to.be.false;
      expect(challengeErrorsValue['0']).to.include('You need a MintPass NFT');
      console.log("✅ Test 1 PASSED: challengeSuccess = false (correctly failed without NFT)");
      
    } finally {
      await subplebbit.stop();
      await subplebbit.delete();
      console.log("🧹 Subplebbit cleaned up");
    }
  });

  it("Test 2: Publishing should succeed when author has NFT", async function () {
    this.timeout(120000);
    console.log("\n🧪 Test 2: Publishing should succeed when author has NFT");

    const authorSigner = await plebbitForPublishing.createSigner();
    const ethWallet = await getEthWalletFromPlebbitPrivateKey(authorSigner.privateKey, authorSigner.address, authorSigner.publicKey);
    console.log(`👤 Author plebbit address: ${authorSigner.address}`);
    console.log(`💳 Author ETH address: ${ethWallet.address}`);
    
    // Mint NFT to the author wallet
    await mintpass.connect(minter).mint(ethWallet.address, SMS_TOKEN_TYPE);
    
    const hasNFT = await mintpass.ownsTokenType(ethWallet.address, SMS_TOKEN_TYPE);
    expect(hasNFT).to.be.true;
    console.log("✅ Confirmed author owns MintPass NFT");

    // Create subplebbit using the original plebbit instance
    const subplebbit = await plebbit.createSubplebbit({
      title: 'MintPass Test Community',
      description: 'Testing mintpass challenge integration with local publishing'
    });
    
    // Configure challenge with custom RPC URL and chainId (as per Esteban's requirements)
    const settings = { ...subplebbit.settings };
    settings.challenges = [createChallengeSettings(await mintpass.getAddress(), chainProviderUrl, 31337)];
    await subplebbit.edit({ settings });
    console.log("✅ Subplebbit configured with challenges");
    
    // Start subplebbit and wait for it to be ready (critical step per Esteban)
    await subplebbit.start();
    await waitForCondition(subplebbit, (s) => typeof s.updatedAt === "number");
    console.log("✅ Subplebbit started and ready");

    try {
      // Create comment using DIFFERENT plebbit instance (Esteban's bug workaround)
      const comment = await plebbitForPublishing.createComment({
        signer: authorSigner,
        subplebbitAddress: subplebbit.address,
        title: 'Test comment with NFT',
        content: 'This comment should pass the mintpass challenge',
        // Set wallet information during creation
        author: { 
          wallets: {
            base: ethWallet
          } 
        }
      });

      // Wait for challengeverification and check challengeSuccess
      let challengeVerificationReceived = false;
      let challengeSuccessValue = null;
      let challengeErrorsValue = null;

      comment.on('challengeverification', (challengeVerification) => {
        console.log('✅ challengeverification received:', challengeVerification);
        challengeSuccessValue = challengeVerification.challengeSuccess;
        challengeErrorsValue = challengeVerification.challengeErrors;
        challengeVerificationReceived = true;
      });

      comment.on('challenge', (challenge) => {
        console.log("✅ challenge received:", challenge);
        comment.publishChallengeAnswers(['test']);
      });

      comment.on('publishingstatechange', (state) => {
        console.log(`📊 Publishing state: ${state}`);
      });

      console.log("📤 Publishing comment...");
      await comment.publish();

      // Wait for challengeverification
      await waitForCondition({}, () => challengeVerificationReceived, 30000);
      
            // Expect successful NFT ownership verification
      expect(challengeSuccessValue).to.be.true;
      console.log("✅ Test 2 PASSED: challengeSuccess = true (correctly verified NFT ownership)");
      
    } finally {
      await subplebbit.stop();
      await subplebbit.delete();
      console.log("🧹 Subplebbit cleaned up");
    }
  });
}); 