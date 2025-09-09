import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { PhoneInput } from '../../components/ui/phone-input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '../../components/ui/card';
import { Header } from '../../components/header';
import { ConfettiCelebration } from '../../components/confetti-celebration';

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
  const [eligibilityChecked, setEligibilityChecked] = useState<boolean>(false);
  const [isEligible, setIsEligible] = useState<boolean>(false);
  const [checkingEligibility, setCheckingEligibility] = useState<boolean>(false);

  useEffect(() => {
    // Hydrate address from query if not passed as prop
    const qAddr = (router.query.address as string) || '';
    const initial = prefilledAddress || qAddr;
    if (initial) setAddress(initial);
  }, [router.query.address, prefilledAddress]);

  // Navigation protection during SMS verification
  const isVerificationInProgress = step === 'code';

  // Protect against tab closing during verification
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isVerificationInProgress) {
        e.preventDefault();
        e.returnValue = 'You have an SMS verification in progress. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isVerificationInProgress]);

  // Protect against navigation during verification
  useEffect(() => {
    const handleRouteChangeStart = (url: string) => {
      if (isVerificationInProgress && !url.startsWith('/request')) {
        const confirmed = window.confirm('You have an SMS verification in progress. Are you sure you want to leave?');
        if (!confirmed) {
          router.events.emit('routeChangeError');
          throw 'Route change aborted by user';
        }
      }
    };

    router.events.on('routeChangeStart', handleRouteChangeStart);
    return () => router.events.off('routeChangeStart', handleRouteChangeStart);
  }, [router.events, isVerificationInProgress]);


  // Reset eligibility when address or phone changes
  useEffect(() => {
    setEligibilityChecked(false);
    setIsEligible(false);
    setError(''); // Clear any previous eligibility errors
  }, [address, phone]);

  const canCheckEligibility = useMemo(() => 
    address.trim().length > 0 && 
    phone && phone.length >= 5 && // Phone is already E.164 formatted from PhoneInput
    !eligibilityChecked &&
    !checkingEligibility, 
    [address, phone, eligibilityChecked, checkingEligibility]
  );

  const canSend = useMemo(() => 
    eligibilityChecked && isEligible && !loading,
    [eligibilityChecked, isEligible, loading]
  );
  const canVerify = useMemo(() => code.trim().length === 6, [code]);

  async function handleCheckEligibility() {
    try {
      setCheckingEligibility(true);
      setError('');
      const result = await postJson<{ 
        eligible: boolean; 
        reason?: string; 
      }>('/api/pre-check-eligibility', { address: address.trim(), phoneE164: phone.trim() });
      
      console.log('Eligibility check result:', result); // Debug logging
      
      setEligibilityChecked(true);
      setIsEligible(result.eligible);
      
      if (!result.eligible && result.reason) {
        console.log('Setting error:', result.reason); // Debug logging
        setError(result.reason);
      }
    } catch (e: unknown) {
      console.error('Eligibility check failed:', e); // Debug logging
      const msg = e instanceof Error ? e.message : 'Unable to verify eligibility. Please try again.';
      setError(msg);
      setEligibilityChecked(false);
      setIsEligible(false);
    } finally {
      setCheckingEligibility(false);
    }
  }

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
          setError('Address has already minted the authentication NFT');
        } else if (elig.mintedPhone) {
          setError('Phone number has already been used to mint the authentication NFT');
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
      <Header />
      {step === 'done' && <ConfettiCelebration />}
      {step === 'done' && (
        <div className="mx-auto max-w-md px-4 py-6 text-center">
          <h1 className="text-2xl font-bold mb-2 text-[#077b91]">
            You received your MintPass NFT!
          </h1>
          <p className="text-sm text-muted-foreground">
            You are now authenticated by all subplebbits that use MintPass as anti-spam challenge. 
            You can close this page and head back to the Plebbit application of your choice.
          </p>
        </div>
      )}
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
                    <Input 
                      id="address" 
                      value={address} 
                      onChange={(e) => {
                        setAddress(e.target.value);
                      }} 
                      placeholder="0x..." 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone number</Label>
                    <PhoneInput 
                      id="phone" 
                      value={phone}
                      onChange={(value) => {
                        setPhone(value || '');
                      }} 
                      placeholder="Enter phone number"
                      defaultCountry="US"
                    />
                  </div>
                  {eligibilityChecked && isEligible && (
                    <p className="text-sm text-green-600 dark:text-green-400 font-medium">Success! You&apos;re eligible.</p>
                  )}
                  {error && <p className="text-sm text-destructive">{error}</p>}
                </div>
              )}

              {step === 'code' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>We sent an SMS code to {phone}</Label>
                    <Input value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} placeholder="123456" />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                </div>
              )}

              {step === 'done' && (
                <div className="space-y-2">
                  <p className="font-medium">Authentication NFT received.</p>
                  {txHash ? (
                    <p className="text-sm text-muted-foreground">Tx: {txHash}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">On-chain mint not configured; recorded as minted.</p>
                  )}
                </div>
              )}
            </CardContent>
            <CardFooter className="flex gap-2">
              {step === 'enter' && (
                <Button 
                  onClick={eligibilityChecked && isEligible ? handleSendCode : handleCheckEligibility} 
                  disabled={(!canCheckEligibility && !canSend) || checkingEligibility || loading}
                >
                  {loading ? 'Sending…' : 
                   checkingEligibility ? 'Checking…' : 
                   eligibilityChecked && isEligible ? 'Send code' : 'Check eligibility'}
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
