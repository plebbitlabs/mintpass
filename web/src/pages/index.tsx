import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-gray-200">
        <div className="mx-auto max-w-md px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold">MintPass</h1>
          <nav className="text-sm text-gray-600">
            <Link href="/request" className="hover:underline">Request</Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-md px-4 py-10">
          <h2 className="text-xl font-semibold mb-2">NFT Authentication</h2>
          <p className="text-gray-600 mb-6">Verify your phone and receive your authentication NFT.</p>
          <Link href="/request" className="underline">Start request</Link>
        </div>
      </main>
    </div>
  );
}
