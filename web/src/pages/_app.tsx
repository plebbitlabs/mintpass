import type { AppProps } from 'next/app';
import { ThemeProvider } from 'next-themes';
import '../styles/globals.css';
import { HexagonBackground } from '@/components/ui/shadcn-io/hexagon-background';
import { Analytics } from '@vercel/analytics/next';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <HexagonBackground className="min-h-screen">
        <Component {...pageProps} />
        <Analytics />
      </HexagonBackground>
    </ThemeProvider>
  );
}
