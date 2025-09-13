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
  const [eligibilityChecked, setEligibilityChecked] = useState<boolean>(false);
  const [isEligible, setIsEligible] = useState<boolean>(false);
  const [checkingEligibility, setCheckingEligibility] = useState<boolean>(false);
  const [agreeTerms, setAgreeTerms] = useState<boolean>(false);
  const [agreePrivacy, setAgreePrivacy] = useState<boolean>(false);
  const [showAgreementError, setShowAgreementError] = useState<boolean>(false);
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);

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


  // Track previous values to reset eligibility when inputs change
  const [prevInputs, setPrevInputs] = useState({ address: '', phone: '' });
  
  // Reset eligibility state when inputs change (during rendering)
  if (address !== prevInputs.address || phone !== prevInputs.phone) {
    setPrevInputs({ address, phone });
    // Only reset if we had actually checked eligibility before
    if (eligibilityChecked) {
      setEligibilityChecked(false);
      setIsEligible(false);
      setError('');
      setCooldownSeconds(0);
    }
  }

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

  // Calculate whether to show agreement error during rendering
  const shouldShowAgreementError = showAgreementError && (!agreeTerms || !agreePrivacy);

  function handleCheckEligibilityClick() {
    // Clear any previous agreement error
    setShowAgreementError(false);
    
    // Validate address
    if (address.trim().length === 0) {
      setError('Please enter an Ethereum address');
      return;
    }
    
    // Validate phone
    if (!phone || phone.length < 5) {
      setError('Please enter a valid phone number');
      return;
    }
    
    // Check if user has agreed to both terms and privacy
    if (!agreeTerms || !agreePrivacy) {
      setShowAgreementError(true);
      setError('');
      return;
    }
    
    // All validations passed, proceed with eligibility check
    handleCheckEligibility();
  }

  async function handleCheckEligibility() {
    try {
      setCheckingEligibility(true);
      setError('');
      const result = await postJson<{ 
        eligible: boolean; 
        reason?: string; 
      }>('/api/pre-check-eligibility', { address: address.trim(), phoneE164: phone.trim() });
      
      setEligibilityChecked(true);
      setIsEligible(result.eligible);
      
      if (!result.eligible && result.reason) {
        setError(result.reason);
      }
    } catch (e: unknown) {
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
      <main className="flex-1">
        <PageCard
          title="Request your authentication NFT"
          titleAs="h1"
          footerClassName="flex gap-2"
          footer={
            <>
              {step === 'enter' && (
                <>
                  <Button 
                    className="w-full"
                    onClick={eligibilityChecked && isEligible ? handleSendCode : handleCheckEligibilityClick} 
                    disabled={checkingEligibility || loading}
                  >
                    {loading ? 'Sending…' : 
                     checkingEligibility ? 'Checking…' : 
                     eligibilityChecked && isEligible ? 'Send code' : 'Check eligibility'}
                  </Button>
                  <Button 
                    variant="secondary" 
                    className="w-full"
                    onClick={() => router.push('/')}
                  >
                    Go back
                  </Button>
                </>
              )}
              {step === 'code' && (
                <Button onClick={handleVerifyAndMint} disabled={!canVerify || loading}>
                  {loading ? 'Verifying…' : 'Verify & mint'}
                </Button>
              )}
              {step === 'done' && (
                <Button variant="outline" onClick={() => router.push('/')}>Home</Button>
              )}
            </>
          }
        >
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
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <input
                        id="agree-terms"
                        type="checkbox"
                        checked={agreeTerms}
                        onChange={(e) => setAgreeTerms(e.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-input text-primary"
                      />
                      <div className="text-sm font-normal">
                        <Label htmlFor="agree-terms" className="font-normal inline mr-1">I agree to the</Label>
                        <Link href="/terms-and-conditions" className="underline">Terms and Conditions</Link>
                        <span className="text-red-500 ml-1">*</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <input
                        id="agree-privacy"
                        type="checkbox"
                        checked={agreePrivacy}
                        onChange={(e) => setAgreePrivacy(e.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-input text-primary"
                      />
                      <div className="text-sm font-normal">
                        <Label htmlFor="agree-privacy" className="font-normal inline mr-1">I agree to the</Label>
                        <Link href="/privacy-policy" className="underline">Privacy Policy</Link>
                        <span className="text-red-500 ml-1">*</span>
                      </div>
                    </div>
                  </div>
                  {eligibilityChecked && isEligible && (
                    <p className="text-sm text-green-600 dark:text-green-400 font-medium">Success! You&apos;re eligible.</p>
                  )}
                  {shouldShowAgreementError && (
                    <p className="text-sm text-destructive">Please agree to both Terms and Conditions and Privacy Policy before proceeding.</p>
                  )}
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
                      <InputOTP maxLength={6} value={code} onChange={setCode}>
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
                <div className="space-y-4 text-center">
                  <div className="space-y-2">
                    <h2 className="text-xl font-bold text-[#077b91]">
                      You received your MintPass NFT!
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      You are now authenticated by all subplebbits that use MintPass as anti-spam challenge. 
                      You can close this page and head back to the Plebbit application of your choice.
                    </p>
                  </div>
                  {txHash ? (
                    <p className="text-sm text-muted-foreground">Tx: {txHash}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">On-chain mint not configured; recorded as minted.</p>
                  )}
                </div>
              )}
        </PageCard>
      </main>
      <Footer />
    </div>
  );
}
