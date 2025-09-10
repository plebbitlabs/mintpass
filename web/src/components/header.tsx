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
    <header className="border-b">
      <div className="mx-auto max-w-md px-4 py-3 flex items-center justify-between">
        <button 
          onClick={handleTitleClick}
          className="text-lg font-semibold hover:opacity-75 transition-opacity cursor-pointer flex items-center gap-2"
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
        <div className="flex items-center gap-4">
          <Link href="/privacy-policy" className="text-sm text-muted-foreground hover:underline">
            Privacy
          </Link>
          <Link href="/terms-and-conditions" className="text-sm text-muted-foreground hover:underline">
            Terms
          </Link>
          {children}
          <AnimatedThemeToggler />
        </div>
      </div>
    </header>
  );
}
