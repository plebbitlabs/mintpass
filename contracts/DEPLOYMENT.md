# MintPassV1 Deployment Guide

## Prerequisites

1. **Environment Setup**: Create a `.env` file in the `contracts/` directory with:

```env
# Private key for deployment (without 0x prefix)
PRIVATE_KEY=your_private_key_here

# Basescan API key for contract verification
BASESCAN_API_KEY=your_basescan_api_key_here

# Admin address (should be hardware wallet for production)
ADMIN_ADDRESS=0x1234567890123456789012345678901234567890

# Minter address (should be your server address)
MINTER_ADDRESS=0x0987654321098765432109876543210987654321
```

2. **Get Base ETH**: For testnet, get Base Sepolia ETH from the faucet. For mainnet, bridge ETH to Base.

3. **Basescan API Key**: Get from [basescan.org](https://basescan.org/apis) for contract verification.

## Deployment Commands

**All deployments use deterministic CREATE2 deployment for consistent addresses across networks.**

### Deploy to Base Sepolia (Testnet)
```bash
cd contracts
yarn deploy:testnet
```

### Deploy to Base Mainnet
```bash
cd contracts
yarn deploy:mainnet
```

### Deploy to Local Network (Testing)
```bash
cd contracts
# Start local node (if you want persistent blockchain)
yarn hardhat node

# In another terminal, or directly for ephemeral testing
yarn deploy:local
```

### Deploy and Test (Development)
```bash
cd contracts
yarn deploy-and-test  # Deploys + tests in one command
```

**Benefits of Our Deterministic Deployment:**
- Same contract address on all chains (localhost, testnet, mainnet)
- Predictable addresses for challenge integration
- Better testing consistency
- Uses CREATE2 factory for reliability

## Post-Deployment

After successful deployment:

1. **Verify the contract** is automatically verified on Basescan
2. **Save the deployment info** from `deployments/MintPassV1-{network}.json`
3. **Test the contract** by calling view functions
4. **Set up proper admin/minter roles** if using test addresses

## Constructor Parameters

The contract is deployed with:
- **Name**: "MintPassV1"
- **Symbol**: "MINT1" 
- **Base URI**: "plebbitlabs.com/mintpass/mint1"
- **Admin**: From `ADMIN_ADDRESS` env var (or deployer if not set)
- **Minter**: From `MINTER_ADDRESS` env var (or deployer if not set)

## Security Notes

⚠️ **For Production:**
- Use a **hardware wallet** for the admin role
- Use a **dedicated server address** for the minter role
- **Never commit** your private key or `.env` file
- **Test on Base Sepolia first** before mainnet deployment

## Role Management

After deployment, the admin can:
- Grant/revoke minter roles: `grantRole(MINTER_ROLE, address)`
- Update cosmetic properties: `setBaseURI()`, `setName()`, `setSymbol()`
- Revoke compromised minter: `revokeRole(MINTER_ROLE, compromised_address)`

## Verification

If automatic verification fails, manually verify with:

```bash
yarn hardhat verify --network baseSepolia CONTRACT_ADDRESS "MintPassV1" "MINT1" "plebbitlabs.com/mintpass/mint1" "ADMIN_ADDRESS" "MINTER_ADDRESS"
```