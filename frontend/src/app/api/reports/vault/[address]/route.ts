import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, getAddress, isAddress, parseAbiItem, type Chain } from 'viem';
import { hyperEvmMainnet } from '@/lib/chains';

const SUPPORTED_CHAINS: Record<number, { rpcUrl: string; chain: Chain }> = {
  999: {
    rpcUrl: process.env.RPC_URL_HYPER_MAINNET || 'https://rpc.hyperliquid.xyz/evm',
    chain: hyperEvmMainnet,
  },
};

const executionAppliedEvent = parseAbiItem(
  'event ExecutionApplied(bytes32 indexed agentId, uint64 indexed executionNonce, bytes32 actionCommitment, uint256 actionCount)',
);

interface ExecutionRecord {
  timestamp: string;
  nonce: string;
  actionCommitment: string;
  txHash: string;
  blockNumber: string;
  actionCount: string;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  try {
    const { address: vaultAddress } = await params;
    const chainIdParam = req.nextUrl.searchParams.get('chainId') || '999';
    const format = req.nextUrl.searchParams.get('format') || 'json';
    const fromBlockParam = req.nextUrl.searchParams.get('fromBlock');

    // Validate address
    if (!vaultAddress || !isAddress(vaultAddress)) {
      return NextResponse.json({ error: 'Invalid vault address' }, { status: 400 });
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

    const { rpcUrl } = SUPPORTED_CHAINS[chainId];
    const client = createPublicClient({
      transport: http(rpcUrl),
    });

    const checksumAddress = getAddress(vaultAddress);

    // Determine from block
    const fromBlock = fromBlockParam ? BigInt(fromBlockParam) : 0n;

    // Fetch ExecutionApplied events
    let logs;
    try {
      logs = await client.getLogs({
        address: checksumAddress,
        event: executionAppliedEvent,
        fromBlock,
        toBlock: 'latest',
      });
    } catch {
      return NextResponse.json({ error: 'Failed to fetch execution logs' }, { status: 502 });
    }

    // Resolve block timestamps in parallel
    const uniqueBlockNumbers = [...new Set(logs.map((l) => l.blockNumber))];
    const blockTimestamps = new Map<bigint, bigint>();

    const blockPromises = uniqueBlockNumbers.map(async (blockNumber) => {
      try {
        if (blockNumber === null) return;
        const block = await client.getBlock({ blockNumber });
        blockTimestamps.set(blockNumber, block.timestamp);
      } catch {
        // Use 0 if we can't get the block
      }
    });
    await Promise.all(blockPromises);

    // Build execution records
    const records: ExecutionRecord[] = logs.map((log) => {
      const timestamp = log.blockNumber !== null ? blockTimestamps.get(log.blockNumber) : undefined;
      return {
        timestamp: timestamp ? new Date(Number(timestamp) * 1000).toISOString() : 'unknown',
        nonce: log.args.executionNonce?.toString() ?? '0',
        actionCommitment: log.args.actionCommitment ?? '0x',
        txHash: log.transactionHash ?? '0x',
        blockNumber: log.blockNumber?.toString() ?? '0',
        actionCount: log.args.actionCount?.toString() ?? '0',
      };
    });

    // Return in requested format
    if (format === 'csv') {
      const headers = 'timestamp,nonce,actionCommitment,txHash,blockNumber,actionCount';
      const rows = records.map(
        (r) =>
          `${r.timestamp},${r.nonce},${r.actionCommitment},${r.txHash},${r.blockNumber},${r.actionCount}`,
      );
      const csv = [headers, ...rows].join('\n');

      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="vault-${vaultAddress}-executions.csv"`,
        },
      });
    }

    return NextResponse.json({
      vaultAddress: checksumAddress,
      chainId,
      executionCount: records.length,
      executions: records,
    });
  } catch (e) {
    console.error('GET /api/reports/vault/[address] error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
