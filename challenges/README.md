# MintPass Challenge for Plebbit-js

This directory contains the MintPass challenge implementation for plebbit-js that verifies users own a MintPass NFT.

## Features

- **NFT Ownership Verification**: Checks if users own a MintPass NFT of the required type
- **Transfer Cooldown Protection**: Prevents quick NFT transfers between accounts to bypass verification
- **Chain Flexibility**: Supports different chains where MintPass contracts are deployed
- **ENS Support**: Works with ENS addresses and wallet addresses
- **Type-specific Requirements**: Can require specific token types (SMS=0, Email=1, etc.)

## Installation

For use in plebbit-js projects, clone the mintpass repo alongside your plebbit-js project:

```bash
# Clone mintpass repo 
git clone https://github.com/your-username/mintpass.git

# Build the challenge
cd mintpass
yarn install:all
yarn build:challenges
```

## Usage

### Basic Challenge Configuration

```javascript
// Import via file path (not package import)
const challengeSettings = {
  path: '../mintpass/challenges/dist/mintpass.js', // Relative path to built challenge
  options: {
    chainTicker: 'base',
    contractAddress: '0x13d41d6B8EA5C86096bb7a94C3557FCF184491b9',
    requiredTokenType: '0', // 0 = SMS verification
    transferCooldownSeconds: '604800', // 1 week
    error: 'You need a MintPass NFT to post. Visit https://plebbitlabs.com/mintpass/request/{authorAddress}'
  }
};

// Set on subplebbit
subplebbit.settings.challenges = [challengeSettings];
```

### Directory Structure

Your project should look like:
```
your-project/
├── plebbit-js/           # Your plebbit-js fork
└── mintpass/             # Cloned mintpass repo
    └── challenges/
        └── dist/
            └── mintpass.js  # Built challenge file
```

### Challenge Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `chainTicker` | string | `"base"` | Chain where MintPass contract is deployed |
| `contractAddress` | string | Required | MintPass contract address |
| `requiredTokenType` | string | `"0"` | Required token type (0=SMS, 1=Email, etc.) |
| `transferCooldownSeconds` | string | `"604800"` | Cooldown period after NFT transfer (1 week) |
| `error` | string | Default message | Custom error message for users without NFT |

### Token Types

- **Type 0**: SMS verification
- **Type 1**: Email verification  
- **Type 2+**: Future verification methods

### Transfer Cooldown

The challenge tracks when NFTs are used by different plebbit accounts and enforces a cooldown period to prevent:
- Quick transfers to bypass bans
- NFT sharing between multiple accounts
- Sybil attacks via NFT circulation

## Development

### Building

```bash
cd challenges
yarn install
yarn build
```

### Testing

For comprehensive testing instructions, see [TESTING.md](TESTING.md). Quick start:

```bash
cd challenges
yarn test:integration
```

### Integration with plebbit-js

The challenge exports a `ChallengeFileFactory` function compatible with plebbit-js:

```javascript
// In your plebbit-js fork
import mintpass from '@mintpass/challenges';

// Register the challenge
Plebbit.challenges.mintpass = mintpass;

// Use in subplebbit settings
const subplebbit = await plebbit.createSubplebbit({
  settings: {
    challenges: [{
      name: 'mintpass',
      options: {
        contractAddress: '0x...',
        requiredTokenType: '0'
      }
    }]
  }
});
```

## Architecture

The challenge follows the plebbit-js challenge pattern:

1. **Wallet Verification**: Validates author's wallet signature
2. **NFT Ownership Check**: Calls `ownsTokenType()` on MintPass contract
3. **Transfer Cooldown**: Tracks NFT usage across plebbit accounts
4. **ENS Support**: Resolves ENS addresses to wallet addresses

## Error Scenarios

| Scenario | Error Message |
|----------|---------------|
| No wallet set | "Author wallet address is not defined" |
| Invalid signature | "The signature of the wallet is invalid" |
| No NFT owned | Custom error with link to verification site |
| NFT in cooldown | "Your MintPass NFT is in cooldown period" |
| Contract call fails | "Failed to check MintPass NFT ownership" |

## License

MIT License - Same as the MintPass project. 