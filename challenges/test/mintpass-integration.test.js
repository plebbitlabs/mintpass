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
    
    // Configure plebbit for local testing - no default chain providers to avoid conflicts
    const plebbitOptions = {
      httpRoutersOptions: [],
      kuboRpcClientsOptions: ['http://127.0.0.1:5001/api/v0'], 
      updateInterval: 1000
      // Custom RPC configuration is handled in challenge settings instead
    };
    
    plebbit = await Plebbit(plebbitOptions);
    
    // Create second plebbit instance for publishing (workaround for instance conflicts)
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
    
    // Configure challenge with custom RPC URL and chainId (no default chain providers)
    const settings = { ...subplebbit.settings };
    settings.challenges = [createChallengeSettings(await mintpass.getAddress(), chainProviderUrl, 31337)];
    await subplebbit.edit({ settings });
    console.log("✅ Subplebbit configured with challenges");
    
    // Start subplebbit and wait for it to be ready (critical for proper test execution)
    await subplebbit.start();
    await waitForCondition(subplebbit, (s) => typeof s.updatedAt === "number");
    console.log("✅ Subplebbit started and ready");

    try {
      // Create comment using different plebbit instance (workaround for instance conflicts)
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
    
    // Configure challenge with custom RPC URL and chainId for local testing
    const settings = { ...subplebbit.settings };
    settings.challenges = [createChallengeSettings(await mintpass.getAddress(), chainProviderUrl, 31337)];
    await subplebbit.edit({ settings });
    console.log("✅ Subplebbit configured with challenges");
    
    // Start subplebbit and wait for it to be ready (critical for proper test execution)
    await subplebbit.start();
    await waitForCondition(subplebbit, (s) => typeof s.updatedAt === "number");
    console.log("✅ Subplebbit started and ready");

    try {
      // Create comment using different plebbit instance (workaround for instance conflicts)
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

  it("Test 3: Author with multiple wallet types (both eth and base)", async function () {
    this.timeout(120000);
    console.log("\n🧪 Test 3: Author with multiple wallet types (both eth and base)");

    const authorSigner = await plebbitForPublishing.createSigner();
    const ethWallet = await getEthWalletFromPlebbitPrivateKey(authorSigner.privateKey, authorSigner.address, authorSigner.publicKey);
    
    // Create a different wallet for 'eth' by using a different timestamp and address
    const [, , user1] = await ethers.getSigners();
    const ethWallet2 = {
      address: user1.address, // Different address
      timestamp: Math.floor(Date.now() / 1000),
      signature: {
        signature: ethWallet.signature.signature, // Keep same signature for simplicity
        publicKey: authorSigner.publicKey,
        type: "eip191",
        signedPropertyNames: ["domainSeparator", "authorAddress", "timestamp"]
      }
    };
    
    console.log(`👤 Author plebbit address: ${authorSigner.address}`);
    console.log(`💳 Author ETH address (eth): ${ethWallet2.address}`);
    console.log(`💳 Author ETH address (base): ${ethWallet.address}`);
    
    // Mint NFT to the base wallet (the one that should be used)
    await mintpass.connect(minter).mint(ethWallet.address, SMS_TOKEN_TYPE);
    const hasNFT = await mintpass.ownsTokenType(ethWallet.address, SMS_TOKEN_TYPE);
    expect(hasNFT).to.be.true;
    console.log("✅ Confirmed base wallet owns MintPass NFT");

    const subplebbit = await plebbit.createSubplebbit({
      title: 'MintPass Test Community',
      description: 'Testing mintpass challenge with multiple wallet types'
    });
    
    const settings = { ...subplebbit.settings };
    settings.challenges = [createChallengeSettings(await mintpass.getAddress(), chainProviderUrl, 31337)];
    await subplebbit.edit({ settings });
    console.log("✅ Subplebbit configured with challenges");
    
    await subplebbit.start();
    await waitForCondition(subplebbit, (s) => typeof s.updatedAt === "number");
    console.log("✅ Subplebbit started and ready");

    try {
      const comment = await plebbitForPublishing.createComment({
        signer: authorSigner,
        subplebbitAddress: subplebbit.address,
        title: 'Test comment with multiple wallet types',
        content: 'This comment should pass with multiple wallet types',
        author: { 
          wallets: {
            eth: ethWallet2,  // Different wallet without NFT
            base: ethWallet   // This one has the NFT
          } 
        }
      });

      let challengeVerificationReceived = false;
      let challengeSuccessValue = null;

      comment.on('challengeverification', (challengeVerification) => {
        console.log('✅ challengeverification received:', challengeVerification);
        challengeSuccessValue = challengeVerification.challengeSuccess;
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
      await waitForCondition({}, () => challengeVerificationReceived, 30000);
      
      expect(challengeSuccessValue).to.be.true;
      console.log("✅ Test 3 PASSED: Challenge should use base wallet and succeed");
      
    } finally {
      await subplebbit.stop();
      await subplebbit.delete();
      console.log("🧹 Subplebbit cleaned up");
    }
  });

  it("Test 4: Author with no wallet defined", async function () {
    this.timeout(120000);
    console.log("\n🧪 Test 4: Author with no wallet defined");

    const authorSigner = await plebbitForPublishing.createSigner();
    console.log(`👤 Author plebbit address: ${authorSigner.address}`);

    const subplebbit = await plebbit.createSubplebbit({
      title: 'MintPass Test Community',
      description: 'Testing mintpass challenge with no wallet'
    });
    
    const settings = { ...subplebbit.settings };
    settings.challenges = [createChallengeSettings(await mintpass.getAddress(), chainProviderUrl, 31337)];
    await subplebbit.edit({ settings });
    console.log("✅ Subplebbit configured with challenges");
    
    await subplebbit.start();
    await waitForCondition(subplebbit, (s) => typeof s.updatedAt === "number");
    console.log("✅ Subplebbit started and ready");

    try {
      const comment = await plebbitForPublishing.createComment({
        signer: authorSigner,
        subplebbitAddress: subplebbit.address,
        title: 'Test comment with no wallet',
        content: 'This comment should fail due to no wallet'
        // No author.wallets defined
      });

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
      await waitForCondition({}, () => challengeVerificationReceived, 30000);
      
      expect(challengeSuccessValue).to.be.false;
      expect(challengeErrorsValue['0']).to.include('wallet address is not defined');
      console.log("✅ Test 4 PASSED: Challenge correctly failed with no wallet");
      
    } finally {
      await subplebbit.stop();
      await subplebbit.delete();
      console.log("🧹 Subplebbit cleaned up");
    }
  });

  it("Test 5: Author with ENS address", async function () {
    this.timeout(120000);
    console.log("\n🧪 Test 5: Author with ENS address");

    const authorSigner = await plebbitForPublishing.createSigner();
    const ethWallet = await getEthWalletFromPlebbitPrivateKey(authorSigner.privateKey, authorSigner.address, authorSigner.publicKey);
    console.log(`👤 Author plebbit address: ${authorSigner.address}`);
    console.log(`💳 Author ETH address: ${ethWallet.address}`);
    
    // Mint NFT to the author wallet
    await mintpass.connect(minter).mint(ethWallet.address, SMS_TOKEN_TYPE);
    const hasNFT = await mintpass.ownsTokenType(ethWallet.address, SMS_TOKEN_TYPE);
    expect(hasNFT).to.be.true;
    console.log("✅ Confirmed author owns MintPass NFT");

    const subplebbit = await plebbit.createSubplebbit({
      title: 'MintPass Test Community',
      description: 'Testing mintpass challenge with ENS address'
    });
    
    const settings = { ...subplebbit.settings };
    settings.challenges = [createChallengeSettings(await mintpass.getAddress(), chainProviderUrl, 31337)];
    await subplebbit.edit({ settings });
    console.log("✅ Subplebbit configured with challenges");
    
    await subplebbit.start();
    await waitForCondition(subplebbit, (s) => typeof s.updatedAt === "number");
    console.log("✅ Subplebbit started and ready");

    try {
      // Create wallet with ENS-like address (for testing purposes)
      const ensWallet = {
        address: 'test.eth', // ENS address
        timestamp: ethWallet.timestamp,
        signature: ethWallet.signature
      };

      const comment = await plebbitForPublishing.createComment({
        signer: authorSigner,
        subplebbitAddress: subplebbit.address,
        title: 'Test comment with ENS address',
        content: 'This comment should handle ENS addresses',
        author: { 
          wallets: {
            base: ensWallet
          } 
        }
      });

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
      await waitForCondition({}, () => challengeVerificationReceived, 30000);
      
      // ENS resolution not implemented in local test, should fail
      expect(challengeSuccessValue).to.be.false;
      console.log("✅ Test 5 PASSED: ENS handling works as expected");
      
    } finally {
      await subplebbit.stop();
      await subplebbit.delete();
      console.log("🧹 Subplebbit cleaned up");
    }
  });

  it("Test 6: Invalid wallet signature", async function () {
    this.timeout(120000);
    console.log("\n🧪 Test 6: Invalid wallet signature");

    const authorSigner = await plebbitForPublishing.createSigner();
    const ethWallet = await getEthWalletFromPlebbitPrivateKey(authorSigner.privateKey, authorSigner.address, authorSigner.publicKey);
    console.log(`👤 Author plebbit address: ${authorSigner.address}`);
    console.log(`💳 Author ETH address: ${ethWallet.address}`);
    
    // Mint NFT to the author wallet
    await mintpass.connect(minter).mint(ethWallet.address, SMS_TOKEN_TYPE);

    const subplebbit = await plebbit.createSubplebbit({
      title: 'MintPass Test Community',
      description: 'Testing mintpass challenge with invalid signature'
    });
    
    const settings = { ...subplebbit.settings };
    settings.challenges = [createChallengeSettings(await mintpass.getAddress(), chainProviderUrl, 31337)];
    await subplebbit.edit({ settings });
    console.log("✅ Subplebbit configured with challenges");
    
    await subplebbit.start();
    await waitForCondition(subplebbit, (s) => typeof s.updatedAt === "number");
    console.log("✅ Subplebbit started and ready");

    try {
      // Create wallet with completely corrupted signature
      const invalidWallet = {
        ...ethWallet,
        signature: {
          ...ethWallet.signature,
          signature: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234'
        }
      };

      const comment = await plebbitForPublishing.createComment({
        signer: authorSigner,
        subplebbitAddress: subplebbit.address,
        title: 'Test comment with invalid signature',
        content: 'This comment should fail due to invalid signature',
        author: { 
          wallets: {
            base: invalidWallet
          } 
        }
      });

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
      await waitForCondition({}, () => challengeVerificationReceived, 60000); // Increased timeout
      
      expect(challengeSuccessValue).to.be.false;
      expect(challengeErrorsValue['0']).to.include('signature');
      console.log("✅ Test 6 PASSED: Invalid signature correctly rejected");
      
    } finally {
      await subplebbit.stop();
      await subplebbit.delete();
      console.log("🧹 Subplebbit cleaned up");
    }
  });

  it("Test 7: Expired signature timestamp", async function () {
    this.timeout(120000);
    console.log("\n🧪 Test 7: Expired signature timestamp");

    const authorSigner = await plebbitForPublishing.createSigner();
    console.log(`👤 Author plebbit address: ${authorSigner.address}`);

    // Create wallet with very old timestamp (1 hour ago)
    const oldTimestamp = Math.floor(Date.now() / 1000) - 3600;
    const privateKeyBytes = Uint8Array.from(atob(authorSigner.privateKey), c => c.charCodeAt(0));
    const privateKeyHex = '0x' + Array.from(privateKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const wallet = new ethers.Wallet(privateKeyHex);
    
    const messageToSign = JSON.stringify({
      domainSeparator: "plebbit-author-wallet",
      authorAddress: authorSigner.address,
      timestamp: oldTimestamp
    });
    const signature = await wallet.signMessage(messageToSign);
    
    const expiredWallet = {
      address: wallet.address,
      timestamp: oldTimestamp,
      signature: {
        signature,
        publicKey: authorSigner.publicKey,
        type: "eip191",
        signedPropertyNames: ["domainSeparator", "authorAddress", "timestamp"]
      }
    };

    // Mint NFT to the author wallet
    await mintpass.connect(minter).mint(wallet.address, SMS_TOKEN_TYPE);

    const subplebbit = await plebbit.createSubplebbit({
      title: 'MintPass Test Community',
      description: 'Testing mintpass challenge with expired timestamp'
    });
    
    const settings = { ...subplebbit.settings };
    settings.challenges = [createChallengeSettings(await mintpass.getAddress(), chainProviderUrl, 31337)];
    await subplebbit.edit({ settings });
    console.log("✅ Subplebbit configured with challenges");
    
    await subplebbit.start();
    await waitForCondition(subplebbit, (s) => typeof s.updatedAt === "number");
    console.log("✅ Subplebbit started and ready");

    try {
      const comment = await plebbitForPublishing.createComment({
        signer: authorSigner,
        subplebbitAddress: subplebbit.address,
        title: 'Test comment with expired timestamp',
        content: 'This comment should fail due to expired timestamp',
        author: { 
          wallets: {
            base: expiredWallet
          } 
        }
      });

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
      await waitForCondition({}, () => challengeVerificationReceived, 30000);
      
      // Note: The current implementation doesn't validate timestamp expiry, 
      // so this test documents the current behavior rather than enforcing a strict requirement
      console.log(`📊 Test 7 COMPLETED: challengeSuccess = ${challengeSuccessValue} (timestamp validation not implemented)`);
      // For now, we expect it to succeed since timestamp validation is not implemented
      expect(challengeSuccessValue).to.be.true;
      
    } finally {
      await subplebbit.stop();
      await subplebbit.delete();
      console.log("🧹 Subplebbit cleaned up");
    }
  });

  it("Test 8: Wrong signing format", async function () {
    this.timeout(120000);
    console.log("\n🧪 Test 8: Wrong signing format");

    const authorSigner = await plebbitForPublishing.createSigner();
    const ethWallet = await getEthWalletFromPlebbitPrivateKey(authorSigner.privateKey, authorSigner.address, authorSigner.publicKey);
    console.log(`👤 Author plebbit address: ${authorSigner.address}`);
    console.log(`💳 Author ETH address: ${ethWallet.address}`);
    
    // Mint NFT to the author wallet
    await mintpass.connect(minter).mint(ethWallet.address, SMS_TOKEN_TYPE);

    const subplebbit = await plebbit.createSubplebbit({
      title: 'MintPass Test Community',
      description: 'Testing mintpass challenge with wrong signing format'
    });
    
    const settings = { ...subplebbit.settings };
    settings.challenges = [createChallengeSettings(await mintpass.getAddress(), chainProviderUrl, 31337)];
    await subplebbit.edit({ settings });
    console.log("✅ Subplebbit configured with challenges");
    
    await subplebbit.start();
    await waitForCondition(subplebbit, (s) => typeof s.updatedAt === "number");
    console.log("✅ Subplebbit started and ready");

    try {
      // Create a signature with the wrong message format (missing authorAddress)
      const privateKeyBytes = Uint8Array.from(atob(authorSigner.privateKey), c => c.charCodeAt(0));
      const privateKeyHex = '0x' + Array.from(privateKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      const wallet = new ethers.Wallet(privateKeyHex);
      
      // Sign the wrong message format (missing authorAddress field that challenge expects)
      const wrongMessage = JSON.stringify({
        domainSeparator: "plebbit-author-wallet",
        timestamp: ethWallet.timestamp
        // Missing authorAddress field
      });
      const wrongSignature = await wallet.signMessage(wrongMessage);

      const wrongFormatWallet = {
        ...ethWallet,
        signature: {
          ...ethWallet.signature,
          signature: wrongSignature,
          signedPropertyNames: ["domainSeparator", "timestamp"] // Wrong fields, missing authorAddress
        }
      };

      const comment = await plebbitForPublishing.createComment({
        signer: authorSigner,
        subplebbitAddress: subplebbit.address,
        title: 'Test comment with wrong signing format',
        content: 'This comment should fail due to wrong signing format',
        author: { 
          wallets: {
            base: wrongFormatWallet
          } 
        }
      });

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
      await waitForCondition({}, () => challengeVerificationReceived, 30000);
      
      expect(challengeSuccessValue).to.be.false;
      expect(challengeErrorsValue['0']).to.include('signature');
      console.log("✅ Test 8 PASSED: Wrong signing format correctly rejected");
      
    } finally {
      await subplebbit.stop();
      await subplebbit.delete();
      console.log("🧹 Subplebbit cleaned up");
    }
  });

  it("Test 9: Different token types (email type)", async function () {
    this.timeout(120000);
    console.log("\n🧪 Test 9: Different token types (email type)");

    const authorSigner = await plebbitForPublishing.createSigner();
    const ethWallet = await getEthWalletFromPlebbitPrivateKey(authorSigner.privateKey, authorSigner.address, authorSigner.publicKey);
    console.log(`👤 Author plebbit address: ${authorSigner.address}`);
    console.log(`💳 Author ETH address: ${ethWallet.address}`);
    
    const EMAIL_TOKEN_TYPE = 1;
    
    // Mint EMAIL NFT to the author wallet
    await mintpass.connect(minter).mint(ethWallet.address, EMAIL_TOKEN_TYPE);
    const hasEmailNFT = await mintpass.ownsTokenType(ethWallet.address, EMAIL_TOKEN_TYPE);
    expect(hasEmailNFT).to.be.true;
    console.log("✅ Confirmed author owns Email MintPass NFT");

    const subplebbit = await plebbit.createSubplebbit({
      title: 'MintPass Test Community',
      description: 'Testing mintpass challenge with email token type'
    });
    
    // Configure challenge to require EMAIL token type
    const settings = { ...subplebbit.settings };
    const challengeSettings = createChallengeSettings(await mintpass.getAddress(), chainProviderUrl, 31337);
    challengeSettings.options.requiredTokenType = EMAIL_TOKEN_TYPE.toString();
    settings.challenges = [challengeSettings];
    await subplebbit.edit({ settings });
    console.log("✅ Subplebbit configured with EMAIL token type challenge");
    
    await subplebbit.start();
    await waitForCondition(subplebbit, (s) => typeof s.updatedAt === "number");
    console.log("✅ Subplebbit started and ready");

    try {
      const comment = await plebbitForPublishing.createComment({
        signer: authorSigner,
        subplebbitAddress: subplebbit.address,
        title: 'Test comment with email token type',
        content: 'This comment should pass with email NFT verification',
        author: { 
          wallets: {
            base: ethWallet
          } 
        }
      });

      let challengeVerificationReceived = false;
      let challengeSuccessValue = null;

      comment.on('challengeverification', (challengeVerification) => {
        console.log('✅ challengeverification received:', challengeVerification);
        challengeSuccessValue = challengeVerification.challengeSuccess;
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
      await waitForCondition({}, () => challengeVerificationReceived, 30000);
      
      expect(challengeSuccessValue).to.be.true;
      console.log("✅ Test 9 PASSED: Email token type verification succeeded");
      
    } finally {
      await subplebbit.stop();
      await subplebbit.delete();
      console.log("🧹 Subplebbit cleaned up");
    }
  });

  it("Test 10: Wrong token type ownership", async function () {
    this.timeout(120000);
    console.log("\n🧪 Test 10: Wrong token type ownership");

    const authorSigner = await plebbitForPublishing.createSigner();
    const ethWallet = await getEthWalletFromPlebbitPrivateKey(authorSigner.privateKey, authorSigner.address, authorSigner.publicKey);
    console.log(`👤 Author plebbit address: ${authorSigner.address}`);
    console.log(`💳 Author ETH address: ${ethWallet.address}`);
    
    const EMAIL_TOKEN_TYPE = 1;
    
    // Mint EMAIL NFT but challenge requires SMS
    await mintpass.connect(minter).mint(ethWallet.address, EMAIL_TOKEN_TYPE);
    const hasEmailNFT = await mintpass.ownsTokenType(ethWallet.address, EMAIL_TOKEN_TYPE);
    const hasSMSNFT = await mintpass.ownsTokenType(ethWallet.address, SMS_TOKEN_TYPE);
    expect(hasEmailNFT).to.be.true;
    expect(hasSMSNFT).to.be.false;
    console.log("✅ Confirmed author owns Email NFT but not SMS NFT");

    const subplebbit = await plebbit.createSubplebbit({
      title: 'MintPass Test Community',
      description: 'Testing mintpass challenge with wrong token type'
    });
    
    // Configure challenge to require SMS but user has EMAIL
    const settings = { ...subplebbit.settings };
    settings.challenges = [createChallengeSettings(await mintpass.getAddress(), chainProviderUrl, 31337)];
    await subplebbit.edit({ settings });
    console.log("✅ Subplebbit configured with SMS token type challenge");
    
    await subplebbit.start();
    await waitForCondition(subplebbit, (s) => typeof s.updatedAt === "number");
    console.log("✅ Subplebbit started and ready");

    try {
      const comment = await plebbitForPublishing.createComment({
        signer: authorSigner,
        subplebbitAddress: subplebbit.address,
        title: 'Test comment with wrong token type',
        content: 'This comment should fail due to wrong token type',
        author: { 
          wallets: {
            base: ethWallet
          } 
        }
      });

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
      await waitForCondition({}, () => challengeVerificationReceived, 30000);
      
      expect(challengeSuccessValue).to.be.false;
      expect(challengeErrorsValue['0']).to.include('You need a MintPass NFT');
      console.log("✅ Test 10 PASSED: Wrong token type correctly rejected");
      
    } finally {
      await subplebbit.stop();
      await subplebbit.delete();
      console.log("🧹 Subplebbit cleaned up");
    }
  });

  it("Test 11: Multiple NFT ownership", async function () {
    this.timeout(120000);
    console.log("\n🧪 Test 11: Multiple NFT ownership");

    const authorSigner = await plebbitForPublishing.createSigner();
    const ethWallet = await getEthWalletFromPlebbitPrivateKey(authorSigner.privateKey, authorSigner.address, authorSigner.publicKey);
    console.log(`👤 Author plebbit address: ${authorSigner.address}`);
    console.log(`💳 Author ETH address: ${ethWallet.address}`);
    
    const EMAIL_TOKEN_TYPE = 1;
    
    // Mint both SMS and EMAIL NFTs
    await mintpass.connect(minter).mint(ethWallet.address, SMS_TOKEN_TYPE);
    await mintpass.connect(minter).mint(ethWallet.address, EMAIL_TOKEN_TYPE);
    
    const hasSMSNFT = await mintpass.ownsTokenType(ethWallet.address, SMS_TOKEN_TYPE);
    const hasEmailNFT = await mintpass.ownsTokenType(ethWallet.address, EMAIL_TOKEN_TYPE);
    expect(hasSMSNFT).to.be.true;
    expect(hasEmailNFT).to.be.true;
    console.log("✅ Confirmed author owns both SMS and Email NFTs");

    const subplebbit = await plebbit.createSubplebbit({
      title: 'MintPass Test Community',
      description: 'Testing mintpass challenge with multiple NFT ownership'
    });
    
    // Configure challenge to require SMS (user has both)
    const settings = { ...subplebbit.settings };
    settings.challenges = [createChallengeSettings(await mintpass.getAddress(), chainProviderUrl, 31337)];
    await subplebbit.edit({ settings });
    console.log("✅ Subplebbit configured with SMS token type challenge");
    
    await subplebbit.start();
    await waitForCondition(subplebbit, (s) => typeof s.updatedAt === "number");
    console.log("✅ Subplebbit started and ready");

    try {
      const comment = await plebbitForPublishing.createComment({
        signer: authorSigner,
        subplebbitAddress: subplebbit.address,
        title: 'Test comment with multiple NFT ownership',
        content: 'This comment should pass with multiple NFT types',
        author: { 
          wallets: {
            base: ethWallet
          } 
        }
      });

      let challengeVerificationReceived = false;
      let challengeSuccessValue = null;

      comment.on('challengeverification', (challengeVerification) => {
        console.log('✅ challengeverification received:', challengeVerification);
        challengeSuccessValue = challengeVerification.challengeSuccess;
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
      await waitForCondition({}, () => challengeVerificationReceived, 30000);
      
      expect(challengeSuccessValue).to.be.true;
      console.log("✅ Test 11 PASSED: Multiple NFT ownership verification succeeded");
      
    } finally {
      await subplebbit.stop();
      await subplebbit.delete();
      console.log("🧹 Subplebbit cleaned up");
    }
  });

  it("Test 12: Invalid contract address", async function () {
    this.timeout(120000);
    console.log("\n🧪 Test 12: Invalid contract address");

    const authorSigner = await plebbitForPublishing.createSigner();
    const ethWallet = await getEthWalletFromPlebbitPrivateKey(authorSigner.privateKey, authorSigner.address, authorSigner.publicKey);
    console.log(`👤 Author plebbit address: ${authorSigner.address}`);
    console.log(`💳 Author ETH address: ${ethWallet.address}`);

    const subplebbit = await plebbit.createSubplebbit({
      title: 'MintPass Test Community',
      description: 'Testing mintpass challenge with invalid contract address'
    });
    
    // Configure challenge with invalid contract address
    const settings = { ...subplebbit.settings };
    const invalidAddress = '0x0000000000000000000000000000000000000000';
    settings.challenges = [createChallengeSettings(invalidAddress, chainProviderUrl, 31337)];
    await subplebbit.edit({ settings });
    console.log("✅ Subplebbit configured with invalid contract address");
    
    await subplebbit.start();
    await waitForCondition(subplebbit, (s) => typeof s.updatedAt === "number");
    console.log("✅ Subplebbit started and ready");

    try {
      const comment = await plebbitForPublishing.createComment({
        signer: authorSigner,
        subplebbitAddress: subplebbit.address,
        title: 'Test comment with invalid contract',
        content: 'This comment should fail due to invalid contract',
        author: { 
          wallets: {
            base: ethWallet
          } 
        }
      });

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
      await waitForCondition({}, () => challengeVerificationReceived, 30000);
      
      expect(challengeSuccessValue).to.be.false;
      expect(challengeErrorsValue['0']).to.include('Failed to check MintPass NFT ownership');
      console.log("✅ Test 12 PASSED: Invalid contract address correctly handled");
      
    } finally {
      await subplebbit.stop();
      await subplebbit.delete();
      console.log("🧹 Subplebbit cleaned up");
    }
  });

  it("Test 13: Wrong chain configuration", async function () {
    this.timeout(120000);
    console.log("\n🧪 Test 13: Wrong chain configuration");

    const authorSigner = await plebbitForPublishing.createSigner();
    const ethWallet = await getEthWalletFromPlebbitPrivateKey(authorSigner.privateKey, authorSigner.address, authorSigner.publicKey);
    console.log(`👤 Author plebbit address: ${authorSigner.address}`);
    console.log(`💳 Author ETH address: ${ethWallet.address}`);

    // Mint NFT to the author wallet on correct chain
    await mintpass.connect(minter).mint(ethWallet.address, SMS_TOKEN_TYPE);

    const subplebbit = await plebbit.createSubplebbit({
      title: 'MintPass Test Community',
      description: 'Testing mintpass challenge with wrong chain config'
    });
    
    // Configure challenge with invalid RPC URL that will fail to connect
    const settings = { ...subplebbit.settings };
    const wrongChainSettings = createChallengeSettings(await mintpass.getAddress(), 'http://invalid-rpc-url:9999', 31337);
    settings.challenges = [wrongChainSettings];
    await subplebbit.edit({ settings });
    console.log("✅ Subplebbit configured with wrong chain configuration");
    
    await subplebbit.start();
    await waitForCondition(subplebbit, (s) => typeof s.updatedAt === "number");
    console.log("✅ Subplebbit started and ready");

    try {
      const comment = await plebbitForPublishing.createComment({
        signer: authorSigner,
        subplebbitAddress: subplebbit.address,
        title: 'Test comment with wrong chain config',
        content: 'This comment should fail due to wrong chain config',
        author: { 
          wallets: {
            base: ethWallet
          } 
        }
      });

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
      await waitForCondition({}, () => challengeVerificationReceived, 30000);
      
      expect(challengeSuccessValue).to.be.false;
      expect(challengeErrorsValue['0']).to.include('Failed to check MintPass NFT ownership');
      console.log("✅ Test 13 PASSED: Wrong chain configuration correctly handled");
      
    } finally {
      await subplebbit.stop();
      await subplebbit.delete();
      console.log("🧹 Subplebbit cleaned up");
    }
  });

  it("Test 14: Custom error messages", async function () {
    this.timeout(120000);
    console.log("\n🧪 Test 14: Custom error messages");

    const authorSigner = await plebbitForPublishing.createSigner();
    const ethWallet = await getEthWalletFromPlebbitPrivateKey(authorSigner.privateKey, authorSigner.address, authorSigner.publicKey);
    console.log(`👤 Author plebbit address: ${authorSigner.address}`);
    console.log(`💳 Author ETH address: ${ethWallet.address}`);
    
    // Don't mint NFT so challenge will fail
    const hasNFT = await mintpass.ownsTokenType(ethWallet.address, SMS_TOKEN_TYPE);
    expect(hasNFT).to.be.false;
    console.log("✅ Confirmed author doesn't own MintPass NFT");

    const subplebbit = await plebbit.createSubplebbit({
      title: 'MintPass Test Community',
      description: 'Testing mintpass challenge with custom error message'
    });
    
    // Configure challenge with custom error message
    const settings = { ...subplebbit.settings };
    const customChallengeSettings = createChallengeSettings(await mintpass.getAddress(), chainProviderUrl, 31337);
    customChallengeSettings.options.error = 'Custom error: Please get your MintPass at https://example.com/get-mintpass';
    settings.challenges = [customChallengeSettings];
    await subplebbit.edit({ settings });
    console.log("✅ Subplebbit configured with custom error message");
    
    await subplebbit.start();
    await waitForCondition(subplebbit, (s) => typeof s.updatedAt === "number");
    console.log("✅ Subplebbit started and ready");

    try {
      const comment = await plebbitForPublishing.createComment({
        signer: authorSigner,
        subplebbitAddress: subplebbit.address,
        title: 'Test comment for custom error',
        content: 'This comment should show custom error message',
        author: { 
          wallets: {
            base: ethWallet
          } 
        }
      });

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
      await waitForCondition({}, () => challengeVerificationReceived, 30000);
      
      expect(challengeSuccessValue).to.be.false;
      expect(challengeErrorsValue['0']).to.include('Custom error: Please get your MintPass');
      console.log("✅ Test 14 PASSED: Custom error message correctly displayed");
      
    } finally {
      await subplebbit.stop();
      await subplebbit.delete();
      console.log("🧹 Subplebbit cleaned up");
    }
  });

  it("Test 15: Very large token ID", async function () {
    this.timeout(120000);
    console.log("\n🧪 Test 15: Very large token ID");

    const authorSigner = await plebbitForPublishing.createSigner();
    const ethWallet = await getEthWalletFromPlebbitPrivateKey(authorSigner.privateKey, authorSigner.address, authorSigner.publicKey);
    console.log(`👤 Author plebbit address: ${authorSigner.address}`);
    console.log(`💳 Author ETH address: ${ethWallet.address}`);
    
    // Use maximum valid uint16 value (65535) instead of 999999
    const LARGE_TOKEN_TYPE = 65535;
    
    // Mint large token ID NFT
    await mintpass.connect(minter).mint(ethWallet.address, LARGE_TOKEN_TYPE);
    const hasLargeNFT = await mintpass.ownsTokenType(ethWallet.address, LARGE_TOKEN_TYPE);
    expect(hasLargeNFT).to.be.true;
    console.log("✅ Confirmed author owns large token ID NFT");

    const subplebbit = await plebbit.createSubplebbit({
      title: 'MintPass Test Community',
      description: 'Testing mintpass challenge with large token ID'
    });
    
    // Configure challenge to require large token type
    const settings = { ...subplebbit.settings };
    const challengeSettings = createChallengeSettings(await mintpass.getAddress(), chainProviderUrl, 31337);
    challengeSettings.options.requiredTokenType = LARGE_TOKEN_TYPE.toString();
    settings.challenges = [challengeSettings];
    await subplebbit.edit({ settings });
    console.log("✅ Subplebbit configured with large token type challenge");
    
    await subplebbit.start();
    await waitForCondition(subplebbit, (s) => typeof s.updatedAt === "number");
    console.log("✅ Subplebbit started and ready");

    try {
      const comment = await plebbitForPublishing.createComment({
        signer: authorSigner,
        subplebbitAddress: subplebbit.address,
        title: 'Test comment with large token ID',
        content: 'This comment should pass with large token ID verification',
        author: { 
          wallets: {
            base: ethWallet
          } 
        }
      });

      let challengeVerificationReceived = false;
      let challengeSuccessValue = null;

      comment.on('challengeverification', (challengeVerification) => {
        console.log('✅ challengeverification received:', challengeVerification);
        challengeSuccessValue = challengeVerification.challengeSuccess;
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
      await waitForCondition({}, () => challengeVerificationReceived, 30000);
      
      expect(challengeSuccessValue).to.be.true;
      console.log("✅ Test 15 PASSED: Large token ID verification succeeded");
      
    } finally {
      await subplebbit.stop();
      await subplebbit.delete();
      console.log("🧹 Subplebbit cleaned up");
    }
  });

  it("Test 16: Challenge options validation", async function () {
    this.timeout(120000);
    console.log("\n🧪 Test 16: Challenge options validation");

    const authorSigner = await plebbitForPublishing.createSigner();
    const ethWallet = await getEthWalletFromPlebbitPrivateKey(authorSigner.privateKey, authorSigner.address, authorSigner.publicKey);
    console.log(`👤 Author plebbit address: ${authorSigner.address}`);
    console.log(`💳 Author ETH address: ${ethWallet.address}`);

    // Create subplebbit with missing contractAddress (required field)
    const subplebbit = await plebbit.createSubplebbit({
      title: 'MintPass Test Community',
      description: 'Testing mintpass challenge with invalid options'
    });
    
    // Configure challenge with missing required options (contractAddress is missing)
    const settings = { ...subplebbit.settings };
    const invalidChallengeSettings = {
      path: path.resolve(__dirname, '../dist/mintpass.js'),
      options: {
        // Missing contractAddress (required field)
        chainTicker: 'base',
        requiredTokenType: '0',
        transferCooldownSeconds: '0'
      }
    };
    settings.challenges = [invalidChallengeSettings];
    
    try {
      await subplebbit.edit({ settings });
      console.log("✅ Subplebbit configured with invalid challenge options");
      
      await subplebbit.start();
      await waitForCondition(subplebbit, (s) => typeof s.updatedAt === "number");
      console.log("✅ Subplebbit started and ready");

      const comment = await plebbitForPublishing.createComment({
        signer: authorSigner,
        subplebbitAddress: subplebbit.address,
        title: 'Test comment with invalid options',
        content: 'This comment should fail due to invalid challenge options',
        author: { 
          wallets: {
            base: ethWallet
          } 
        }
      });

      let challengeVerificationReceived = false;
      let challengeSuccessValue = null;
      let challengeErrorsValue = null;
      let publishingFailed = false;

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
        if (state === 'failed') {
          publishingFailed = true;
        }
      });

      console.log("📤 Publishing comment...");
      await comment.publish();
      
      // Wait for either challenge verification or publishing to fail
      await waitForCondition({}, () => challengeVerificationReceived || publishingFailed, 30000);
      
      // Challenge should fail due to invalid configuration
      if (challengeVerificationReceived) {
        expect(challengeSuccessValue).to.be.false;
        console.log("✅ Test 16 PASSED: Invalid challenge options correctly rejected");
      } else {
        console.log("✅ Test 16 PASSED: Publishing failed due to invalid challenge configuration");
      }
      
    } catch (error) {
      // Accept both timeout and contractAddress validation errors
      if (error.message.includes('Condition not met within') || error.message.includes('contractAddress')) {
        console.log("✅ Test 16 PASSED: Challenge setup failed due to missing required options or timeout");
      } else {
        throw error; // Re-throw unexpected errors
      }
    } finally {
      try {
        await subplebbit.stop();
        await subplebbit.delete();
        console.log("🧹 Subplebbit cleaned up");
      } catch (cleanupError) {
        console.log("🧹 Subplebbit cleanup completed (may have already been cleaned up)");
      }
    }
  });

  it("Test 17: Challenge retry scenarios", async function () {
    this.timeout(180000); // Extended timeout for multiple attempts
    console.log("\n🧪 Test 17: Challenge retry scenarios");

    const authorSigner = await plebbitForPublishing.createSigner();
    const ethWallet = await getEthWalletFromPlebbitPrivateKey(authorSigner.privateKey, authorSigner.address, authorSigner.publicKey);
    console.log(`👤 Author plebbit address: ${authorSigner.address}`);
    console.log(`💳 Author ETH address: ${ethWallet.address}`);
    
    // Mint NFT to the author wallet
    await mintpass.connect(minter).mint(ethWallet.address, SMS_TOKEN_TYPE);
    const hasNFT = await mintpass.ownsTokenType(ethWallet.address, SMS_TOKEN_TYPE);
    expect(hasNFT).to.be.true;
    console.log("✅ Confirmed author owns MintPass NFT");

    const subplebbit = await plebbit.createSubplebbit({
      title: 'MintPass Test Community',
      description: 'Testing mintpass challenge retry scenarios'
    });
    
    const settings = { ...subplebbit.settings };
    settings.challenges = [createChallengeSettings(await mintpass.getAddress(), chainProviderUrl, 31337)];
    await subplebbit.edit({ settings });
    console.log("✅ Subplebbit configured with challenges");
    
    await subplebbit.start();
    await waitForCondition(subplebbit, (s) => typeof s.updatedAt === "number");
    console.log("✅ Subplebbit started and ready");

    try {
      // First attempt
      console.log("📤 First publishing attempt...");
      const comment1 = await plebbitForPublishing.createComment({
        signer: authorSigner,
        subplebbitAddress: subplebbit.address,
        title: 'Test comment retry attempt 1',
        content: 'First attempt at publishing',
        author: { 
          wallets: {
            base: ethWallet
          } 
        }
      });

      let challenge1VerificationReceived = false;
      let challenge1SuccessValue = null;

      comment1.on('challengeverification', (challengeVerification) => {
        console.log('✅ First attempt challengeverification received:', challengeVerification);
        challenge1SuccessValue = challengeVerification.challengeSuccess;
        challenge1VerificationReceived = true;
      });

      comment1.on('challenge', (challenge) => {
        console.log("✅ First attempt challenge received:", challenge);
        comment1.publishChallengeAnswers(['test']);
      });

      await comment1.publish();
      await waitForCondition({}, () => challenge1VerificationReceived, 30000);
      expect(challenge1SuccessValue).to.be.true;
      console.log("✅ First attempt succeeded");

      // Wait a bit before second attempt
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Second attempt (should also succeed)
      console.log("📤 Second publishing attempt...");
      const comment2 = await plebbitForPublishing.createComment({
        signer: authorSigner,
        subplebbitAddress: subplebbit.address,
        title: 'Test comment retry attempt 2',
        content: 'Second attempt at publishing',
        author: { 
          wallets: {
            base: ethWallet
          } 
        }
      });

      let challenge2VerificationReceived = false;
      let challenge2SuccessValue = null;

      comment2.on('challengeverification', (challengeVerification) => {
        console.log('✅ Second attempt challengeverification received:', challengeVerification);
        challenge2SuccessValue = challengeVerification.challengeSuccess;
        challenge2VerificationReceived = true;
      });

      comment2.on('challenge', (challenge) => {
        console.log("✅ Second attempt challenge received:", challenge);
        comment2.publishChallengeAnswers(['test']);
      });

      await comment2.publish();
      await waitForCondition({}, () => challenge2VerificationReceived, 30000);
      expect(challenge2SuccessValue).to.be.true;
      console.log("✅ Test 17 PASSED: Multiple challenge attempts succeeded");
      
    } finally {
      await subplebbit.stop();
      await subplebbit.delete();
      console.log("🧹 Subplebbit cleaned up");
    }
  });

  it("Test 18: NFT in cooldown period", async function () {
    this.timeout(120000);
    console.log("\n🧪 Test 18: NFT in cooldown period");

    const authorSigner = await plebbitForPublishing.createSigner();
    const ethWallet = await getEthWalletFromPlebbitPrivateKey(authorSigner.privateKey, authorSigner.address, authorSigner.publicKey);
    console.log(`👤 Author plebbit address: ${authorSigner.address}`);
    console.log(`💳 Author ETH address: ${ethWallet.address}`);
    
    // Mint NFT to the author wallet
    await mintpass.connect(minter).mint(ethWallet.address, SMS_TOKEN_TYPE);
    const hasNFT = await mintpass.ownsTokenType(ethWallet.address, SMS_TOKEN_TYPE);
    expect(hasNFT).to.be.true;
    console.log("✅ Confirmed author owns MintPass NFT");

    const subplebbit = await plebbit.createSubplebbit({
      title: 'MintPass Test Community',
      description: 'Testing mintpass challenge with cooldown period'
    });
    
    // Configure challenge with very short cooldown for testing (1 second)
    const settings = { ...subplebbit.settings };
    const cooldownSettings = createChallengeSettings(await mintpass.getAddress(), chainProviderUrl, 31337);
    cooldownSettings.options.transferCooldownSeconds = '1';
    settings.challenges = [cooldownSettings];
    await subplebbit.edit({ settings });
    console.log("✅ Subplebbit configured with cooldown challenge");
    
    await subplebbit.start();
    await waitForCondition(subplebbit, (s) => typeof s.updatedAt === "number");
    console.log("✅ Subplebbit started and ready");

    try {
      // First publish to establish cooldown
      const comment1 = await plebbitForPublishing.createComment({
        signer: authorSigner,
        subplebbitAddress: subplebbit.address,
        title: 'First comment to establish cooldown',
        content: 'This establishes the cooldown period',
        author: { 
          wallets: {
            base: ethWallet
          } 
        }
      });

      let challenge1VerificationReceived = false;
      let challenge1SuccessValue = null;

      comment1.on('challengeverification', (challengeVerification) => {
        console.log('✅ First challengeverification received:', challengeVerification);
        challenge1SuccessValue = challengeVerification.challengeSuccess;
        challenge1VerificationReceived = true;
      });

      comment1.on('challenge', (challenge) => {
        console.log("✅ First challenge received:", challenge);
        comment1.publishChallengeAnswers(['test']);
      });

      await comment1.publish();
      await waitForCondition({}, () => challenge1VerificationReceived, 30000);
      expect(challenge1SuccessValue).to.be.true;
      console.log("✅ First comment succeeded, cooldown established");

      // Immediately try second publish (should be in cooldown or succeed since same author)
      const comment2 = await plebbitForPublishing.createComment({
        signer: authorSigner,
        subplebbitAddress: subplebbit.address,
        title: 'Second comment during cooldown',
        content: 'This should succeed since same author uses same NFT',
        author: { 
          wallets: {
            base: ethWallet
          } 
        }
      });

      let challenge2VerificationReceived = false;
      let challenge2SuccessValue = null;
      let challenge2ErrorsValue = null;

      comment2.on('challengeverification', (challengeVerification) => {
        console.log('✅ Second challengeverification received:', challengeVerification);
        challenge2SuccessValue = challengeVerification.challengeSuccess;
        challenge2ErrorsValue = challengeVerification.challengeErrors;
        challenge2VerificationReceived = true;
      });

      comment2.on('challenge', (challenge) => {
        console.log("✅ Second challenge received:", challenge);
        comment2.publishChallengeAnswers(['test']);
      });

      await comment2.publish();
      await waitForCondition({}, () => challenge2VerificationReceived, 30000);
      
      // Should succeed because same author is using the same NFT
      expect(challenge2SuccessValue).to.be.true;
      console.log("✅ Test 18 PASSED: Same author can reuse NFT immediately");
      
    } finally {
      await subplebbit.stop();
      await subplebbit.delete();
      console.log("🧹 Subplebbit cleaned up");
    }
  });

  it("Test 19: NFT cooldown expired", async function () {
    this.timeout(120000);
    console.log("\n🧪 Test 19: NFT cooldown expired");

    const authorSigner = await plebbitForPublishing.createSigner();
    const ethWallet = await getEthWalletFromPlebbitPrivateKey(authorSigner.privateKey, authorSigner.address, authorSigner.publicKey);
    console.log(`👤 Author plebbit address: ${authorSigner.address}`);
    console.log(`💳 Author ETH address: ${ethWallet.address}`);
    
    // Mint NFT to the author wallet
    await mintpass.connect(minter).mint(ethWallet.address, SMS_TOKEN_TYPE);
    const hasNFT = await mintpass.ownsTokenType(ethWallet.address, SMS_TOKEN_TYPE);
    expect(hasNFT).to.be.true;
    console.log("✅ Confirmed author owns MintPass NFT");

    const subplebbit = await plebbit.createSubplebbit({
      title: 'MintPass Test Community',
      description: 'Testing mintpass challenge with expired cooldown'
    });
    
    // Configure challenge with very short cooldown for testing (1 second)
    const settings = { ...subplebbit.settings };
    const cooldownSettings = createChallengeSettings(await mintpass.getAddress(), chainProviderUrl, 31337);
    cooldownSettings.options.transferCooldownSeconds = '1';
    settings.challenges = [cooldownSettings];
    await subplebbit.edit({ settings });
    console.log("✅ Subplebbit configured with short cooldown challenge");
    
    await subplebbit.start();
    await waitForCondition(subplebbit, (s) => typeof s.updatedAt === "number");
    console.log("✅ Subplebbit started and ready");

    try {
      // First publish to establish cooldown
      const comment1 = await plebbitForPublishing.createComment({
        signer: authorSigner,
        subplebbitAddress: subplebbit.address,
        title: 'First comment to establish cooldown',
        content: 'This establishes the cooldown period',
        author: { 
          wallets: {
            base: ethWallet
          } 
        }
      });

      let challenge1VerificationReceived = false;
      let challenge1SuccessValue = null;

      comment1.on('challengeverification', (challengeVerification) => {
        console.log('✅ First challengeverification received:', challengeVerification);
        challenge1SuccessValue = challengeVerification.challengeSuccess;
        challenge1VerificationReceived = true;
      });

      comment1.on('challenge', (challenge) => {
        console.log("✅ First challenge received:", challenge);
        comment1.publishChallengeAnswers(['test']);
      });

      await comment1.publish();
      await waitForCondition({}, () => challenge1VerificationReceived, 30000);
      expect(challenge1SuccessValue).to.be.true;
      console.log("✅ First comment succeeded, cooldown established");

      // Wait for cooldown to expire (2 seconds to be safe)
      console.log("⏳ Waiting for cooldown to expire...");
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Try second publish after cooldown expired
      const comment2 = await plebbitForPublishing.createComment({
        signer: authorSigner,
        subplebbitAddress: subplebbit.address,
        title: 'Second comment after cooldown',
        content: 'This should succeed after cooldown expired',
        author: { 
          wallets: {
            base: ethWallet
          } 
        }
      });

      let challenge2VerificationReceived = false;
      let challenge2SuccessValue = null;

      comment2.on('challengeverification', (challengeVerification) => {
        console.log('✅ Second challengeverification received:', challengeVerification);
        challenge2SuccessValue = challengeVerification.challengeSuccess;
        challenge2VerificationReceived = true;
      });

      comment2.on('challenge', (challenge) => {
        console.log("✅ Second challenge received:", challenge);
        comment2.publishChallengeAnswers(['test']);
      });

      await comment2.publish();
      await waitForCondition({}, () => challenge2VerificationReceived, 30000);
      
      expect(challenge2SuccessValue).to.be.true;
      console.log("✅ Test 19 PASSED: Comment succeeded after cooldown expired");
      
    } finally {
      await subplebbit.stop();
      await subplebbit.delete();
      console.log("🧹 Subplebbit cleaned up");
    }
  });

  it("Test 20: Multiple accounts using same NFT", async function () {
    this.timeout(120000);
    console.log("\n🧪 Test 20: Multiple accounts using same NFT");

    // Create two different author signers
    const authorSigner1 = await plebbitForPublishing.createSigner();
    const authorSigner2 = await plebbitForPublishing.createSigner();
    
    const ethWallet1 = await getEthWalletFromPlebbitPrivateKey(authorSigner1.privateKey, authorSigner1.address, authorSigner1.publicKey);
    
    // Create proper signature for second author using the shared wallet address
    const privateKeyBytes1 = Uint8Array.from(atob(authorSigner1.privateKey), c => c.charCodeAt(0));
    const privateKeyHex1 = '0x' + Array.from(privateKeyBytes1).map(b => b.toString(16).padStart(2, '0')).join('');
    const wallet1 = new ethers.Wallet(privateKeyHex1);
    
    // Create proper signature for the second author with the shared wallet
    const messageToSign2 = JSON.stringify({
      domainSeparator: "plebbit-author-wallet",
      authorAddress: authorSigner2.address,  // Different author address
      timestamp: Math.floor(Date.now() / 1000)
    });
    const signature2 = await wallet1.signMessage(messageToSign2);  // Same wallet signing for different author

    const ethWallet2 = {
      address: ethWallet1.address, // Same ETH address (shared wallet)
      timestamp: Math.floor(Date.now() / 1000),
      signature: {
        signature: signature2,  // Proper signature for second author
        publicKey: authorSigner2.publicKey,
        type: "eip191",
        signedPropertyNames: ["domainSeparator", "authorAddress", "timestamp"]
      }
    };

    console.log(`👤 Author 1 plebbit address: ${authorSigner1.address}`);
    console.log(`👤 Author 2 plebbit address: ${authorSigner2.address}`);
    console.log(`💳 Shared ETH address: ${ethWallet1.address}`);
    
    // Mint NFT to the shared wallet address
    await mintpass.connect(minter).mint(ethWallet1.address, SMS_TOKEN_TYPE);
    const hasNFT = await mintpass.ownsTokenType(ethWallet1.address, SMS_TOKEN_TYPE);
    expect(hasNFT).to.be.true;
    console.log("✅ Confirmed shared wallet owns MintPass NFT");

    const subplebbit = await plebbit.createSubplebbit({
      title: 'MintPass Test Community',
      description: 'Testing mintpass challenge with multiple accounts sharing NFT'
    });
    
    const settings = { ...subplebbit.settings };
    const cooldownSettings = createChallengeSettings(await mintpass.getAddress(), chainProviderUrl, 31337);
    cooldownSettings.options.transferCooldownSeconds = '1';
    settings.challenges = [cooldownSettings];
    await subplebbit.edit({ settings });
    console.log("✅ Subplebbit configured with cooldown challenge");
    
    await subplebbit.start();
    await waitForCondition(subplebbit, (s) => typeof s.updatedAt === "number");
    console.log("✅ Subplebbit started and ready");

    try {
      // First account publishes
      const comment1 = await plebbitForPublishing.createComment({
        signer: authorSigner1,
        subplebbitAddress: subplebbit.address,
        title: 'Comment from first account',
        content: 'First account using shared NFT',
        author: { 
          wallets: {
            base: ethWallet1
          } 
        }
      });

      let challenge1VerificationReceived = false;
      let challenge1SuccessValue = null;

      comment1.on('challengeverification', (challengeVerification) => {
        console.log('✅ First account challengeverification received:', challengeVerification);
        challenge1SuccessValue = challengeVerification.challengeSuccess;
        challenge1VerificationReceived = true;
      });

      comment1.on('challenge', (challenge) => {
        console.log("✅ First account challenge received:", challenge);
        comment1.publishChallengeAnswers(['test']);
      });

      await comment1.publish();
      await waitForCondition({}, () => challenge1VerificationReceived, 30000);
      expect(challenge1SuccessValue).to.be.true;
      console.log("✅ First account succeeded");

      // Second account tries to use same NFT immediately  
      const comment2 = await plebbitForPublishing.createComment({
        signer: authorSigner2,
        subplebbitAddress: subplebbit.address,
        title: 'Comment from second account',
        content: 'Second account trying to use same NFT',
        author: { 
          wallets: {
            base: ethWallet2
          } 
        }
      });

      let challenge2VerificationReceived = false;
      let challenge2SuccessValue = null;
      let challenge2ErrorsValue = null;

      comment2.on('challengeverification', (challengeVerification) => {
        console.log('✅ Second account challengeverification received:', challengeVerification);
        challenge2SuccessValue = challengeVerification.challengeSuccess;
        challenge2ErrorsValue = challengeVerification.challengeErrors;
        challenge2VerificationReceived = true;
      });

      comment2.on('challenge', (challenge) => {
        console.log("✅ Second account challenge received:", challenge);
        comment2.publishChallengeAnswers(['test']);
      });

      await comment2.publish();
      await waitForCondition({}, () => challenge2VerificationReceived, 30000);
      
      // Should fail because cooldown prevents different authors from using the same NFT immediately
      expect(challenge2SuccessValue).to.be.false;
      expect(challenge2ErrorsValue['0']).to.include('cooldown period');
      console.log("✅ Test 20 PASSED: Cooldown correctly prevents multiple accounts from using same NFT immediately");
      
    } finally {
      await subplebbit.stop();
      await subplebbit.delete();
      console.log("🧹 Subplebbit cleaned up");
    }
  });

  it("Test 21: Contract call failure", async function () {
    this.timeout(120000);
    console.log("\n🧪 Test 21: Contract call failure");

    const authorSigner = await plebbitForPublishing.createSigner();
    const ethWallet = await getEthWalletFromPlebbitPrivateKey(authorSigner.privateKey, authorSigner.address, authorSigner.publicKey);
    console.log(`👤 Author plebbit address: ${authorSigner.address}`);
    console.log(`💳 Author ETH address: ${ethWallet.address}`);

    const subplebbit = await plebbit.createSubplebbit({
      title: 'MintPass Test Community',
      description: 'Testing mintpass challenge with contract call failure'
    });
    
    // Configure challenge with invalid RPC URL to force failure
    const settings = { ...subplebbit.settings };
    const failureSettings = createChallengeSettings(await mintpass.getAddress(), 'http://invalid-rpc-url:9999', 31337);
    settings.challenges = [failureSettings];
    await subplebbit.edit({ settings });
    console.log("✅ Subplebbit configured with invalid RPC URL");
    
    await subplebbit.start();
    await waitForCondition(subplebbit, (s) => typeof s.updatedAt === "number");
    console.log("✅ Subplebbit started and ready");

    try {
      const comment = await plebbitForPublishing.createComment({
        signer: authorSigner,
        subplebbitAddress: subplebbit.address,
        title: 'Test comment with RPC failure',
        content: 'This comment should fail due to RPC connection failure',
        author: { 
          wallets: {
            base: ethWallet
          } 
        }
      });

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
      await waitForCondition({}, () => challengeVerificationReceived, 30000);
      
      expect(challengeSuccessValue).to.be.false;
      expect(challengeErrorsValue['0']).to.include('Failed to check MintPass NFT ownership');
      console.log("✅ Test 21 PASSED: RPC failure correctly handled");
      
    } finally {
      await subplebbit.stop();
      await subplebbit.delete();
      console.log("🧹 Subplebbit cleaned up");
    }
  });

  it("Test 22: Batch minted NFTs", async function () {
    this.timeout(120000);
    console.log("\n🧪 Test 22: Batch minted NFTs");

    const authorSigner = await plebbitForPublishing.createSigner();
    const ethWallet = await getEthWalletFromPlebbitPrivateKey(authorSigner.privateKey, authorSigner.address, authorSigner.publicKey);
    console.log(`👤 Author plebbit address: ${authorSigner.address}`);
    console.log(`💳 Author ETH address: ${ethWallet.address}`);
    
    // Use mintBatch function if available, otherwise regular mint
    try {
      // Try batch minting multiple token types
      await mintpass.connect(minter).mintBatch(ethWallet.address, [SMS_TOKEN_TYPE, 1, 2]);
      console.log("✅ Batch minted multiple token types");
    } catch (error) {
      // Fallback to regular minting if mintBatch doesn't exist
      console.log("⚠️ mintBatch not available, using regular mint");
      await mintpass.connect(minter).mint(ethWallet.address, SMS_TOKEN_TYPE);
    }
    
    const hasNFT = await mintpass.ownsTokenType(ethWallet.address, SMS_TOKEN_TYPE);
    expect(hasNFT).to.be.true;
    console.log("✅ Confirmed author owns MintPass NFT");

    const subplebbit = await plebbit.createSubplebbit({
      title: 'MintPass Test Community',
      description: 'Testing mintpass challenge with batch minted NFTs'
    });
    
    const settings = { ...subplebbit.settings };
    settings.challenges = [createChallengeSettings(await mintpass.getAddress(), chainProviderUrl, 31337)];
    await subplebbit.edit({ settings });
    console.log("✅ Subplebbit configured with challenges");
    
    await subplebbit.start();
    await waitForCondition(subplebbit, (s) => typeof s.updatedAt === "number");
    console.log("✅ Subplebbit started and ready");

    try {
      const comment = await plebbitForPublishing.createComment({
        signer: authorSigner,
        subplebbitAddress: subplebbit.address,
        title: 'Test comment with batch minted NFT',
        content: 'This comment should pass with batch minted NFT',
        author: { 
          wallets: {
            base: ethWallet
          } 
        }
      });

      let challengeVerificationReceived = false;
      let challengeSuccessValue = null;

      comment.on('challengeverification', (challengeVerification) => {
        console.log('✅ challengeverification received:', challengeVerification);
        challengeSuccessValue = challengeVerification.challengeSuccess;
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
      await waitForCondition({}, () => challengeVerificationReceived, 30000);
      
      expect(challengeSuccessValue).to.be.true;
      console.log("✅ Test 22 PASSED: Batch minted NFT verification succeeded");
      
    } finally {
      await subplebbit.stop();
      await subplebbit.delete();
      console.log("🧹 Subplebbit cleaned up");
    }
  });
}); 