import { NextResponse } from 'next/server';
import { keccak256, toHex } from 'viem';
import { resolveAgent, proxyGet, proxyPost } from '../../resolve';

const TASK_FEE_ESCROW_ADDRESS = '0x6D68Cd8fD89BF1746A1948783C92A00E591d1227' as const;

/**
 * Server-side confirmTask: releases escrowed fees to agentBalances.
 * Uses the OPERATOR_PRIVATE_KEY env var (agent owner/operator's key).
 * All viem/accounts imports are dynamic to avoid polluting global types.
 */
async function serverConfirmTask(taskRef: string): Promise<{ txHash: string } | null> {
  const pk = process.env.OPERATOR_PRIVATE_KEY;
  if (!pk) {
    console.warn('[confirmTask] OPERATOR_PRIVATE_KEY not set — skipping server-side confirmation');
    return null;
  }
  try {
    const { createWalletClient, createPublicClient, http } = await import('viem');
    const { privateKeyToAccount } = await import('viem/accounts');
    const { THANOS_RPC_URL } = await import('@/lib/rpc');
    const { TaskFeeEscrowABI } = await import('../../../../../../../sdk/src/abi/TaskFeeEscrow');

    const thanosSepolia = {
      id: 111551119090,
      name: 'Thanos Sepolia',
      nativeCurrency: { name: 'TON', symbol: 'TON', decimals: 18 },
      rpcUrls: { default: { http: ['https://rpc.thanos-sepolia.tokamak.network'] } },
    } as const;

    const account = privateKeyToAccount(pk as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: thanosSepolia,
      transport: http(THANOS_RPC_URL),
    });
    const publicClient = createPublicClient({
      chain: thanosSepolia,
      transport: http(THANOS_RPC_URL),
    });

    const txHash = await walletClient.writeContract({
      address: TASK_FEE_ESCROW_ADDRESS,
      abi: TaskFeeEscrowABI,
      functionName: 'confirmTask',
      args: [taskRef as `0x${string}`],
    });

    // Wait for receipt to confirm it landed
    await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 30_000 });
    console.log(`[confirmTask] Confirmed taskRef=${taskRef.slice(0, 18)}... tx=${txHash}`);
    return { txHash };
  } catch (err) {
    console.error('[confirmTask] Failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Extract plain text from an A2A status message object ({role, parts}) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractA2AError(message: any): string {
  if (!message) return 'Task failed';
  if (typeof message === 'string') return message;
  if (Array.isArray(message.parts)) {
    const text = message.parts
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((p: any) => p.type === 'text')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((p: any) => p.text)
      .join('\n');
    if (text) return text;
  }
  return 'Task failed';
}

export const maxDuration = 300; // seconds - AI tasks can take a while

export async function GET(
  _request: Request,
  { params }: { params: { agentId: string } },
) {
  try {
    const { runtimeBaseUrl, a2aUrl } = await resolveAgent(params.agentId);
    if (a2aUrl || !runtimeBaseUrl) {
      // A2A agents / agents without legacy endpoints — return empty list
      return NextResponse.json({ tasks: [] });
    }
    return proxyGet(`${runtimeBaseUrl}/api/tasks`);
  } catch (err) {
    console.error('[api/tasks GET]', err);
    const msg = err instanceof Error ? err.message : 'Resolution failed';
    if (msg.includes('No agentURI') || msg.includes('not found')) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { agentId: string } },
) {
  try {
    const body = await request.json();

    if (!body.input?.text) {
      return NextResponse.json(
        { error: 'input.text is required in the request body' },
        { status: 400 },
      );
    }

    const { runtimeBaseUrl, runtimeAgentId, a2aUrl } = await resolveAgent(
      params.agentId,
    );

    if (!a2aUrl && !runtimeBaseUrl) {
      // Agent metadata found but no service endpoint configured
      return NextResponse.json(
        { error: `Agent ${params.agentId} has no A2A service URL in its IPFS metadata. The agent owner must update the metadata to include a services.A2A endpoint.` },
        { status: 422 },
      );
    }

    if (a2aUrl) {
      // A2A agent — wrap in JSON-RPC 2.0 envelope
      const rpcId = crypto.randomUUID();
      const a2aRequest = {
        jsonrpc: '2.0',
        id: rpcId,
        method: 'tasks/send',
        params: {
          message: {
            role: 'user',
            parts: [{ type: 'text', text: body.input.text }],
          },
          ...(body.paymentTxHash ? { metadata: { paymentTxHash: body.paymentTxHash, taskRef: body.taskRef } } : {}),
        },
      };
      console.log(`[api/tasks POST] A2A proxy to ${a2aUrl}, rpcId=${rpcId}`);

      const a2aRes = await proxyPost(a2aUrl, a2aRequest, 300_000);
      const rpcResponse = await a2aRes.json();

      if (rpcResponse.error) {
        return NextResponse.json(
          { error: rpcResponse.error.message || 'A2A request failed' },
          { status: 502 },
        );
      }

      // Normalize A2A task result to the TaskResult shape the frontend expects
      const a2aTask = rpcResponse.result;
      let output = '';
      if (a2aTask?.artifacts?.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dataParts = a2aTask.artifacts.flatMap((a: any) => a.parts || []).filter((p: any) => p.type === 'data').map((p: any) => p.data);
        output = dataParts.length === 1 ? JSON.stringify(dataParts[0]) : JSON.stringify(dataParts);
      } else if (a2aTask?.messages?.length) {
        const lastMsg = a2aTask.messages[a2aTask.messages.length - 1];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const textParts = (lastMsg?.parts || []).filter((p: any) => p.type === 'text').map((p: any) => p.text);
        output = textParts.join('\n');
      } else {
        output = JSON.stringify(rpcResponse);
      }

      const taskSucceeded = a2aTask?.status?.state !== 'failed';
      const taskRef = body.taskRef as string | undefined;

      // Server-side fee confirmation: if the task succeeded and was paid,
      // call confirmTask on-chain BEFORE returning the result to the user.
      let feeConfirmed = false;
      let confirmTxHash: string | null = null;
      if (taskSucceeded && taskRef) {
        const confirmResult = await serverConfirmTask(taskRef);
        if (confirmResult) {
          feeConfirmed = true;
          confirmTxHash = confirmResult.txHash;
        }
      }

      return NextResponse.json({
        taskId: a2aTask?.id || rpcId,
        agentId: params.agentId,
        status: taskSucceeded ? 'completed' : 'failed',
        input: { text: body.input.text },
        output,
        outputHash: output ? keccak256(toHex(output)) : null,
        inputHash: keccak256(toHex(body.input.text)),
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        error: taskSucceeded ? null : extractA2AError(a2aTask?.status?.message),
        metadata: { ...(a2aTask?.metadata || {}), feeConfirmed, confirmTxHash },
      });
    }

    // Legacy agent — proxy to /api/tasks
    const url = `${runtimeBaseUrl}/api/tasks`;
    const payload = { ...body, agentId: runtimeAgentId };
    console.log(`[api/tasks POST] Proxying to ${url} for agent ${runtimeAgentId}, taskRef=${body.taskRef?.slice(0, 18)}...`);

    return proxyPost(
      url,
      payload,
      300_000,
    );
  } catch (err) {
    console.error('[api/tasks POST]', err);
    const msg = err instanceof Error ? err.message : 'Resolution failed';
    if (msg.includes('No agentURI') || msg.includes('not found')) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
