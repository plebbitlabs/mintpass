import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useState, useEffect } from 'react';
import { Header } from '../components/header';
import { RainbowButton } from '../components/magicui/rainbow-button';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <div className="mx-auto max-w-md px-4 py-10 text-center">
          <h2 className="text-xl font-semibold mb-2">NFT Authentication</h2>
          <p className="text-muted-foreground mb-6">Verify your phone and receive your authentication NFT.</p>
          <RainbowButton variant="outline">
            <Link href="/request">Start Verification</Link>
          </RainbowButton>
        </div>
      </main>
    </div>
  );
}
