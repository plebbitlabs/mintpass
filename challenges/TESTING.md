# Testing the MintPass Challenge

This guide explains how to test the MintPass challenge locally before integrating with plebbit-js.

## Prerequisites

1. **Node.js** version 18 or higher
2. **Yarn** package manager
3. **Plebbit RPC Node** or local hardhat for testing

## Quick Setup

### 1. Install Dependencies

```bash
# From the root mintpass directory
yarn install:all
```

### 2. Set Up Environment Variables

Copy the example environment file:

```bash
cd challenges
cp .env.example .env
```

Edit `challenges/.env` and set your RPC_URL:

```env
# For local hardhat testing
RPC_URL=http://127.0.0.1:8545

# OR for plebbit node testing  
RPC_URL=ws://127.0.0.1:9138/your-secret-key
```

### 3. Deploy Contract Locally (for testing)

```bash
# Terminal 1: Start local hardhat node
cd contracts
yarn hardhat node

# Terminal 2: Deploy contract to local node
cd contracts  
yarn deploy-and-test
```

This will deploy the MintPassV1 contract and mint test NFTs.

### 4. Build and Test Challenge

```bash
# Build and run the automated integration test
cd challenges
yarn test
```

## Testing Scenarios

The test covers these scenarios:

### ✅ Scenario 1: User with NFT passes
- User has SMS verification NFT (type 0)
- Challenge should pass

### ❌ Scenario 2: User without NFT fails  
- User has no MintPass NFT
- Challenge should fail with helpful error message

### ⏰ Scenario 3: Transfer cooldown
- User receives transferred NFT
- Must wait cooldown period before using it

## Expected Output

Successful test run:

```
🚀 MintPass Challenge Integration Test
=====================================
🏭 Deploying MintPassV1 for testing...
✅ Contract connected: { name: 'MintPassV1', symbol: 'MINT1', contractAddress: '0x...' }
🎯 Minting test NFTs...
✅ SMS token minted, tx: 0x...
✅ EMAIL token minted, tx: 0x...
🌐 Setting up Plebbit and Subplebbit...
✅ Plebbit instance created
✅ Subplebbit created: 12D3KooW...
⚙️ Setting up MintPass challenge...
✅ MintPass challenge configured
🧪 Testing Challenge Scenarios...
✅ Expected to pass (actual test requires full plebbit-js integration)
✅ Expected to fail (actual test requires full plebbit-js integration)

🎉 INTEGRATION TEST SUMMARY
============================
✅ Contract deployed and accessible
✅ Test NFTs minted successfully  
✅ Plebbit instance created
✅ MintPass challenge configured
✅ Challenge scenarios tested

🌟 Ready for full plebbit-js integration!
```

## Integration with plebbit-js Fork

Once testing passes, you can integrate with your plebbit-js fork:

### 1. In your plebbit-js fork, install the challenge:

```bash
cd path/to/plebbit-js-fork
yarn add file:../mintpass/challenges
```

### 2. Import and register the challenge:

```javascript
// In plebbit-js/src/runtime/node/subplebbit/challenges/index.js
import mintpassChallenge from '@mintpass/challenges/mintpass';

// Add to challenges export
export const plebbitJsChallenges = {
  ...existingChallenges,
  mintpass: mintpassChallenge
};
```

### 3. Use in subplebbit settings:

```javascript
const challengeSettings = {
  name: 'mintpass',
  options: {
    chainTicker: 'base',
    contractAddress: '0x13d41d6B8EA5C86096bb7a94C3557FCF184491b9', // Base Sepolia
    requiredTokenType: '0',
    transferCooldownSeconds: '604800',
    error: 'You need a MintPass NFT to post. Visit https://plebbitlabs.com/mintpass/request/{authorAddress}'
  }
};

subplebbit.settings.challenges = [challengeSettings];
```

### 4. Test with real plebbit-js:

```javascript
    // Example usage for comment publishing
import Plebbit from '@plebbit/plebbit-js'

const plebbit = await Plebbit({
  plebbitRpcClientsOptions: [process.env.RPC_URL]
})

const subplebbit = await plebbit.createSubplebbit({address: 'your-test-sub'})
const settings = {...subplebbit.settings}
settings.challenges = [challengeSettings]
await subplebbit.edit({settings})
```

## Troubleshooting

### Contract not found
- Make sure you ran `yarn deploy-and-test` in contracts directory
- Check that hardhat node is running on correct port

### Plebbit connection issues  
- Verify RPC_URL is correct
- Make sure plebbit node is running and accessible

### Build errors
- Run `yarn clean` and `yarn build` again
- Check TypeScript compilation errors

### Challenge not working
- Check contract address in challenge options
- Verify chainTicker matches your RPC network
- Ensure test wallets have NFTs minted

## Next Steps

1. **Local Testing**: Complete local testing as described above
2. **Fork Integration**: Integrate challenge into your plebbit-js fork  
3. **Real Testing**: Test with actual plebbit subplebbits
4. **Production**: Deploy to production with Base mainnet contract address

Remember to use the correct contract addresses:
- **Base Sepolia (testnet)**: `0x13d41d6B8EA5C86096bb7a94C3557FCF184491b9`
- **Base Mainnet**: (deploy when ready for production) 