# MintPass Challenge Automated Testing

This document describes how to run the automated integration tests for the MintPass challenge that test the full flow of publishing posts with and without MintPass NFTs.

## Overview

The automated tests are located in `challenges/test/mintpass-integration.test.ts` and test:

1. **Publishing without NFT** - Should fail with appropriate error message
2. **Publishing with NFT** - Should succeed after minting NFT to author
3. **Challenge configuration** - Verifies the challenge is set up correctly

## Prerequisites

1. **Node.js and Yarn**: Make sure you have Node.js and Yarn installed
2. **Challenge built**: The challenge code must be compiled first

## Running the Tests

### Step 1: Build the Challenge

```bash
cd challenges
yarn install
yarn build
```

### Step 2: Install Contract Dependencies

```bash
cd ../contracts
yarn install
```

### Step 3: Run the Integration Tests

```bash
# From the challenges directory
yarn test:integration
```

Or run individually:

```bash
# Build challenge first
cd challenges
yarn build

# Then run the test using hardhat
npx hardhat test test/mintpass-integration.test.ts
```

## Test Flow

The automated test implements a local-only testing approach using "Routing.Type none":

1. **Setup Phase**:
   - Deploys MintPass contract on local hardhat blockchain
   - Configures Plebbit instance with localhost RPC and disabled pubsub (local-only)
   - Creates subplebbit with mintpass challenge pointing to local contract
   - Creates test author signers

2. **Test 1: Publish without NFT**:
   - Author attempts to publish without owning a MintPass NFT
   - Challenge should fail with appropriate error message
   - Verifies challenge verification reports failure

3. **Test 2: Publish with NFT**:
   - Mints MintPass NFT to author's wallet address
   - Author publishes with proper wallet signature
   - Challenge should succeed and allow publication
   - Verifies challenge verification reports success

## Expected Output

```bash
🚀 Setting up MintPass Challenge Integration Test Environment
📋 Deploying MintPass contract...
✅ MintPass deployed at: 0x...
🔗 Using chain provider: http://127.0.0.1:8545
🌐 Setting up Plebbit instance...
✅ Plebbit instance created
🔑 Creating plebbit signers...
✅ Author signer created: 12D3KooW...
✅ Author without NFT signer created: 12D3KooW...
📝 Creating subplebbit with mintpass challenge...
✅ Subplebbit created with mintpass challenge: 12D3KooW...

🧪 Test 1: Publishing without NFT (should fail)
👤 Author address: 12D3KooW...
💳 Author eth address: 0x...
✅ Confirmed author doesn't own MintPass NFT
📤 Publishing comment...
🎯 Challenge received: {...}
🔍 Challenge verification: {challengeSuccess: false, ...}
✅ Test 1 passed: Publishing without NFT correctly failed

🧪 Test 2: Publishing with NFT (should pass)
👤 Author address: 12D3KooW...
💳 Author eth address: 0x...
🎨 Minting MintPass NFT to author...
✅ Confirmed author owns MintPass NFT
📤 Publishing comment...
🎯 Challenge received: {...}
🔍 Challenge verification: {challengeSuccess: true, ...}
✅ Test 2 passed: Publishing with NFT correctly succeeded

🧪 Test 3: Verifying challenge configuration
✅ Challenge configuration is correct

  3 passing (45s)
```

## Troubleshooting

### Error: Challenge file not found
```
Error: Challenge file not found at .../challenges/dist/mintpass.js
```
**Solution**: Make sure to run `yarn build` in the challenges directory first.

### Error: Cannot resolve dependencies
**Solution**: Run `yarn install` in both `challenges/` and `contracts/` directories.

### Test timeout
The tests have a 5-minute timeout. If they take longer, there may be network issues or configuration problems.

## Architecture

The test integrates several components for comprehensive local testing:

- **Hardhat Network**: Local blockchain for contract deployment and testing
- **MintPass Contract**: Deployed locally for NFT ownership verification  
- **Plebbit-js**: Library for creating subplebbits and publishing posts (configured with `Routing.Type none`)
- **MintPass Challenge**: Custom challenge that verifies NFT ownership
- **Local-only Configuration**: No external IPFS nodes, trackers, or network dependencies

This provides a complete end-to-end test of the MintPass challenge system without requiring external networks, manual intervention, or complex IPFS setup.

## Production Readiness

These automated tests ensure the MintPass challenge system is production-ready:

✅ Contract deployed and tested locally  
✅ Challenge code working with plebbit-js integration  
✅ Transfer cooldown mechanism implemented  
✅ Automated testing that recreates the full user experience  
✅ Challenge uses localhost eth RPC provided by hardhat  
✅ No manual testing required - fully automated  

The MintPass challenge is ready for deployment and integration with live subplebbits. 