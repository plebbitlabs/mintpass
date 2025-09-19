import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { PhoneInput, UNSUPPORTED_COUNTRIES } from '../../components/ui/phone-input';
import * as RPNInput from 'react-phone-number-input';
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '../../components/ui/input-otp';
import { Label } from '../../components/ui/label';
import { Header } from '../../components/header';
import { Footer } from '../../components/footer';
import { PageCard } from '../../components/page-card';
import { ConfettiCelebration } from '../../components/confetti-celebration';
import { ExternalLink } from 'lucide-react';

async function postJson<T>(path: string, body: unknown, opts?: { timeoutMs?: number }): Promise<T> {
  const timeoutMs = typeof opts?.timeoutMs === 'number' && opts.timeoutMs > 0 ? opts.timeoutMs : 10000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => ({}))) as unknown;
    if (!res.ok) {
      const data = json as { error?: string; cooldownSeconds?: unknown; providerError?: unknown };
      const errMsg = data?.error || 'Request failed';
      const error = new Error(errMsg) as Error & { cooldownSeconds?: number; providerError?: unknown; status?: number };
      error.status = res.status;
      const cooldownSecondsValue = data?.cooldownSeconds;
      if (typeof cooldownSecondsValue === 'number') {
        error.cooldownSeconds = cooldownSecondsValue;
      }
      const providerErrorValue = (data as { providerError?: unknown })?.providerError;
      if (providerErrorValue && typeof providerErrorValue === 'object') {
        (error as { providerError?: unknown }).providerError = providerErrorValue;
      }
      throw error;
    }
    return json as T;
  } catch (e: unknown) {
    const name = (e as { name?: string } | null)?.name || '';
    if (name === 'AbortError') {
      throw new Error('Network timeout. Please try again.');
    }
    throw e as Error;
  } finally {
    clearTimeout(timer);
  }
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
  const [selectedCountry, setSelectedCountry] = useState<string | undefined>(undefined);
  // Keep SID internally for potential debugging, but avoid unused variable warnings
  const [_, setSmsSid] = useState<string | undefined>(undefined);
  const [deliveryStatus, setDeliveryStatus] = useState<string | undefined>(undefined);

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
  const isVerificationInProgress = step === 'code' || (loading && step === 'enter');

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
  // const canVerify = code.trim().length === 6;
  
  // Check if selected country is supported by SMS provider
  const isCountrySupported = !selectedCountry || !UNSUPPORTED_COUNTRIES.includes(selectedCountry as RPNInput.Country);

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
      const sendResp = await postJson<{ ok: boolean; sid?: string; initialStatus?: string; debugCode?: string }>(
        '/api/sms/send',
        { phoneE164: phone, address: currentAddress },
        { timeoutMs: 15000 }
      );
      const sid = sendResp.sid;
      const initial = sendResp.initialStatus;
      if (sid) {
        setSmsSid(sid);
        setDeliveryStatus(initial);
        // Poll delivery status until delivered or failed/undelivered or timeout
        // Keep loading=true during this process - don't change step yet
        await pollUntilDeliveredOrFailed(sid);
      } else {
        // No provider configured or no SID returned -> proceed immediately
        setStep('code');
      }
    } catch (e: unknown) {
      if (e instanceof Error) {
        const errorWithCooldown = e as Error & { status?: number; cooldownSeconds?: number; providerError?: { provider?: string; status?: number; code?: number | string; message?: string } };
        const pe = errorWithCooldown.providerError;
        // Prefer provider message/code if present
        if (pe && (pe.message || pe.code)) {
          const prov = pe.provider ? `${pe.provider} ` : '';
          const codePart = pe.code !== undefined && pe.code !== null ? ` (code ${String(pe.code)})` : '';
          const detail = `${prov}${pe.message || 'delivery error'}${codePart}`;
          setError(`${e.message} — ${detail}`);
        } else if (errorWithCooldown.status === 429 && typeof errorWithCooldown.cooldownSeconds === 'number' && errorWithCooldown.cooldownSeconds > 0) {
          // Only show cooldown countdown on explicit 429
          setCooldownSeconds(errorWithCooldown.cooldownSeconds);
          setError(e.message);
        } else {
          // Generic error fallback
          setError(e.message);
        }
      } else {
        setError('Failed to send code');
      }
    } finally {
      setLoading(false);
    }
  }

  async function pollUntilDeliveredOrFailed(sid: string) {
    const start = Date.now();
    const timeoutMs = 60_000; // 60s timeout
    let delay = 1200;
    console.log(`Starting SMS delivery polling for SID: ${sid}`);
    
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(`/api/sms/status?sid=${encodeURIComponent(sid)}`, { method: 'GET' });
        const json = (await res.json().catch(() => ({}))) as { status?: string; errorCode?: number | string; errorMessage?: string };
        const status = (json.status || '').toString();
        console.log(`SMS status poll result:`, { status, errorCode: json.errorCode, errorMessage: json.errorMessage });
        setDeliveryStatus(status);
        
        if (status.toLowerCase() === 'delivered') {
          console.log('SMS delivered successfully, proceeding to code entry');
          setStep('code');
          return;
        }
        if (status.toLowerCase() === 'undelivered' || status.toLowerCase() === 'failed') {
          const codeStr = json.errorCode !== undefined && json.errorCode !== null ? ` (code ${String(json.errorCode)})` : '';
          const msg = json.errorMessage ? ` ${json.errorMessage}` : '';
          console.log('SMS delivery failed:', { status, errorCode: json.errorCode, errorMessage: json.errorMessage });
          setError(`SMS could not be delivered.${msg}${codeStr}`);
          return; // Stay on enter step, don't change step
        }
      } catch (pollError) {
        console.error('Error polling SMS status:', pollError);
      }
      await new Promise((r) => setTimeout(r, delay));
      // backoff a little but keep it snappy
      delay = Math.min(2500, Math.floor(delay * 1.2));
    }
    // Timeout reached - show error instead of proceeding
    console.log('SMS delivery status polling timed out after 60s');
    setError('Unable to confirm SMS delivery. Please check your phone number and try again.');
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
                  disabled={loading || !isCountrySupported}
                >
{loading ? 'Sending code…' : 'Send code'}
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
                      onCountryChange={(country) => {
                        setSelectedCountry(country);
                        // Clear error when country changes
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
                  {(error || !isCountrySupported || cooldownSeconds > 0) && (
                    <p className="text-sm text-destructive">
                      {!isCountrySupported
                        ? 'SMS verification is not available for the selected country due to security restrictions.'
                        : cooldownSeconds > 0
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
                      <InputOTP maxLength={6} value={code} onChange={setCode} autoFocus onComplete={handleOtpComplete} disabled={loading}>
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
                    <p className="text-sm text-muted-foreground pt-4">
                      {loading 
                        ? 'Verifying... please don\'t close this page' 
                        : 'Please enter the 6-digit code to proceed with verification'}
                    </p>
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
