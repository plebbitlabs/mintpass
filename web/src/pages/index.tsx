import Link from 'next/link';
import { useRouter } from 'next/router';
import { Header } from '../components/header';
import { Footer } from '../components/footer';
import { PageCard } from '../components/page-card';
import { RainbowButton } from '../components/magicui/rainbow-button';

export default function Home() {
  const router = useRouter();
  const hideNft = router.query['hide-nft'] === 'true';

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <PageCard
          title={hideNft ? "Authentication" : "NFT Authentication"}
          titleAs="h1"
          titleClassName="text-center"
          contentClassName="text-center space-y-6"
          containerClassName="py-10"
        >
          <p className="text-muted-foreground">
            {hideNft 
              ? "Verify your phone and get authenticated for secure access."
              : "Verify your phone and receive your authentication NFT."
            }
          </p>
          <RainbowButton variant="outline">
            <Link href={`/request${hideNft ? '?hide-nft=true' : ''}`}>Start Verification</Link>
          </RainbowButton>
        </PageCard>
      </main>
      <Footer />
    </div>
  );
}
