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

### Milestone 1 ✅ Contract & Infrastructure  
- [x] Project structure and documentation
- [x] MintPassV1 NFT smart contract with role-based access
- [x] Contract deployment to Base Sepolia testnet
- [x] Automated tests for smart contract functions
- [x] Deterministic deployment system (CREATE2)
- [x] Comprehensive testing scripts and workflows

### Milestone 2 🔄 Challenge Integration
- [ ] Custom "mintpass" challenge for Plebbit
- [ ] Transfer cooldown mechanism  
- [ ] Integration with plebbit-js challenge system
- [ ] Local blockchain testing with full integration

### Milestone 3 📅 Web Interface
- [ ] Next.js website at plebbitlabs.com/mintpass
- [ ] SMS verification service integration
- [ ] NFT minting interface at `/request/<eth-address>`

### Milestone 4 📅 UX & Integration
- [ ] Seamless integration with Seedit
- [ ] Multiple challenge options UI
- [ ] Production testing and optimization

## Current Status

**✅ Milestone 1 Complete!** 
- MintPassV1 NFT contract deployed and verified on Base Sepolia testnet
- Full testing suite with automated deployment and verification scripts
- Deterministic deployment ready for consistent addresses across networks

**🔄 Now Working On:** Milestone 2 - Writing the "mintpass" challenge for plebbit-js integration

## Getting Started

### Smart Contract Testing
```bash
cd contracts
yarn install
yarn deploy-and-test  # Deploy and test on local Hardhat network
```

### Deployment Scripts
```bash
# Deploy to testnet with deterministic addresses
yarn deploy:deterministic:testnet

# Deploy and test locally
yarn deploy-and-test
```

This repository is actively in development. Follow the milestones above to track progress.

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