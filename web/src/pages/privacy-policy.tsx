import Link from 'next/link';
import { Header } from '../components/header';
import { PageCard } from '../components/page-card';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <PageCard title="Privacy Policy" titleAs="h1" contentClassName="space-y-6">
          <p className="text-sm text-muted-foreground">
            This document describes how the MintPass website and backend handle data. It is provided for transparency and is not legal advice.
          </p>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Summary</h2>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li>No marketing analytics. No sale of personal data.</li>
              <li>Minimal operational data only: verification codes, verification markers, rate-limit and cooldown keys, and mint association records.</li>
              <li>Phone numbers and IPs are stored as HMAC-SHA256 digests when a hash pepper is configured.</li>
              <li>SMS codes are short‑lived; verification markers expire shortly after use.</li>
              <li>Mint association (wallet ↔ phone) persists to enforce anti-Sybil guarantees.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Data We Process</h2>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li>
                Phone number (E.164): used to send and verify one‑time SMS codes. Stored as a hashed key when <code>HASH_PEPPER</code> is set. The code value itself is temporary.
              </li>
              <li>
                IP address: used for global rate limits and cooldowns. Stored as a hashed key when <code>HASH_PEPPER</code> is set.
              </li>
              <li>
                Ethereum address: used to check and record whether a wallet has minted an authentication NFT.
              </li>
              <li>
                Optional IP/phone reputation signals if you enable providers (e.g., VPN/Proxy or VOIP checks). These are used to block abuse and are not retained beyond the result state.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Retention</h2>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li>SMS codes: ~5 minutes TTL.</li>
              <li>SMS verified markers: short TTL (minutes) after successful verification.</li>
              <li>Rate‑limit and cooldown keys (IP/phone): short TTL as configured in the environment.</li>
              <li>Mint association (wallet and phone): retained to prevent duplicate mints and preserve anti-Sybil guarantees.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">"No‑logs" Clarification</h2>
            <p className="text-sm">
              MintPass uses a minimal‑data model rather than a strict “no‑logs” policy. We avoid server request logging for analytics and do not profile users. However, we must keep short‑lived operational keys (e.g., OTPs, verification markers, rate‑limits/cooldowns) and a persistent mint association record to protect against abuse. This means MintPass is not “strict no‑logs,” but it is “no analytics, minimal operational data.”
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Infrastructure</h2>
            <p className="text-sm">
              The site is hosted on Vercel. Operational state is stored in Upstash Redis (KV). Regions are configured to US‑East (<code>iad1</code>) in the reference setup. SMS delivery is via a provider such as Twilio if configured. The code is open source; deployments are configured to align with the repository, but users should consider the trust assumptions inherent in any hosted service.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Your Choices</h2>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li>You can choose not to use MintPass, in which case no data is collected.</li>
              <li>You can request deletion of verification cooldowns and related state via the admin tooling where appropriate; note that mint association records are retained by design.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Contact</h2>
            <p className="text-sm">
              For questions about this policy, open an issue on the project repository or contact the maintainers. See the project README for details.
            </p>
          </section>

          <div className="text-sm">
            <Link href="/terms-and-conditions" className="underline">
              Terms and Conditions
            </Link>
          </div>
        </PageCard>
      </main>
    </div>
  );
}


