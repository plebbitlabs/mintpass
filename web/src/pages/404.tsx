import Link from 'next/link';
import { Header } from '../components/header';
import { Footer } from '../components/footer';
import { PageCard } from '../components/page-card';
import { RainbowButton } from '../components/magicui/rainbow-button';
import { Button } from '../components/ui/button';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <PageCard
          title="404 - Page not found"
          titleAs="h1"
          titleClassName="text-center"
          contentClassName="text-center space-y-6"
          containerClassName="py-10"
          footerClassName="flex gap-2 justify-center"
        >
          <p className="text-muted-foreground">The page you are looking for doesn&apos;t exist or may have moved.</p>
        </PageCard>
      </main>
      <Footer />
    </div>
  );
}


