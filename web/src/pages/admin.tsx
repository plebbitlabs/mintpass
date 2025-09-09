import { useState } from 'react';
import { Header } from '../components/header';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

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

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [clearIpCooldowns, setClearIpCooldowns] = useState(true); // Default to true since IP cooldowns often block testing
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleClearUser() {
    if (!password.trim()) {
      setError('Admin password required');
      return;
    }

    try {
      setError('');
      setMessage('');
      setLoading(true);
      
      const result = await postJson<{ ok: boolean; message: string; deletedKeys: number; attemptedKeys: number }>('/api/admin/clear-user', {
        adminPassword: password,
        address: address.trim() || undefined,
        phoneE164: phone.trim() || undefined,
        clearIpCooldowns: clearIpCooldowns,
      });
      
      setMessage(result.message);
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
        <div className="mx-auto max-w-md px-4 py-8">
          <Card>
            <CardHeader>
              <CardTitle>Admin Console</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Admin Password</Label>
                <Input 
                  id="password"
                  type="password"
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  placeholder="Admin password"
                />
              </div>
              
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
                <Input 
                  id="clear-phone"
                  value={phone} 
                  onChange={(e) => setPhone(e.target.value)} 
                  placeholder="+15555550123"
                />
              </div>

              <div className="flex items-center space-x-2">
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

              <Button onClick={handleClearUser} disabled={loading} className="w-full">
                {loading ? 'Clearing...' : 'Clear User Data'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
