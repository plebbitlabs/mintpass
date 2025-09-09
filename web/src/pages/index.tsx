import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useState, useEffect } from 'react';
import { Header } from '../components/header';
import { RainbowButton } from '../components/magicui/rainbow-button';

export default function Home() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Only render after hydration to prevent mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <Header>
        <nav className="text-sm text-muted-foreground">
          <Link href="/request" className="hover:underline">Request</Link>
        </nav>
      </Header>
      <main className="flex-1">
        <div className="mx-auto max-w-md px-4 py-10 text-center">
          <h2 className="text-xl font-semibold mb-2">NFT Authentication</h2>
          <p className="text-muted-foreground mb-6">Verify your phone and receive your authentication NFT.</p>
          <Link href="/request">
            <RainbowButton variant={mounted && resolvedTheme === "dark" ? "outline" : "default"}>
              Start Verification
            </RainbowButton>
          </Link>
        </div>
      </main>
    </div>
  );
}
