import type { NextApiRequest } from 'next';

export type IpReputation = {
  ip: string;
  isVpnOrProxy: boolean;
  isCloudProvider: boolean;
  riskScore?: number;
  provider?: 'ipqs' | 'none';
};

function getClientIp(req: NextApiRequest): string {
  const xf = (req.headers['x-forwarded-for'] as string) || '';
  const first = xf.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || 'unknown';
}

export async function assessIpReputation(req: NextApiRequest): Promise<IpReputation> {
  const ip = getClientIp(req);

  // If IPQS is configured, use it. Otherwise, return neutral assessment.
  const ipqsKey = process.env.IPQS_API_KEY;
  if (ipqsKey && ip && ip !== 'unknown') {
    try {
      const url = `https://ipqualityscore.com/api/json/ip/${encodeURIComponent(ipqsKey)}/${encodeURIComponent(ip)}?strictness=1&allow_public_access_points=false`;
      const res = await fetch(url, { method: 'GET' });
      const data = (await res.json()) as {
        vpn?: boolean;
        proxy?: boolean;
        tor?: boolean;
        relay?: boolean;
        active_vpn?: boolean;
        active_tor?: boolean;
        cloud_provider?: boolean;
        fraud_score?: number;
      };
      const isVpnOrProxy = Boolean(data.vpn || data.proxy || data.tor || data.relay || data.active_vpn || data.active_tor);
      const isCloudProvider = Boolean(data.cloud_provider);
      const riskScore = typeof data.fraud_score === 'number' ? data.fraud_score : undefined;
      return { ip, isVpnOrProxy, isCloudProvider, riskScore, provider: 'ipqs' };
    } catch {
      return { ip, isVpnOrProxy: false, isCloudProvider: false, provider: 'ipqs' };
    }
  }

  return { ip, isVpnOrProxy: false, isCloudProvider: false, provider: 'none' };
}


