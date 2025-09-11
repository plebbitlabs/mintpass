import { useState } from 'react';
import type { GetServerSideProps } from 'next';
import { verifyAdminToken } from '../../lib/admin-auth';
import { Header } from '../components/header';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { PhoneInput } from '../components/ui/phone-input';
import { Label } from '../components/ui/label';
import { PageCard } from '../components/page-card';

async function postJson<T>(
  path: string, 
  body: unknown, 
  options: { timeout?: number; maxRetries?: number } = {}
): Promise<T> {
  const { timeout = 5000, maxRetries = 3 } = options;
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      const json = (await res.json().catch(() => ({}))) as unknown;
      
      // Don't retry on 4xx errors
      if (res.status >= 400 && res.status < 500) {
        const errMsg = (json as { error?: string })?.error || 'Request failed';
        throw new Error(errMsg);
      }
      
      if (!res.ok) {
        // Retry on 5xx errors
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        const errMsg = (json as { error?: string })?.error || 'Request failed';
        throw new Error(errMsg);
      }
      
      return json as T;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error instanceof Error ? error : new Error('Request failed');
      
      // Don't retry on abort/timeout for non-network errors
      if (error instanceof Error && error.name === 'AbortError') {
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw new Error('Request timed out');
      }
      
      // Retry only on network/fetch errors
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      throw lastError;
    }
  }
  
  throw lastError || new Error('All retry attempts failed');
}

type Props = { authorized: boolean };

export default function AdminPage({ authorized: initialAuthorized }: Props) {
  const [authorized, setAuthorized] = useState<boolean>(initialAuthorized);
  const [password, setPassword] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [clearIpCooldowns, setClearIpCooldowns] = useState(true); // Default to true since IP cooldowns often block testing
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleLogin() {
    if (!password.trim()) {
      setError('Admin password required');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await postJson<{ ok: boolean }>('/api/admin/login', { password });
      setPassword('');
      setAuthorized(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Login failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      setLoading(true);
      await postJson<{ ok: boolean }>('/api/admin/logout', {});
      setAuthorized(false);
      setMessage('Logged out');
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleClearUser() {
    try {
      setError('');
      setMessage('');
      setLoading(true);
      
      const result = await postJson<{ 
        ok: boolean; 
        message: string; 
        deletedKeys: number; 
        attemptedKeys: number; 
        debug?: { 
          keysAttempted: string[]; 
          addressKeys: number; 
          phoneKeys: number; 
          ipCooldownKeys: number; 
        }; 
      }>('/api/admin/clear-user', {
        address: address.trim() || undefined,
        phoneE164: phone.trim() || undefined,
        clearIpCooldowns: clearIpCooldowns,
      });
      
      setMessage(result.message);
      // Log debug info in development for transparency
      if (result.debug) {
        console.log('Admin clear debug info:', result.debug);
      }
      setAddress('');
      setPhone('');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to clear user';
      console.error('Admin clear user error:', e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {!authorized ? (
          <PageCard title="Admin Login" contentClassName="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Admin Password</Label>
              <Input 
                id="password"
                type="password"
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                placeholder="Admin password"
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleLogin} disabled={loading} className="w-full">
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </PageCard>
        ) : (
          <PageCard title="Admin Console" contentClassName="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="clear-address">Clear Address (optional)</Label>
              <Input 
                id="clear-address"
                value={address} 
                onChange={(e) => setAddress(e.target.value)} 
                placeholder="0x123..."
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="clear-phone">Clear Phone (optional)</Label>
              <PhoneInput 
                id="clear-phone"
                value={phone} 
                onChange={(value) => setPhone(value || '')} 
                placeholder="Enter phone number"
                defaultCountry="US"
              />
            </div>

            <div className="flex items-center space-x-2 py-3">
              <input
                id="clear-cooldowns"
                type="checkbox"
                checked={clearIpCooldowns}
                onChange={(e) => setClearIpCooldowns(e.target.checked)}
                className="h-4 w-4 rounded border-input text-primary"
              />
              <Label htmlFor="clear-cooldowns" className="text-sm font-normal">
                Clear IP cooldowns (recommended for testing)
              </Label>
            </div>

            {message && <p className="text-sm text-green-600 dark:text-green-400 font-medium">{message}</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="grid grid-cols-2 gap-2">
              <Button onClick={handleClearUser} disabled={loading} className="w-full">
                {loading ? 'Clearing...' : 'Clear User Data'}
              </Button>
              <Button variant="secondary" onClick={handleLogout} disabled={loading} className="w-full">
                Logout
              </Button>
            </div>
          </PageCard>
        )}
      </main>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ req }) => {
  // Next.js may not parse cookies on Node 19/Edge; ensure we handle both
  const cookieHeader = (req as any).headers?.cookie as string | undefined;
  let token: string | undefined = (req as any).cookies?.['admin_session'];
  if (!token && typeof cookieHeader === 'string') {
    const parts = cookieHeader.split(';');
    for (const p of parts) {
      const [k, ...v] = p.trim().split('=');
      if (k === 'admin_session') {
        token = v.join('=');
        break;
      }
    }
  }
  const authorized = verifyAdminToken(token);
  return { props: { authorized } };
};
