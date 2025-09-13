import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { Header } from '../components/header';
import { Footer } from '../components/footer';
import { PageCard } from '../components/page-card';
import { RainbowButton } from '../components/magicui/rainbow-button';
import { Button } from '../components/ui/button';

export default function NotFoundPage() {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState(5);

  useEffect(() => {
    if (secondsLeft <= 0) {
      router.replace('/');
      return;
    }
    const interval = setInterval(() => {
      setSecondsLeft((s) => s - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [secondsLeft, router]);

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
          <p className="text-muted-foreground">
            The page you are looking for doesn&apos;t exist or may have moved.
          </p>
          <p className="text-sm text-muted-foreground">
            Redirecting to <Link href="/" className="underline">home</Link> in {secondsLeft} second{secondsLeft !== 1 ? 's' : ''}...
          </p>
        </PageCard>
      </main>
      <Footer />
    </div>
  );
}
