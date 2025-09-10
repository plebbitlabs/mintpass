import Link from 'next/link';
import { Header } from '../components/header';

export default function TermsAndConditions() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <div className="mx-auto max-w-md px-4 py-8 space-y-6">
          <h1 className="text-2xl font-bold">Terms and Conditions</h1>
          <p className="text-sm text-muted-foreground">
            Please read these terms carefully before using MintPass.
          </p>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Service</h2>
            <p className="text-sm">
              MintPass provides an authentication NFT minting flow used by participating applications. The service verifies a phone number with an SMS code and, if eligible, mints an NFT to a provided Ethereum address (or records an equivalent mint state when on‑chain is disabled).
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Eligibility</h2>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li>You must submit a valid phone number you control for verification.</li>
              <li>One authentication NFT per phone number and per wallet address.</li>
              <li>We may block abusive activity, VPN/proxy usage, or high‑risk phone numbers.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Assumptions and Risks</h2>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li>Crypto transactions are irreversible and may incur gas fees. You are responsible for your wallet security.</li>
              <li>The project code is open source; hosted deployments still require trust in the operator’s configuration.</li>
              <li>The service may change or be discontinued without notice.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">No Warranty</h2>
            <p className="text-sm">
              The service is provided “as is,” without warranties of any kind. To the maximum extent permitted by law, the operators and contributors disclaim all implied warranties and are not liable for damages arising from the use or inability to use the service.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Policy Changes</h2>
            <p className="text-sm">
              We may update these terms and the privacy policy. Continued use of the service after changes constitutes acceptance of the updated terms.
            </p>
          </section>

          <div className="text-sm space-x-4">
            <Link href="/privacy-policy" className="underline">
              Privacy Policy
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}


