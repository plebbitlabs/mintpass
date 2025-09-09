import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { hasMinted, hasPhoneMinted, isPhoneVerified, markMinted } from '../../../lib/kv';
import { getClientIp } from '../../../lib/request-ip';
import { isMintIpInCooldown, setMintIpCooldown } from '../../../lib/cooldowns';
import { env } from '../../../lib/env';
import { MintPassV1Abi } from '../../../lib/abi';
import { Wallet, JsonRpcProvider, Contract } from 'ethers';
import { hashIdentifier } from '../../../lib/hash';
import { globalIpRatelimit } from '../../../lib/rate-limit';

const Body = z.object({
  address: z.string().min(1),
  phoneE164: z.string().min(5),
  tokenType: z.number().int().min(0).max(65535).optional(),
  authorAddress: z.string().min(1),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const parse = Body.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Invalid body' });
  const { address, phoneE164, tokenType = 0 } = parse.data;
  const ip = getClientIp(req);

  // Global IP rate limiting
  const hashedIp = hashIdentifier('ip', ip);
  const { success, limit, reset, remaining } = await globalIpRatelimit.limit(hashedIp);
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(reset));
  if (!success) return res.status(429).json({ error: 'Too many requests' });

  const [mintedAddr, mintedPhone, verified] = await Promise.all([
    hasMinted(address),
    hasPhoneMinted(phoneE164),
    isPhoneVerified(phoneE164),
  ]);

  if (!verified) return res.status(400).json({ error: 'Phone not verified' });
  if (mintedAddr || mintedPhone) return res.status(400).json({ error: 'Already minted' });

  // Optional IP-based mint cooldown
  if (await isMintIpInCooldown(ip)) {
    return res.status(429).json({ error: 'Mint cooldown active for this IP' });
  }

  // Derive ISO country code from edge headers if present (uppercase), else 'ZZ'
  const hdrCountry = (req.headers['x-vercel-ip-country'] as string) || '';
  const country2 = (hdrCountry || '').toUpperCase();

  // If on-chain envs are configured, perform on-chain mint; otherwise, stub-mark as minted
  let txHash: string | null = null;
  if (
    env.MINTER_PRIVATE_KEY &&
    env.BASE_SEPOLIA_RPC_URL &&
    env.MINTPASSV1_ADDRESS_BASE_SEPOLIA
  ) {
    try {
      const provider = new JsonRpcProvider(env.BASE_SEPOLIA_RPC_URL);
      const wallet = new Wallet(env.MINTER_PRIVATE_KEY, provider);
      const contract = new Contract(env.MINTPASSV1_ADDRESS_BASE_SEPOLIA!, MintPassV1Abi, wallet) as unknown as {
        estimateGas: { mint: (to: string, tokenType: number) => Promise<bigint> };
        mint: (
          to: string,
          tokenType: number,
          overrides?: { gasLimit?: bigint }
        ) => Promise<{ hash: string; wait: () => Promise<{ hash?: string; status?: number; transactionHash?: string }>; }>;
      };
      const estimated: bigint = await contract.estimateGas.mint(address, tokenType);
      const gasLimit: bigint = estimated + (estimated / BigInt(5));
      const tx = await contract.mint(address, tokenType, { gasLimit });
      const receipt = await tx.wait();
      const status = receipt.status;
      if (typeof status === 'number' && status !== 1) {
        console.error('[mint] Receipt status not successful', { hash: tx.hash, address, tokenType, status });
        return res.status(500).json({ error: 'On-chain mint failed (status)' });
      }
      txHash = receipt?.transactionHash ?? receipt?.hash ?? tx.hash;
    } catch (err) {
      console.error('[mint] On-chain mint error', {
        address,
        tokenType,
        rpc: env.BASE_SEPOLIA_RPC_URL?.slice(0, 16),
        contract: env.MINTPASSV1_ADDRESS_BASE_SEPOLIA,
        err,
      });
      return res.status(500).json({ error: err instanceof Error ? err.message : 'On-chain mint failed' });
    }
  }

  await markMinted(address, phoneE164);
  await setMintIpCooldown(ip);

  return res.status(200).json({ ok: true, txHash, tokenType });
}


