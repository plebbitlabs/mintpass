import Link from 'next/link';
import { Header } from '../components/header';
import { Footer } from '../components/footer';
import { PageCard } from '../components/page-card';
import { RainbowButton } from '../components/magicui/rainbow-button';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <PageCard
          title="NFT Authentication"
          titleAs="h1"
          titleClassName="text-center"
          contentClassName="text-center space-y-6"
          containerClassName="py-10"
        >
          <p className="text-muted-foreground">Verify your phone and receive your authentication NFT.</p>
          <RainbowButton variant="outline">
            <Link href="/request">Start Verification</Link>
          </RainbowButton>
        </PageCard>
      </main>
      <Footer />
    </div>
  );
}
