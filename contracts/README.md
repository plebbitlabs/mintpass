# MintPassV1 Smart Contract

This directory contains the MintPassV1 NFT smart contract for the MintPass authentication system.

## Features

- **ERC721 + ERC721Enumerable**: Standard NFT functionality with enumeration support
- **Access Control**: Admin and Minter roles for secure operations
- **Token Types**: Each NFT has a type (e.g., 0 = SMS verification, 1 = Email verification)
- **Batch Operations**: Gas-efficient batch minting
- **Utility Functions**: Comprehensive ownership and type checking functions
- **Upgradeable Metadata**: Admin can update base URI for metadata

## Contract Specification

- **Name**: MintPassV1
- **Symbol**: MPSS
- **Base URI**: `https://mintpass.org/mint1/`
- **Network**: Base (Layer 2)
- **Token Types**: uint16 (65,536 possible types)
  - Type 0: SMS verification
  - Type 1+: Future verification methods

## Quick Start

1. **Install dependencies**:
   ```bash
   yarn install
   ```

2. **Compile contracts**:
   ```bash
   yarn compile
   ```

3. **Run tests**:
   ```bash
   yarn test
   ```

4. **Deploy to Base Sepolia (testnet)**:
   ```bash
   # Copy .env.example to .env and fill in your values
   cp .env.example .env
   
   # Deploy
   yarn deploy:base-sepolia
   ```

5. **Deploy to Base Mainnet**:
   ```bash
   yarn deploy:base
   ```

## Environment Setup

Create a `.env` file with the following variables:

```env
# Private key for deployment (without 0x prefix)
PRIVATE_KEY=your_private_key_here

# Base network explorer API key for contract verification
BASESCAN_API_KEY=your_basescan_api_key_here

# Gas reporting (optional)
REPORT_GAS=true
```

## Core Functions

### Minting
- `mint(address to, uint16 tokenType)`: Mint single NFT
- `mintBatch(address[] recipients, uint16[] tokenTypes)`: Batch mint

### Token Information
- `tokenType(uint256 tokenId)`: Get token type for a token ID
- `tokensOfOwner(address owner)`: Get all tokens and types owned by address
- `tokensOfOwners(address[] owners)`: Batch version of above

### Ownership Checks
- `ownsTokenType(address owner, uint16 tokenType)`: Check if owns specific type
- `ownsTokenTypes(address owner, uint16[] tokenTypes)`: Check if owns all types
- `ownsOneOfTokenTypes(address owner, uint16[] tokenTypes)`: Check if owns any type

### Admin Functions
- `setBaseURI(string newBaseURI)`: Update metadata base URI (admin only)
- Role management via AccessControl

## Testing

The test suite covers:
- ✅ Deployment and initialization
- ✅ Minting (single and batch)
- ✅ Token type tracking
- ✅ All utility functions
- ✅ Access control
- ✅ ERC721 compatibility
- ✅ Admin functions

Run tests with:
```bash
yarn test
```

For coverage report:
```bash
yarn coverage
```

## Gas Optimization

The contract includes several gas optimizations:
- Batch minting for multiple NFTs
- Efficient token type storage
- Optimized enumeration functions
- No unnecessary storage reads

## Security Features

- **Role-based access control**: Admin and Minter roles
- **No proxy pattern**: Immutable core logic (versioned approach)
- **Transfer detection**: External systems can implement cooldowns
- **Admin functions limited**: Only cosmetic changes allowed

## Deployment Networks

- **Base Sepolia** (Testnet): Chain ID 84532
- **Base Mainnet**: Chain ID 8453

## Next Steps

1. Deploy contract to Base Sepolia for testing
2. Verify contract on BaseScan
3. Test minting functionality
4. Integrate with Plebbit challenge system (Milestone 2)
5. Build web interface (Milestone 3) 