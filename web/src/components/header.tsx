import { useRouter } from 'next/router';
import { useCallback } from 'react';
import { ModeToggle } from './mode-toggle';

type HeaderProps = {
  /** Whether to show navigation protection warning during verification */
  showNavigationWarning?: boolean;
  /** Additional content to show in the navigation area (like links) */
  children?: React.ReactNode;
};

export function Header({ showNavigationWarning = false, children }: HeaderProps) {
  const router = useRouter();

  const handleTitleClick = useCallback(() => {
    if (showNavigationWarning) {
      const confirmed = window.confirm('You have an SMS verification in progress. Are you sure you want to leave?');
      if (confirmed) {
        router.push('/');
      }
    } else {
      router.push('/');
    }
  }, [router, showNavigationWarning]);

  return (
    <header className="border-b">
      <div className="mx-auto max-w-md px-4 py-3 flex items-center justify-between">
        <button 
          onClick={handleTitleClick}
          className="text-lg font-semibold hover:opacity-75 transition-opacity cursor-pointer"
        >
          MintPass
        </button>
        <div className="flex items-center gap-4">
          {children}
          <ModeToggle />
        </div>
      </div>
    </header>
  );
}
