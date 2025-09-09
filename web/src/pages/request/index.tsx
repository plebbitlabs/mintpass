import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '../../components/ui/card';

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as unknown;
  if (!res.ok) {
    const errMsg = (json as { error?: string })?.error || 'Request failed';
    throw new Error(errMsg);
  }
  return json as T;
}

export default function RequestPage({ prefilledAddress = '' }: { prefilledAddress?: string }) {
  const router = useRouter();
  const [address, setAddress] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [code, setCode] = useState<string>('');
  const [step, setStep] = useState<'enter' | 'code' | 'done'>('enter');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [txHash, setTxHash] = useState<string | null>(null);

  useEffect(() => {
    // Hydrate address from query if not passed as prop
    const qAddr = (router.query.address as string) || '';
    const initial = prefilledAddress || qAddr;
    if (initial) setAddress(initial);
  }, [router.query.address, prefilledAddress]);

  const canSend = useMemo(() => address.trim().length > 0 && phone.trim().length >= 5, [address, phone]);
  const canVerify = useMemo(() => code.trim().length === 6, [code]);

  async function handleSendCode() {
    try {
      setError('');
      setLoading(true);
      await postJson<unknown>('/api/sms/send', { phoneE164: phone, address });
      setStep('code');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to send code';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyAndMint() {
    try {
      setError('');
      setLoading(true);
      await postJson<unknown>('/api/sms/verify', { phoneE164: phone, code });
      const elig = await postJson<{ 
        eligible: boolean; 
        mintedAddr: boolean; 
        mintedPhone: boolean; 
        verified: boolean; 
      }>('/api/check-eligibility', { address, phoneE164: phone });
      
      if (!elig.eligible) {
        if (!elig.verified) {
          setError('Phone number not verified');
        } else if (elig.mintedAddr) {
          setError('Address has already minted an NFT');
        } else if (elig.mintedPhone) {
          setError('Phone number has already been used to mint');
        } else {
          setError('Not eligible to mint');
        }
        return;
      }
      const mint = await postJson<{ ok: boolean; txHash?: string }>(
        '/api/mint',
        { address, phoneE164: phone, authorAddress: address }
      );
      setTxHash(mint.txHash || null);
      setStep('done');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to verify or mint';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-gray-200">
        <div className="mx-auto max-w-md px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold">MintPass</h1>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-md px-4 py-8">
          <Card>
            <CardHeader>
              <CardTitle>Request your authentication NFT</CardTitle>
            </CardHeader>
            <CardContent>
              {step === 'enter' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="address">Ethereum address</Label>
                    <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x..." />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone number (E.164)</Label>
                    <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+15555550123" />
                  </div>
                  {error && <p className="text-sm text-red-600">{error}</p>}
                </div>
              )}

              {step === 'code' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>We sent an SMS code to {phone}</Label>
                    <Input value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} placeholder="123456" />
                  </div>
                  {error && <p className="text-sm text-red-600">{error}</p>}
                </div>
              )}

              {step === 'done' && (
                <div className="space-y-2">
                  <p className="font-medium">Authentication NFT received.</p>
                  {txHash ? (
                    <p className="text-sm text-gray-600">Tx: {txHash}</p>
                  ) : (
                    <p className="text-sm text-gray-600">On-chain mint not configured; recorded as minted.</p>
                  )}
                </div>
              )}
            </CardContent>
            <CardFooter className="flex gap-2">
              {step === 'enter' && (
                <Button onClick={handleSendCode} disabled={!canSend || loading}>
                  {loading ? 'Sending…' : 'Send code'}
                </Button>
              )}
              {step === 'code' && (
                <Button onClick={handleVerifyAndMint} disabled={!canVerify || loading}>
                  {loading ? 'Verifying…' : 'Verify & mint'}
                </Button>
              )}
              {step === 'done' && (
                <Button variant="outline" onClick={() => router.push('/')}>Home</Button>
              )}
            </CardFooter>
          </Card>
        </div>
      </main>
    </div>
  );
}
