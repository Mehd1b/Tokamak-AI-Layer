import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, getAddress, isAddress, parseAbi, type Chain } from 'viem';
import { hyperEvmMainnet } from '@/lib/chains';

const SUPPORTED_CHAINS: Record<number, { rpcUrl: string; chain: Chain }> = {
  999: {
    rpcUrl: process.env.RPC_URL_HYPER_MAINNET || 'https://rpc.hyperliquid.xyz/evm',
    chain: hyperEvmMainnet,
  },
};

const VAULT_FACTORY_ADDRESS = process.env.NEXT_PUBLIC_VAULT_FACTORY_ADDRESS as `0x${string}` | undefined;

const vaultFactoryAbi = parseAbi([
  'function vaultCount() external view returns (uint256)',
  'function vaultAt(uint256 index) external view returns (address)',
  'function getAllVaults() external view returns (address[])',
]);

const kernelVaultAbi = parseAbi([
  'function shares(address) external view returns (uint256)',
  'function totalShares() external view returns (uint256)',
  'function asset() external view returns (address)',
  'function agentId() external view returns (bytes32)',
  'function totalAssets() external view returns (uint256)',
]);

const erc20Abi = parseAbi([
  'function symbol() external view returns (string)',
  'function decimals() external view returns (uint8)',
]);

interface PortfolioPosition {
  vaultAddress: string;
  agentId: string;
  shares: string;
  currentValue: string;
  asset: string;
  chainId: number;
}

export async function GET(req: NextRequest) {
  try {
    const address = req.nextUrl.searchParams.get('address');
    const chainIdParam = req.nextUrl.searchParams.get('chainId') || '999';
    const format = req.nextUrl.searchParams.get('format') || 'json';

    // Validate address
    if (!address || !isAddress(address)) {
      return NextResponse.json({ error: 'Invalid or missing address parameter' }, { status: 400 });
    }

    // Validate chainId
    const chainId = parseInt(chainIdParam, 10);
    if (isNaN(chainId) || !SUPPORTED_CHAINS[chainId]) {
      return NextResponse.json(
        { error: `Unsupported chainId: ${chainIdParam}. Supported: ${Object.keys(SUPPORTED_CHAINS).join(', ')}` },
        { status: 400 },
      );
    }

    // Validate format
    if (format !== 'csv' && format !== 'json') {
      return NextResponse.json({ error: 'Invalid format. Use csv or json.' }, { status: 400 });
    }

    if (!VAULT_FACTORY_ADDRESS || !isAddress(VAULT_FACTORY_ADDRESS)) {
      return NextResponse.json({ error: 'Vault factory address not configured' }, { status: 500 });
    }

    const { rpcUrl } = SUPPORTED_CHAINS[chainId];
    const client = createPublicClient({
      transport: http(rpcUrl),
    });

    // Get all vaults
    let allVaults: readonly `0x${string}`[];
    try {
      allVaults = (await client.readContract({
        address: getAddress(VAULT_FACTORY_ADDRESS),
        abi: vaultFactoryAbi,
        functionName: 'getAllVaults',
      })) as readonly `0x${string}`[];
    } catch {
      return NextResponse.json({ error: 'Failed to read vault factory' }, { status: 502 });
    }

    // For each vault, check user shares
    const positions: PortfolioPosition[] = [];
    const userAddress = getAddress(address);

    for (const vaultAddr of allVaults) {
      try {
        const [userShares, totalShares, assetAddress, agentId] = await Promise.all([
          client.readContract({
            address: vaultAddr,
            abi: kernelVaultAbi,
            functionName: 'shares',
            args: [userAddress],
          }) as Promise<bigint>,
          client.readContract({
            address: vaultAddr,
            abi: kernelVaultAbi,
            functionName: 'totalShares',
          }) as Promise<bigint>,
          client.readContract({
            address: vaultAddr,
            abi: kernelVaultAbi,
            functionName: 'asset',
          }) as Promise<`0x${string}`>,
          client.readContract({
            address: vaultAddr,
            abi: kernelVaultAbi,
            functionName: 'agentId',
          }) as Promise<`0x${string}`>,
        ]);

        if (userShares === 0n) continue;

        // Calculate current value
        let currentValue = 0n;
        try {
          const totalAssets = (await client.readContract({
            address: vaultAddr,
            abi: kernelVaultAbi,
            functionName: 'totalAssets',
          })) as bigint;

          if (totalShares > 0n) {
            currentValue = (userShares * totalAssets) / totalShares;
          }
        } catch {
          // If totalAssets fails, just report 0
        }

        positions.push({
          vaultAddress: vaultAddr,
          agentId,
          shares: userShares.toString(),
          currentValue: currentValue.toString(),
          asset: assetAddress,
          chainId,
        });
      } catch {
        // Skip vaults that revert (might be different contract types)
        continue;
      }
    }

    // Return in requested format
    if (format === 'csv') {
      const headers = 'vaultAddress,agentId,shares,currentValue,asset,chainId';
      const rows = positions.map(
        (p) => `${p.vaultAddress},${p.agentId},${p.shares},${p.currentValue},${p.asset},${p.chainId}`,
      );
      const csv = [headers, ...rows].join('\n');

      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="portfolio-${address}-${chainId}.csv"`,
        },
      });
    }

    return NextResponse.json({ address: userAddress, chainId, positions });
  } catch (e) {
    console.error('GET /api/reports/portfolio error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
