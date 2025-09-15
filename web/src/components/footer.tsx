import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t relative z-20 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 pointer-events-auto">
      <div className="mx-auto max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl 2xl:max-w-3xl px-4 md:px-6 lg:px-8 py-4 flex flex-col items-center gap-2">
        <nav aria-label="Footer navigation" className="flex items-center justify-center gap-4 md:gap-6">
          <Link href="/privacy-policy" className="text-sm md:text-base font-medium text-muted-foreground transition-colors hover:text-foreground/80">
            Privacy
          </Link>
          <Link href="/terms-and-conditions" className="text-sm md:text-base font-medium text-muted-foreground transition-colors hover:text-foreground/80">
            Terms
          </Link>
          <a
            href="https://github.com/plebbitlabs/mintpass"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm md:text-base font-medium text-muted-foreground transition-colors hover:text-foreground/80"
          >
            GitHub
          </a>
          <a
            href="mailto:tom@plebbitlabs.com"
            className="text-sm md:text-base font-medium text-muted-foreground transition-colors hover:text-foreground/80"
          >
            Contact
          </a>
        </nav>
        <div className="text-xs text-muted-foreground text-center pt-2">MIT License</div>
      </div>
    </footer>
  );
}
