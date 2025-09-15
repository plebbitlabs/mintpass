import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { PhoneInput } from '../../components/ui/phone-input';
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '../../components/ui/input-otp';
import { Label } from '../../components/ui/label';
import { Header } from '../../components/header';
import { Footer } from '../../components/footer';
import { PageCard } from '../../components/page-card';
import { ConfettiCelebration } from '../../components/confetti-celebration';
import { ExternalLink } from 'lucide-react';

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as unknown;
  if (!res.ok) {
    const data = json as { error?: string; cooldownSeconds?: unknown };
    const errMsg = data?.error || 'Request failed';
    const error = new Error(errMsg) as Error & { cooldownSeconds?: number };
    // Attach cooldown data to error if present
    const cooldownSecondsValue = data?.cooldownSeconds;
    if (typeof cooldownSecondsValue === 'number') {
      error.cooldownSeconds = cooldownSecondsValue;
    }
    throw error;
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
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);

  // Parse query parameters for demo customization
  const hideNft = router.query['hide-nft'] === 'true';
  const hideAddress = router.query['hide-address'] !== 'false'; // defaults to true

  // Determine if address is prefilled from props or URL
  const addressFromQuery = (router.query['eth-address'] as string) || '';
  const isAddressPrefilled = !!(prefilledAddress || addressFromQuery);
  const prefilledAddressValue = prefilledAddress || addressFromQuery;
  
  // Determine if address input should be shown
  const shouldShowAddressInput = !hideAddress || !isAddressPrefilled;

  useEffect(() => {
    // Hydrate address from query if not passed as prop
    const initial = prefilledAddressValue;
    if (initial) setAddress(initial);
  }, [prefilledAddressValue]);

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


  // Countdown timer effect
  useEffect(() => {
    if (cooldownSeconds > 0) {
      const timer = setInterval(() => {
        setCooldownSeconds(prev => {
          if (prev <= 1) {
            setError(''); // Clear error when countdown reaches 0
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [cooldownSeconds]);

  // Simple calculation during rendering (no need for useMemo)
  const canVerify = code.trim().length === 6;

  function handleOtpComplete(value: string) {
    if (loading) return;
    const normalized = (value || '').trim();
    if (normalized.length === 6) {
      setCode(normalized);
      void handleVerifyAndMint();
    }
  }


  async function handleSendCodeClick() {
    // Determine current address based on whether input is shown and has value
    const currentAddress = shouldShowAddressInput 
      ? (address.trim() || prefilledAddressValue) 
      : prefilledAddressValue;
    
    // Validate address
    if (!currentAddress || currentAddress.trim().length === 0) {
      setError('Please enter an Ethereum address');
      return;
    }
    
    // Validate phone
    if (!phone || phone.length < 5) {
      setError('Please enter a valid phone number');
      return;
    }
    
    // All validations passed, check eligibility and send code
    await handleCheckEligibilityAndSendCode(currentAddress);
  }

  async function handleCheckEligibilityAndSendCode(currentAddress: string) {
    try {
      setLoading(true);
      setError('');
      
      // First check eligibility
      const result = await postJson<{ 
        eligible: boolean; 
        reason?: string; 
      }>('/api/pre-check-eligibility', { address: currentAddress.trim(), phoneE164: phone.trim() });
      
      if (!result.eligible) {
        if (result.reason) {
          setError(result.reason);
        } else {
          setError('Not eligible to mint');
        }
        return;
      }
      
      // If eligible, send SMS code
      await postJson<unknown>('/api/sms/send', { phoneE164: phone, address: currentAddress });
      setStep('code');
    } catch (e: unknown) {
      if (e instanceof Error) {
        const errorWithCooldown = e as Error & { cooldownSeconds?: number };
        if (errorWithCooldown.cooldownSeconds && typeof errorWithCooldown.cooldownSeconds === 'number') {
          setCooldownSeconds(errorWithCooldown.cooldownSeconds);
        }
        setError(e.message);
      } else {
        setError('Failed to send code');
      }
    } finally {
      setLoading(false);
    }
  }


  async function handleVerifyAndMint() {
    try {
      setError('');
      setLoading(true);
      const currentAddress = shouldShowAddressInput 
        ? (address.trim() || prefilledAddressValue) 
        : prefilledAddressValue;
      
      await postJson<unknown>('/api/sms/verify', { phoneE164: phone, code });
      const elig = await postJson<{ 
        eligible: boolean; 
        mintedAddr: boolean; 
        mintedPhone: boolean; 
        verified: boolean; 
      }>('/api/check-eligibility', { address: currentAddress, phoneE164: phone });
      
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
        { address: currentAddress, phoneE164: phone, authorAddress: currentAddress }
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
      <main className="flex-1">
        <PageCard
          title={step !== 'done' ? (hideNft ? "Request your authentication" : "Request your authentication NFT") : hideNft ? "Authentication complete!" : "You received your MintPass NFT!"}
          titleAs="h1"
          titleClassName="text-center"
          footerClassName="flex gap-2"
          footer={step !== 'done' ? (
            <>
              {step === 'enter' && (
                <Button 
                  className="w-full"
                  onClick={handleSendCodeClick} 
                  disabled={loading}
                >
                  {loading ? 'Sending…' : 'Send code'}
                </Button>
              )}
              {step === 'code' && (
                <Button onClick={handleVerifyAndMint} disabled={!canVerify || loading}>
                  {loading ? 'Verifying…' : 'Verify & mint'}
                </Button>
              )}
            </>
          ) : undefined}
        >
              {step === 'enter' && (
                <div className="space-y-4">
                  {shouldShowAddressInput && (
                    <div className="space-y-2">
                      <Label htmlFor="address">Ethereum address</Label>
                      <Input 
                        id="address" 
                        value={address} 
                        onChange={(e) => {
                          setAddress(e.target.value);
                          // Clear error and cooldown on input change
                          setCooldownSeconds(0);
                          setError('');
                        }} 
                        placeholder="0x..." 
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone number</Label>
                    <PhoneInput 
                      id="phone" 
                      value={phone}
                      onChange={(value) => {
                        const next = value || '';
                        setPhone(next);
                        // Clear error and cooldown on input change
                        setCooldownSeconds(0);
                        setError('');
                      }} 
                      placeholder="Enter phone number"
                      defaultCountry="US"
                    />
                  </div>
                  <p className="text-[0.5rem] text-muted-foreground">
                    By clicking &ldquo;Send code&rdquo;, you agree to the{' '}
                    <Link href="/terms-and-conditions" className="underline">Terms and Conditions</Link>
                    {' '}and{' '}
                    <Link href="/privacy-policy" className="underline">Privacy Policy</Link>
                    {' '}and consent to receive a one‑time SMS to verify your phone number.
                  </p>
                  {error && (
                    <p className="text-sm text-destructive">
                      {cooldownSeconds > 0 && error.includes('Please wait') 
                        ? `Please wait ${cooldownSeconds}s before requesting another code`
                        : error}
                    </p>
                  )}
                </div>
              )}

              {step === 'code' && (
                <div className="space-y-4">
                  <div className="space-y-2 text-center">
                    <Label>We sent an SMS code to {phone}</Label>
                    <div className="flex justify-center">
                      <InputOTP maxLength={6} value={code} onChange={setCode} autoFocus onComplete={handleOtpComplete}>
                        <InputOTPGroup>
                          <InputOTPSlot index={0} />
                          <InputOTPSlot index={1} />
                          <InputOTPSlot index={2} />
                        </InputOTPGroup>
                        <InputOTPSeparator />
                        <InputOTPGroup>
                          <InputOTPSlot index={3} />
                          <InputOTPSlot index={4} />
                          <InputOTPSlot index={5} />
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                  </div>
                  {error && <p className="text-sm text-destructive text-center">{error}</p>}
                </div>
              )}

              {step === 'done' && (
                <div className="space-y-7 text-center">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      You are now authenticated by all subplebbits that use MintPass as anti-spam challenge. 
                      You can close this page and head back to the Plebbit application of your choice.
                    </p>
                  </div>
                  {!hideNft && (
                    <>
                  {txHash ? (
                    <div className="flex justify-center">
                      <Button asChild>
                        <a
                          href={`https://sepolia.basescan.org/tx/${txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View transaction
                          <ExternalLink />
                        </a>
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">On-chain mint not configured; recorded as minted.</p>
                      )}
                    </>
                  )}
                </div>
              )}
        </PageCard>
      </main>
      <Footer />
    </div>
  );
}
