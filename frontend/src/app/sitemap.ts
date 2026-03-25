import type { MetadataRoute } from 'next';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tokamak.ai';

const VAULT_FACTORY = '0x9cF9828Fd6253Df7C9497fd06Fa531E0CCc1d822' as const;

const GET_ALL_VAULTS_ABI = [
  {
    type: 'function',
    name: 'getAllVaults',
    inputs: [],
    outputs: [{ type: 'address[]' }],
    stateMutability: 'view',
  },
] as const;

async function getVaultAddresses(): Promise<string[]> {
  try {
    const client = createPublicClient({
      chain: mainnet,
      transport: http(),
    });
    const vaults = await client.readContract({
      address: VAULT_FACTORY,
      abi: GET_ALL_VAULTS_ABI,
      functionName: 'getAllVaults',
    });
    return vaults as string[];
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/vaults`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/staking`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/whitepaper`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ];

  const vaultAddresses = await getVaultAddresses();
  const vaultRoutes: MetadataRoute.Sitemap = vaultAddresses.map((address) => ({
    url: `${SITE_URL}/vaults/${address}`,
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: 0.6,
  }));

  return [...staticRoutes, ...vaultRoutes];
}
