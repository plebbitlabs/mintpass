import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useState, useEffect } from 'react';
import { Header } from '../components/header';
import { RainbowButton } from '../components/magicui/rainbow-button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <div className="mx-auto max-w-md px-4 py-10 pointer-events-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-center">NFT Authentication</CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-6">
              <p className="text-muted-foreground">Verify your phone and receive your authentication NFT.</p>
              <RainbowButton variant="outline">
                <Link href="/request">Start Verification</Link>
              </RainbowButton>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
