# MintPass - NFT Authentication Middleware for Plebbit

<img src="public/mintpass.png" alt="MintPass Logo" width="90" align="left" />

MintPass is an NFT-based authentication system that provides verified identity proofs for Plebbit communities (subplebbits). Users can mint verification NFTs (like SMS verification) that serve as anti-spam and identity verification mechanisms in decentralized communities. MintPass enables subplebbit owners to tell their users apart, counting them, banning them and thus preventing sybil attacks such as fake upvotes/downvotes, fake conversations, etc. 

<br clear="left" />

## Project Structure

```
mintpass/
├── contracts/           # Smart contracts (MintPassV1 NFT contract)
├── challenges/          # Plebbit challenge implementations
├── web/                 # Next.js website (mintpass.org)
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

### Milestone 2 ✅ Challenge Integration
- [x] Custom "mintpass" challenge for Plebbit
- [x] Transfer cooldown mechanism  
- [x] Integration with plebbit-js challenge system
- [x] Local blockchain testing with full integration

### Milestone 3 🔄 Web Backend & Interface
- [x] Next.js backend at `mintpass.org` (Pages Router, TypeScript)
- [x] SMS verification flow (send, verify)
- [x] NFT minting API after verification
- [x] Anti-sybil controls (rate limits, cooldowns, optional VPN/VOIP checks)
- [x] Vercel Preview/Production setup with environment variables and Upstash KV (Redis)
- [x] End-to-end smoke tests (Preview/Prod), hardened with HMAC-pepper, curl failure/timeout handling, and robust OTP parsing
- [x] Twilio SMS provider integration (Messaging Service with geo-sender routing; verified in Preview/Prod)
- [x] Public-facing UI at `/request/<eth-address>` (shadcn/ui components, mobile-first design)

Anti-sybil summary (backend):
- Per-IP rate limiting and server-side cooldowns (SMS send and mint attempts)
- Optional VPN/proxy/cloud IP detection (IPQS)
- Optional disposable/VOIP phone detection (AbstractAPI)
- Optional geoblocking via middleware; Cloudflare WAF recommended in front of Vercel

See `web/README.md` for exact environment variables and Vercel/Cloudflare setup steps.

Privacy and data handling (summary):
- Phone numbers (E.164) and IPs are used strictly for verification, rate limiting, cooldowns, and preventing duplicate mints. No additional PII is collected by default.
- SMS codes are stored with a short TTL (5 minutes). Verification markers also expire after 5 minutes. SMS send cooldowns default to 120 seconds. IP mint cooldown defaults to 7 days. Rate-limit state is short-lived.
- Mint state associates wallet address and phone to prevent reuse; by design this record is retained to enforce anti-sybil guarantees. Cooldown and code entries expire automatically.
- Behind Cloudflare/Vercel, client IP is extracted in this order: `CF-Connecting-IP` → `X-Real-IP` → first `X-Forwarded-For` → socket address. Ensure Cloudflare proxying is enabled so the true client IP is preserved.
- Logs should redact phone numbers and never include SMS codes or private keys. Secrets are stored only in Vercel environment variables; no secrets in the repository.
- UI must present a clear notice and obtain consent before sending an SMS, including a link to the privacy policy. Data access/deletion requests should be honored where legally required, noting that removing mint association records weakens anti-sybil protections.

### Milestone 4 📅 UX & Integration
- [ ] Seamless integration with Seedit
- [ ] Multiple challenge options UI
- [ ] Production testing and optimization

## Docs & Subprojects

- Contracts: `contracts/` — see `contracts/README.md`
- Challenge (plebbit-js): `challenges/` — see `challenges/README.md`
- Website backend (Next.js): `web/` — see `web/README.md`
- Docs and specs: `docs/` — see `docs/README.md` and `docs/milestones.md`

## Getting Started

- Smart contracts: see `contracts/README.md` for local deploy and tests
- Challenge (plebbit-js): see `challenges/README.md` for building and tests
- Web backend: see `web/README.md` for Vercel/KV setup, env vars, and API routes

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
- 💰 Commercial plans could be released on [mintpass.org](https://mintpass.org) 
