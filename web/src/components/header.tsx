import { useRouter } from 'next/router';
import { useCallback } from 'react';
import Image from 'next/image';
import { AnimatedThemeToggler } from './magicui/animated-theme-toggler';
import Link from 'next/link';

type HeaderProps = {
  /** Additional content to show in the navigation area (like links) */
  children?: React.ReactNode;
};

export function Header({ children }: HeaderProps) {
  const router = useRouter();

  const handleTitleClick = useCallback(() => {
    router.push('/');
  }, [router]);

  return (
    <header className="border-b relative z-20 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 pointer-events-auto">
      <div className="mx-auto max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl 2xl:max-w-3xl px-4 md:px-6 lg:px-8 py-3 md:py-4 flex items-center justify-between">
        <button 
          onClick={handleTitleClick}
          className="text-lg md:text-xl font-semibold hover:opacity-75 transition-opacity cursor-pointer flex items-center gap-2"
        >
          <Image
            src="/mintpass.png"
            alt="MintPass Logo"
            width={24}
            height={29}
            className="object-contain"
          />
          MintPass
        </button>
        <div className="flex items-center gap-4 md:gap-6">
          <Link href="/privacy-policy" className="text-sm md:text-base text-muted-foreground hover:underline">
            Privacy
          </Link>
          <Link href="/terms-and-conditions" className="text-sm md:text-base text-muted-foreground hover:underline">
            Terms
          </Link>
          {children}
          <AnimatedThemeToggler />
        </div>
      </div>
    </header>
  );
}
