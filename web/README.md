## MintPass Web (Milestone 3)

Serverless backend scaffolding for SMS verification and NFT minting.

### Anti-Sybil and Security Requirements
- **Phone number database**: Track used numbers; prevent reuse for minting.
- **IP address tracking**: Rate limit per IP; detect abuse patterns.
- **SMS verification state**: Store codes and expirations; mark verified.
- **Minter key security**: Private key only in Vercel env vars; never in code or logs.
- **Rate limiting**: Global and per-route limits to mitigate spam.
- **Geolocation filtering**: Optional country blocking via `middleware.ts`.
- **Audit trail (optional)**: Log key events to a separate store with redaction.
 - **VPN/Proxy detection (optional)**: If `IPQS_API_KEY` is set, block VPNs/proxies/cloud provider IPs.
 - **Disposable/VOIP phone detection (optional)**: If `ABSTRACTAPI_PHONE_KEY` is set, block disposable/VOIP/high-risk numbers.
 - **Cooldowns**: Per-IP mint cooldown and per-IP/phone SMS send cooldowns configurable via env.

### Vercel Setup (exact steps)
1. Create a new Vercel project and select this repo. Set root directory to `web`.
2. Add the Vercel KV integration. This will provision `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
3. In Project Settings → Environment Variables, add:
   - `MINTER_PRIVATE_KEY` (server only)
   - `SMS_PROVIDER_API_KEY` and `SMS_SENDER_ID` (if/when integrating a provider)
   - `BLOCKED_COUNTRIES` (comma-separated ISO codes if needed)
   - `RATE_LIMIT_WINDOW_SECONDS`, `RATE_LIMIT_MAX_REQUESTS` (optional)
   - `IPQS_API_KEY` (optional) to enable IP reputation checks
   - `ABSTRACTAPI_PHONE_KEY` (optional) to enable disposable/VOIP phone checks
    - `SMS_SEND_COOLDOWN_SECONDS` (optional) default 120
    - `MINT_IP_COOLDOWN_SECONDS` (optional) default 604800 (7 days)
4. Deploy. After first deploy, add the domain `mintpass.org` in Domains, set as primary.
5. Ensure the KV database is scoped to the production environment and not shared with preview.

### API Routes
- `POST /api/sms/send` → request SMS code (rate-limited)
- `POST /api/sms/verify` → verify code and mark phone as verified
- `POST /api/check-eligibility` → confirm address + phone can mint
- `POST /api/mint` → mint NFT after verification (stub; integrate contract call)

### Local Development
```bash
yarn install
yarn dev
```

To test API calls locally, use `curl` or your preferred REST client.

### Environment Variables
Copy `.env.example` to `.env.local` and fill in values. Do not commit `.env.local`.

### Next Steps
- Integrate SMS provider (e.g., Twilio or Vonage) in `src/pages/api/sms/send.ts`.
- Implement on-chain mint in `src/pages/api/mint.ts` using the `MINTER_PRIVATE_KEY` and the deployed MintPassV1 address (Base testnet for now).
- Add abuse heuristics (velocity checks per phone/IP, simple device fingerprinting if needed).

This project is a backend scaffold meant to be deployed on Vercel. UI will be added later.

### Operational recommendations
- Put Cloudflare in front of Vercel for additional DDoS protection and WAF/challenge. Set `CF-Connecting-IP` pass-through so backend uses real client IP.
- Monitor rate-limit headers (`X-RateLimit-*`) and adjust envs based on traffic.
