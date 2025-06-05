# MintPass - NFT Authentication Middleware for Plebbit

<img src="public/mintpass.png" alt="MintPass Logo" width="90" align="left" />

MintPass is an NFT-based authentication system that provides verified identity proofs for Plebbit communities (subplebbits). Users can mint verification NFTs (like SMS verification) that serve as anti-spam and identity verification mechanisms in decentralized communities. MintPass enables subplebbit owners to tell their users apart, counting them, banning them and thus preventing sybil attacks such as fake upvotes/downvotes, fake conversations, etc. 

<br clear="left" />

## Project Structure

```
mintpass/
├── contracts/           # Smart contracts (MintPassV1 NFT contract)
├── challenges/          # Plebbit challenge implementations
├── web/                 # Next.js website (plebbitlabs.com/mintpass)
├── docs/                # Documentation and specifications
├── tests/               # Cross-component integration tests
└── scripts/             # Deployment and utility scripts
```

## Milestones

### Milestone 1 ✅ Planning & Setup
- [x] Project structure and documentation
- [ ] MintPassV1 NFT smart contract
- [ ] Contract deployment to Base network
- [ ] Automated tests for smart contract

### Milestone 2 🔄 Challenge Integration
- [ ] Custom "mintpass" challenge for Plebbit
- [ ] Transfer cooldown mechanism
- [ ] Integration with existing challenge API

### Milestone 3 📅 Web Interface
- [ ] Next.js website at plebbitlabs.com/mintpass
- [ ] SMS verification service integration
- [ ] NFT minting interface at `/request/<eth-address>`

### Milestone 4 📅 UX & Integration
- [ ] Seamless integration with Seedit
- [ ] Multiple challenge options UI
- [ ] Production testing and optimization

## Getting Started

This repository is currently in development. Follow the milestones above to track progress.

## Technology Stack

- **Smart Contracts**: Solidity, Hardhat/Foundry
- **Website**: Next.js, React, Ethereum integration
- **Challenges**: TypeScript, Plebbit-js integration
- **Deployment**: Base network (Layer 2)

## License

MIT License - See [LICENSE](LICENSE) file for details.

**Open Source, Commercial Friendly**
- ✅ Free to use, modify, and distribute
- ✅ Perfect for developers and researchers  
- ✅ Encourages ecosystem growth
- 💰 Commercial plans to be released on [plebbitlabs.com](https://plebbitlabs.com) 