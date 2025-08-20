import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { hasMinted, hasPhoneMinted, isPhoneVerified, markMinted } from '../../../lib/kv';
import { getClientIp } from '../../../lib/request-ip';
import { isMintIpInCooldown, setMintIpCooldown } from '../../../lib/cooldowns';
import { env, requireEnv } from '../../../lib/env';
import { MintPassV1Abi } from '../../../lib/abi';
import { Wallet, JsonRpcProvider, Contract } from 'ethers';

const Body = z.object({
  address: z.string().min(1),
  phoneE164: z.string().min(5),
  tokenType: z.number().int().min(0).max(65535).optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const parse = Body.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Invalid body' });
  const { address, phoneE164, tokenType = 0 } = parse.data;
  const ip = getClientIp(req);

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

  // If on-chain envs are configured, perform on-chain mint; otherwise, stub-mark as minted
  let txHash: string | null = null;
  if (
    env.MINTER_PRIVATE_KEY &&
    env.BASE_SEPOLIA_RPC_URL &&
    env.MINTPASSV1_ADDRESS_BASE_SEPOLIA
  ) {
    try {
      const provider = new JsonRpcProvider(
        env.BASE_SEPOLIA_RPC_URL
      );
      const wallet = new Wallet(
        env.MINTER_PRIVATE_KEY,
        provider
      );
      const contract = new Contract(
        env.MINTPASSV1_ADDRESS_BASE_SEPOLIA,
        MintPassV1Abi,
        wallet
      );
      const tx = await contract.mint(address, tokenType);
      const receipt = await tx.wait();
      txHash = receipt?.hash ?? tx.hash;
    } catch {
      return res.status(500).json({ error: 'On-chain mint failed' });
    }
  }

  await markMinted(address, phoneE164);
  await setMintIpCooldown(ip);

  return res.status(200).json({ ok: true, txHash, tokenType });
}


