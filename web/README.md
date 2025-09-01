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
 - **Keyed hashing (pepper)**: If `HASH_PEPPER` is set, phone numbers and IPs are stored as HMAC-SHA256 digests (domain-separated) in KV keys to reduce offline brute-force risk if a DB-only leak occurs.

### Vercel Setup (exact steps)
1. Create a new Vercel project and select this repo. Set root directory to `web`.
2. Add storage via Marketplace: Upstash → Redis. Create separate databases per environment (recommended):
   - `mintpass-kv-prod` (Production)
   - `mintpass-kv-preview` (Preview)
   - `mintpass-kv-dev` (optional local)
   Settings for each DB: Plan = Pay as You Go, Primary Region = `iad1` (US‑East), Read Regions = none, Eviction = off, Auto‑upgrade = on.
3. In Project Settings → Environment Variables, add:
   - `MINTER_PRIVATE_KEY` (server only)
   - `SMS_PROVIDER_API_KEY` and `SMS_SENDER_ID` (if/when integrating a provider)
   - `BLOCKED_COUNTRIES` (comma-separated ISO codes if needed)
   - `RATE_LIMIT_WINDOW_SECONDS`, `RATE_LIMIT_MAX_REQUESTS` (optional)
   - `IPQS_API_KEY` (optional) to enable IP reputation checks
   - `ABSTRACTAPI_PHONE_KEY` (optional) to enable disposable/VOIP phone checks
    - `SMS_SEND_COOLDOWN_SECONDS` (optional) default 120
    - `MINT_IP_COOLDOWN_SECONDS` (optional) default 604800 (7 days)
   - Map Upstash credentials to app envs per environment:
     - Production: `KV_REST_API_URL` = Upstash prod REST URL; `KV_REST_API_TOKEN` = Upstash prod REST token
     - Preview: `KV_REST_API_URL` = Upstash preview REST URL; `KV_REST_API_TOKEN` = Upstash preview REST token
     - Local dev (optional): set the same in `.env.local` pointing to `mintpass-kv-dev`
4. Deploy. After first deploy, add the domain `mintpass.org` in Domains, set as primary.
5. Ensure the KV database is scoped to the production environment and not shared with preview.

### Runtime regions
- Vercel Project → Settings → Functions → Region: set to `iad1` to co‑locate with Redis and reduce latency.

### Storage notes
- Why Redis/KV: fast TTL keys for OTPs and cooldowns, atomic counters, and simple idempotency.
- Cost model (Pay as You Go): ~$0.20 per 100k commands. Typical flow is ~20 commands per successful mint.

### Environments and KV mapping (prod/preview/local)
- **Databases to create**:
  - `mintpass-kv-prod` → used by Vercel Production
  - `mintpass-kv-preview` → used by Vercel Preview (and local dev by default)
  - Optional later: `mintpass-kv-dev` → used only for local dev

- **Vercel → Project → Settings → Environment Variables**:
  - Production: set `KV_REST_API_URL` and `KV_REST_API_TOKEN` from `mintpass-kv-prod`
  - Preview: set `KV_REST_API_URL` and `KV_REST_API_TOKEN` from `mintpass-kv-preview`
  - Do not point local or preview to prod.

- **Local development**:
  - Copy `.env.example` to `.env.local`
  - Set `KV_REST_API_URL` and `KV_REST_API_TOKEN` to the preview DB (or to `mintpass-kv-dev` if you created it)
  - Run `yarn dev`

### API Routes
- `POST /api/sms/send` → request SMS code (rate-limited; sends via Twilio if configured)
- `POST /api/sms/verify` → verify code and mark phone as verified
- `POST /api/check-eligibility` → confirm address + phone can mint
- `POST /api/mint` → on-chain mint on Base Sepolia when envs are set; otherwise records local minted state

### Local Development
```bash
yarn install
yarn dev
```

To test API calls locally, use `curl` or your preferred REST client.

### Smoke test (prod/preview)
Create local env files (not committed) with the correct Upstash REST URL/Token and target base URL:

- `.env.smoke.prod` (for Production)
```
KV_REST_API_URL=
KV_REST_API_TOKEN=
BASE_URL=https://mintpass.org
PHONE=+15555550123
ADDR=0x1111111111111111111111111111111111111111
```

- `.env.smoke.preview` (for Preview)
```
KV_REST_API_URL=
KV_REST_API_TOKEN=
PREVIEW_BASE_URL=https://<your-preview>.vercel.app
PHONE=+15555550123
ADDR=0x1111111111111111111111111111111111111111
BYPASS_TOKEN=...
SMOKE_TEST_TOKEN=...
```

Run the script:
```bash
yarn smoke:prod
# or
yarn smoke:preview
```

Notes:
- The script loads ENVFILE (if provided), then `.env.smoke.{prod|preview}`, then `.env.local`, then `.env`.
- No SMS provider needed yet; the OTP is read from KV via REST for testing.
- Cooldowns and rate limits apply; you may need to wait 120s for repeated runs.
 - If your Preview custom domain is protected via Vercel Auth and proxied by Cloudflare, prefer the vercel.app URL for smoke tests.

### Contributor quickstart: Preview smoke test
- Create/connect a Preview Upstash KV to this project and ensure the Preview env has `KV_REST_API_URL` and `KV_REST_API_TOKEN` (use the plain names; avoid double prefixes). Optionally set `SMOKE_TEST_TOKEN` to enable a debug echo of the OTP.
- If Deployment Protection is enabled, create a Protection Bypass token and use it as `BYPASS_TOKEN` in the `.env.smoke.preview` file. The script will set the bypass cookie and header automatically.
- Trigger a new Preview deployment and copy its per-deployment vercel.app URL from Vercel → Deployments. Use that URL as `PREVIEW_BASE_URL`.
- Create `web/.env.smoke.preview` with:
  - `KV_REST_API_URL`, `KV_REST_API_TOKEN`
  - `PREVIEW_BASE_URL`, `PHONE`, `ADDR`
  - `BYPASS_TOKEN` (only if protection is enabled)
  - `SMOKE_TEST_TOKEN` (optional; returns `debugCode` during send)
- Run `yarn install` then `yarn smoke:preview`.
- Expected: send → verify → eligibility=true → mint ok (stubbed unless on-chain envs are set).

### Environment Variables
Copy `.env.example` to `.env.local` and fill in values. Do not commit `.env.local`.

Required for runtime:
- `KV_REST_API_URL`, `KV_REST_API_TOKEN`
- `HASH_PEPPER` (optional; HMAC key for hashing identifiers used in KV keys)

Optional for SMS provider (Twilio preferred):
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`
- One of: `TWILIO_MESSAGING_SERVICE_SID` or `SMS_SENDER_ID`

Optional for on-chain mint (Base Sepolia):
- `MINTER_PRIVATE_KEY`
- `MINTPASSV1_ADDRESS_BASE_SEPOLIA`
- `BASE_SEPOLIA_RPC_URL`

Optional for smoke testing (Preview only):
- `SMOKE_TEST_TOKEN` (debug-only echo of OTP when `x-smoke-test-token` header is present)
- `HASH_PEPPER` (optional; if set, `scripts/smoke-test.sh` derives the hashed OTP KV key via OpenSSL when available)

### Next Steps
- Add abuse heuristics (velocity checks per phone/IP, simple device fingerprinting if needed).
- Build minimal UI (`request/[address].tsx`) and wire to these APIs.

This project is a backend scaffold meant to be deployed on Vercel. UI will be added later.

### Operational recommendations
- Put Cloudflare in front of Vercel for additional DDoS protection and WAF/challenge. Set `CF-Connecting-IP` pass-through so backend uses real client IP.
- Monitor rate-limit headers (`X-RateLimit-*`) and adjust envs based on traffic.
