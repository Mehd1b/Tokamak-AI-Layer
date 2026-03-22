# SDK React Hooks + Guided Vault Onboarding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add React hooks to the TypeScript SDK (`/react` subpath), fully migrate the frontend to use them, and add a guided onboarding UX that reduces deposit abandonment.

**Architecture:** React hooks wrap existing SDK client classes (ExecutionKernelClient, KernelVaultClient, etc.) with @tanstack/react-query for caching and wagmi for wallet state. A TokamakProvider context initializes the SDK from wagmi's connected wallet. The frontend replaces all custom hooks with SDK hooks and adds four onboarding components (VaultExplainer, NetworkBanner, DepositStepper, PostDepositConfirmation).

**Tech Stack:** TypeScript, React 18, wagmi v2, @tanstack/react-query v5, viem v2, Next.js 14, tsup

---

### Task 1: Add typed errors to SDK

**Files:**
- Create: `sdk/src/errors.ts`
- Modify: `sdk/src/index.ts`

**Step 1: Create `sdk/src/errors.ts`**

```typescript
export enum ErrorCode {
  NETWORK_MISMATCH = 'NETWORK_MISMATCH',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  USER_REJECTED = 'USER_REJECTED',
  APPROVAL_FAILED = 'APPROVAL_FAILED',
  DEPOSIT_FAILED = 'DEPOSIT_FAILED',
  WITHDRAW_FAILED = 'WITHDRAW_FAILED',
  AGENT_NOT_FOUND = 'AGENT_NOT_FOUND',
  VAULT_NOT_FOUND = 'VAULT_NOT_FOUND',
  STRATEGY_ACTIVE = 'STRATEGY_ACTIVE',
  TRANSACTION_REVERTED = 'TRANSACTION_REVERTED',
}

export class TokamakError extends Error {
  public readonly code: ErrorCode;
  public readonly cause?: unknown;

  constructor(code: ErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'TokamakError';
    this.code = code;
    this.cause = cause;
  }

  static from(err: unknown): TokamakError {
    if (err instanceof TokamakError) return err;
    if (err instanceof Error) {
      const msg = err.message.toLowerCase();
      if (msg.includes('user rejected') || msg.includes('user denied'))
        return new TokamakError(ErrorCode.USER_REJECTED, 'Transaction rejected by user', err);
      if (msg.includes('insufficient funds') || msg.includes('insufficient balance'))
        return new TokamakError(ErrorCode.INSUFFICIENT_BALANCE, 'Insufficient balance for transaction', err);
      if (msg.includes('strategyactive'))
        return new TokamakError(ErrorCode.STRATEGY_ACTIVE, 'Vault has an active strategy — deposits are locked until it settles', err);
      return new TokamakError(ErrorCode.TRANSACTION_REVERTED, err.message, err);
    }
    return new TokamakError(ErrorCode.TRANSACTION_REVERTED, String(err), err);
  }
}

export class DepositError extends TokamakError {
  constructor(code: ErrorCode, message: string, cause?: unknown) {
    super(code, message, cause);
    this.name = 'DepositError';
  }

  static from(err: unknown): DepositError {
    const base = TokamakError.from(err);
    return new DepositError(base.code, base.message, base.cause);
  }
}

export class WithdrawError extends TokamakError {
  constructor(code: ErrorCode, message: string, cause?: unknown) {
    super(code, message, cause);
    this.name = 'WithdrawError';
  }

  static from(err: unknown): WithdrawError {
    const base = TokamakError.from(err);
    return new WithdrawError(base.code, base.message, base.cause);
  }
}
```

**Step 2: Export from `sdk/src/index.ts`**

Add at the end of `sdk/src/index.ts`:
```typescript
export { TokamakError, DepositError, WithdrawError, ErrorCode } from './errors';
```

**Step 3: Verify**

Run: `cd sdk && npm run typecheck`
Expected: No errors.

**Step 4: Commit**

```bash
git add sdk/src/errors.ts sdk/src/index.ts
git commit -m "feat(sdk): add typed error classes with error code enum"
```

---

### Task 2: Create TokamakProvider and chain validation hook

**Files:**
- Create: `sdk/src/react/provider.tsx`
- Create: `sdk/src/react/useChainValidation.ts`

**Step 1: Create `sdk/src/react/provider.tsx`**

```tsx
'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { usePublicClient, useWalletClient, useChainId } from 'wagmi';
import { ExecutionKernelClient } from '../ExecutionKernelClient';
import { DEPLOYMENTS } from '../addresses';
import type { DeploymentAddresses } from '../types';

interface TokamakProviderProps {
  children: ReactNode;
  addresses?: DeploymentAddresses;
}

const TokamakContext = createContext<ExecutionKernelClient | null>(null);

export function TokamakProvider({ children, addresses }: TokamakProviderProps) {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const chainId = useChainId();

  const client = useMemo(() => {
    if (!publicClient) return null;
    const addrs = addresses ?? DEPLOYMENTS[chainId];
    if (!addrs) return null;
    return new ExecutionKernelClient({
      publicClient,
      walletClient: walletClient ?? undefined,
      ...addrs,
    });
  }, [publicClient, walletClient, chainId, addresses]);

  return (
    <TokamakContext.Provider value={client}>
      {children}
    </TokamakContext.Provider>
  );
}

export function useTokamakClient(): ExecutionKernelClient | null {
  return useContext(TokamakContext);
}

export function useRequiredTokamakClient(): ExecutionKernelClient {
  const client = useContext(TokamakContext);
  if (!client) {
    throw new Error(
      'useTokamakClient: no client available. ' +
      'Wrap your app in <TokamakProvider> and ensure the wallet is connected to a supported chain.'
    );
  }
  return client;
}
```

**Step 2: Create `sdk/src/react/useChainValidation.ts`**

```tsx
'use client';

import { useChainId } from 'wagmi';

const LEGACY_GAS_CHAINS = new Set([999, 998]);

export function useIsLegacyChain(): boolean {
  const chainId = useChainId();
  return LEGACY_GAS_CHAINS.has(chainId);
}

export function useIsChainSupported(): boolean {
  const chainId = useChainId();
  // Import DEPLOYMENTS lazily to avoid circular deps
  const { DEPLOYMENTS } = require('../addresses');
  return chainId in DEPLOYMENTS;
}

export function useChainMismatch(expectedChainId?: number): boolean {
  const chainId = useChainId();
  if (!expectedChainId) return false;
  return chainId !== expectedChainId;
}

export function getLegacyGasOverrides(chainId: number): { type?: 'legacy' } {
  return LEGACY_GAS_CHAINS.has(chainId) ? { type: 'legacy' as const } : {};
}
```

**Step 3: Verify**

Run: `cd sdk && npx tsc --noEmit --jsx react-jsx --esModuleInterop src/react/provider.tsx`

Note: This may fail until we add react/wagmi deps in Task 5. That's OK — we'll verify the full build then.

**Step 4: Commit**

```bash
git add sdk/src/react/provider.tsx sdk/src/react/useChainValidation.ts
git commit -m "feat(sdk): add TokamakProvider and chain validation hooks"
```

---

### Task 3: Create read hooks (useAgent, useVault, useVaultList, useUserShares)

**Files:**
- Create: `sdk/src/react/useAgent.ts`
- Create: `sdk/src/react/useVault.ts`
- Create: `sdk/src/react/useVaultList.ts`
- Create: `sdk/src/react/useUserShares.ts`

**Step 1: Create `sdk/src/react/useAgent.ts`**

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { useTokamakClient } from './provider';
import type { KernelAgentInfo } from '../types';

export function useAgent(agentId: `0x${string}` | undefined) {
  const client = useTokamakClient();

  return useQuery<KernelAgentInfo | null>({
    queryKey: ['tokamak', 'agent', agentId],
    queryFn: async () => {
      if (!client || !agentId) return null;
      return client.getAgent(agentId);
    },
    enabled: !!client && !!agentId,
    staleTime: 60_000,
  });
}

export function useAgentList() {
  const client = useTokamakClient();

  return useQuery<KernelAgentInfo[]>({
    queryKey: ['tokamak', 'agents'],
    queryFn: async () => {
      if (!client) return [];
      const ids = await client.agents.getAllAgentIds();
      const agents = await Promise.all(ids.map((id: `0x${string}`) => client.getAgent(id)));
      return agents.filter((a): a is KernelAgentInfo => a !== null && a.exists);
    },
    enabled: !!client,
    staleTime: 60_000,
  });
}
```

**Step 2: Create `sdk/src/react/useVault.ts`**

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { useTokamakClient } from './provider';
import type { KernelVaultInfo } from '../types';
import { useAccount } from 'wagmi';

export function useVault(vaultAddress: `0x${string}` | undefined) {
  const client = useTokamakClient();
  const { address: userAddress } = useAccount();

  return useQuery<KernelVaultInfo | null>({
    queryKey: ['tokamak', 'vault', vaultAddress, userAddress],
    queryFn: async () => {
      if (!client || !vaultAddress) return null;
      const vaultClient = client.createVaultClient(vaultAddress);
      return vaultClient.getInfo(userAddress);
    },
    enabled: !!client && !!vaultAddress,
    staleTime: 30_000,
  });
}
```

**Step 3: Create `sdk/src/react/useVaultList.ts`**

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { useTokamakClient } from './provider';

export interface VaultListItem {
  address: `0x${string}`;
  agentId: `0x${string}`;
  asset: `0x${string}`;
  totalAssets: bigint;
  totalShares: bigint;
  totalValueLocked: bigint;
}

export function useVaultList() {
  const client = useTokamakClient();

  return useQuery<VaultListItem[]>({
    queryKey: ['tokamak', 'vaults'],
    queryFn: async () => {
      if (!client) return [];
      const addresses = await client.vaultFactory.getAllVaults();
      const vaults = await Promise.all(
        addresses.map(async (addr: `0x${string}`) => {
          try {
            const vc = client.createVaultClient(addr);
            const info = await vc.getInfo();
            return {
              address: addr,
              agentId: info.agentId,
              asset: info.asset,
              totalAssets: info.totalAssets,
              totalShares: info.totalShares,
              totalValueLocked: info.totalValueLocked,
            } as VaultListItem;
          } catch {
            return null;
          }
        })
      );
      return vaults.filter((v): v is VaultListItem => v !== null);
    },
    enabled: !!client,
    staleTime: 30_000,
  });
}

export function useVaultsForAgent(agentId: `0x${string}` | undefined) {
  const { data: allVaults, ...rest } = useVaultList();

  const filtered = allVaults?.filter((v) => v.agentId === agentId) ?? [];

  return { data: filtered, ...rest };
}
```

**Step 4: Create `sdk/src/react/useUserShares.ts`**

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { useTokamakClient } from './provider';
import { useAccount } from 'wagmi';

export interface UserSharesInfo {
  shares: bigint;
  assetsValue: bigint;
}

export function useUserShares(vaultAddress: `0x${string}` | undefined) {
  const client = useTokamakClient();
  const { address } = useAccount();

  return useQuery<UserSharesInfo | null>({
    queryKey: ['tokamak', 'userShares', vaultAddress, address],
    queryFn: async () => {
      if (!client || !vaultAddress || !address) return null;
      const vc = client.createVaultClient(vaultAddress);
      const shares = await vc.shares(address);
      const assetsValue = shares > 0n ? await vc.convertToAssets(shares) : 0n;
      return { shares, assetsValue };
    },
    enabled: !!client && !!vaultAddress && !!address,
    staleTime: 15_000,
  });
}
```

**Step 5: Commit**

```bash
git add sdk/src/react/useAgent.ts sdk/src/react/useVault.ts sdk/src/react/useVaultList.ts sdk/src/react/useUserShares.ts
git commit -m "feat(sdk): add read hooks (useAgent, useVault, useVaultList, useUserShares)"
```

---

### Task 4: Create write hooks (useDeposit, useWithdraw)

**Files:**
- Create: `sdk/src/react/useDeposit.ts`
- Create: `sdk/src/react/useWithdraw.ts`

**Step 1: Create `sdk/src/react/useDeposit.ts`**

```tsx
'use client';

import { useState, useCallback } from 'react';
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi';
import { erc20Abi, parseEther } from 'viem';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useTokamakClient } from './provider';
import { getLegacyGasOverrides } from './useChainValidation';
import { DepositError, ErrorCode } from '../errors';

export type DepositStep = 'idle' | 'checking' | 'approving' | 'depositing' | 'success' | 'error';

export interface UseDepositReturn {
  step: DepositStep;
  error: DepositError | null;
  txHash: `0x${string}` | null;
  sharesMinted: bigint | null;
  deposit: (amount: bigint) => Promise<void>;
  reset: () => void;
  needsApproval: (amount: bigint) => boolean;
  isETH: boolean;
  allowance: bigint;
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

export function useDeposit(
  vaultAddress: `0x${string}` | undefined,
  asset: `0x${string}` | undefined
): UseDepositReturn {
  const client = useTokamakClient();
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<DepositStep>('idle');
  const [error, setError] = useState<DepositError | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [sharesMinted, setSharesMinted] = useState<bigint | null>(null);

  const isETH = !asset || asset === ZERO_ADDRESS;

  // Query allowance for ERC20
  const { data: allowance = 0n } = useQuery({
    queryKey: ['tokamak', 'allowance', asset, vaultAddress, address],
    queryFn: async () => {
      if (!publicClient || !address || !vaultAddress || !asset || isETH) return 0n;
      return publicClient.readContract({
        address: asset,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address, vaultAddress],
      });
    },
    enabled: !!publicClient && !!address && !!vaultAddress && !isETH,
    staleTime: 10_000,
  });

  const needsApproval = useCallback(
    (amount: bigint) => !isETH && allowance < amount,
    [isETH, allowance]
  );

  const deposit = useCallback(async (amount: bigint) => {
    if (!client || !vaultAddress || !walletClient || !publicClient || !address) {
      setError(new DepositError(ErrorCode.TRANSACTION_REVERTED, 'Wallet not connected'));
      setStep('error');
      return;
    }

    try {
      setError(null);
      setTxHash(null);
      setSharesMinted(null);

      const vaultClient = client.createVaultClient(vaultAddress);

      // Approve if needed (ERC20 only)
      if (!isETH && allowance < amount) {
        setStep('approving');
        const approveTx = await walletClient.writeContract({
          address: asset!,
          abi: erc20Abi,
          functionName: 'approve',
          args: [vaultAddress, amount],
          ...getLegacyGasOverrides(chainId),
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
        // Invalidate allowance cache
        await queryClient.invalidateQueries({
          queryKey: ['tokamak', 'allowance', asset, vaultAddress, address],
        });
      }

      // Deposit
      setStep('depositing');
      const result = isETH
        ? await vaultClient.depositETH(amount)
        : await vaultClient.depositERC20(amount);

      setTxHash(result.txHash);
      setSharesMinted(result.sharesMinted);
      setStep('success');

      // Invalidate vault and user shares queries
      await queryClient.invalidateQueries({ queryKey: ['tokamak', 'vault', vaultAddress] });
      await queryClient.invalidateQueries({ queryKey: ['tokamak', 'userShares', vaultAddress] });
    } catch (err) {
      const depositErr = DepositError.from(err);
      setError(depositErr);
      setStep('error');
    }
  }, [client, vaultAddress, walletClient, publicClient, address, isETH, allowance, asset, chainId, queryClient]);

  const reset = useCallback(() => {
    setStep('idle');
    setError(null);
    setTxHash(null);
    setSharesMinted(null);
  }, []);

  return { step, error, txHash, sharesMinted, deposit, reset, needsApproval, isETH, allowance };
}
```

**Step 2: Create `sdk/src/react/useWithdraw.ts`**

```tsx
'use client';

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTokamakClient } from './provider';
import { WithdrawError, ErrorCode } from '../errors';

export type WithdrawStep = 'idle' | 'withdrawing' | 'success' | 'error';

export interface UseWithdrawReturn {
  step: WithdrawStep;
  error: WithdrawError | null;
  txHash: `0x${string}` | null;
  assetsOut: bigint | null;
  withdraw: (shares: bigint) => Promise<void>;
  reset: () => void;
}

export function useWithdraw(vaultAddress: `0x${string}` | undefined): UseWithdrawReturn {
  const client = useTokamakClient();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<WithdrawStep>('idle');
  const [error, setError] = useState<WithdrawError | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [assetsOut, setAssetsOut] = useState<bigint | null>(null);

  const withdraw = useCallback(async (shares: bigint) => {
    if (!client || !vaultAddress) {
      setError(new WithdrawError(ErrorCode.TRANSACTION_REVERTED, 'Wallet not connected'));
      setStep('error');
      return;
    }

    try {
      setError(null);
      setTxHash(null);
      setAssetsOut(null);
      setStep('withdrawing');

      const vaultClient = client.createVaultClient(vaultAddress);
      const result = await vaultClient.withdraw(shares);

      setTxHash(result.txHash);
      setAssetsOut(result.assetsOut);
      setStep('success');

      await queryClient.invalidateQueries({ queryKey: ['tokamak', 'vault', vaultAddress] });
      await queryClient.invalidateQueries({ queryKey: ['tokamak', 'userShares', vaultAddress] });
    } catch (err) {
      setError(WithdrawError.from(err));
      setStep('error');
    }
  }, [client, vaultAddress, queryClient]);

  const reset = useCallback(() => {
    setStep('idle');
    setError(null);
    setTxHash(null);
    setAssetsOut(null);
  }, []);

  return { step, error, txHash, assetsOut, withdraw, reset };
}
```

**Step 3: Commit**

```bash
git add sdk/src/react/useDeposit.ts sdk/src/react/useWithdraw.ts
git commit -m "feat(sdk): add stateful deposit and withdraw hooks with legacy gas auto-detection"
```

---

### Task 5: SDK package config and react entry point

**Files:**
- Create: `sdk/src/react/index.ts`
- Modify: `sdk/package.json`
- Modify: `sdk/tsup.config.ts`

**Step 1: Create `sdk/src/react/index.ts`**

```typescript
// React hooks for @tokamak/execution-kernel-sdk
// Usage: import { TokamakProvider, useVault } from '@tokamak/execution-kernel-sdk/react'

export { TokamakProvider, useTokamakClient, useRequiredTokamakClient } from './provider';
export { useAgent, useAgentList } from './useAgent';
export { useVault } from './useVault';
export { useVaultList, useVaultsForAgent, type VaultListItem } from './useVaultList';
export { useUserShares, type UserSharesInfo } from './useUserShares';
export { useDeposit, type DepositStep, type UseDepositReturn } from './useDeposit';
export { useWithdraw, type WithdrawStep, type UseWithdrawReturn } from './useWithdraw';
export { useIsLegacyChain, useIsChainSupported, useChainMismatch } from './useChainValidation';
```

**Step 2: Update `sdk/package.json`**

Add to the existing package.json:
- `"exports"` field with `.` and `./react` subpaths
- React/wagmi/react-query as optional peer dependencies

The key additions:
```json
{
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./react": {
      "import": "./dist/react.mjs",
      "require": "./dist/react.js",
      "types": "./dist/react.d.ts"
    }
  },
  "peerDependencies": {
    "viem": "^2.21.0",
    "react": "^18.0.0 || ^19.0.0",
    "wagmi": "^2.0.0",
    "@tanstack/react-query": "^5.0.0"
  },
  "peerDependenciesMeta": {
    "react": { "optional": true },
    "wagmi": { "optional": true },
    "@tanstack/react-query": { "optional": true }
  }
}
```

**Step 3: Update `sdk/tsup.config.ts`**

Read the current file, then update `entry` to include both entry points:

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    react: 'src/react/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['react', 'wagmi', '@tanstack/react-query'],
});
```

**Step 4: Install dev dependencies for type checking**

Run: `cd sdk && npm install --save-dev react @types/react wagmi @tanstack/react-query @wagmi/core`

**Step 5: Verify build**

Run: `cd sdk && npm run build`
Expected: Builds CJS + ESM + DTS for both `index` and `react` entry points.

Run: `cd sdk && npm run typecheck`
Expected: No type errors.

**Step 6: Commit**

```bash
git add sdk/src/react/index.ts sdk/package.json sdk/tsup.config.ts
git commit -m "feat(sdk): configure /react subpath export with tsup dual entry build"
```

---

### Task 6: Frontend — integrate TokamakProvider

**Files:**
- Modify: `frontend/src/app/providers.tsx`
- Modify: `frontend/package.json` (if SDK not already linked)

**Step 1: Add TokamakProvider to the provider stack**

In `frontend/src/app/providers.tsx`, import and wrap:

```tsx
import { TokamakProvider } from '@tokamak/execution-kernel-sdk/react';
```

Add `<TokamakProvider>` inside the existing provider chain, after `<QueryClientProvider>` and `<RainbowKitProvider>`, wrapping the `<NetworkProvider>` and `{children}`:

```tsx
<WagmiProvider config={...}>
  <QueryClientProvider client={...}>
    <RainbowKitProvider>
      <TokamakProvider>
        <NetworkProvider>
          {children}
        </NetworkProvider>
      </TokamakProvider>
    </RainbowKitProvider>
  </QueryClientProvider>
</WagmiProvider>
```

**Step 2: Verify**

Run: `cd frontend && npm run build`
Expected: Builds successfully.

**Step 3: Commit**

```bash
git add frontend/src/app/providers.tsx
git commit -m "feat(frontend): integrate TokamakProvider into app provider stack"
```

---

### Task 7: Frontend — onboarding components

**Files:**
- Create: `frontend/src/components/VaultExplainer.tsx`
- Create: `frontend/src/components/NetworkBanner.tsx`
- Create: `frontend/src/components/DepositStepper.tsx`
- Create: `frontend/src/components/PostDepositConfirmation.tsx`

**Step 1: Create `VaultExplainer.tsx`**

First-visit modal explaining vaults, agents, and shares. Dismissed via localStorage.

```tsx
'use client';

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'tokamak_onboarded';

export function VaultExplainer() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem(STORAGE_KEY)) {
      setShow(true);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="card max-w-lg mx-4 p-8 space-y-6">
        <h2 className="text-2xl font-serif font-bold text-white">Welcome to Tokamak Vaults</h2>

        <div className="space-y-4 text-sm text-white/70">
          <div>
            <h3 className="font-semibold text-white/90 mb-1">What are Vaults?</h3>
            <p>Vaults are smart contracts that hold your funds and execute strategies automatically using verifiable AI agents.</p>
          </div>
          <div>
            <h3 className="font-semibold text-white/90 mb-1">What are Agents?</h3>
            <p>Agents are programs that run inside a secure environment (zkVM). Their execution is mathematically proven — no one can tamper with the results.</p>
          </div>
          <div>
            <h3 className="font-semibold text-white/90 mb-1">How do Shares work?</h3>
            <p>When you deposit, you receive shares representing your proportional ownership. As the agent generates returns, your shares become worth more.</p>
          </div>
          <div>
            <h3 className="font-semibold text-white/90 mb-1">Can I withdraw anytime?</h3>
            <p>Yes — you can withdraw your shares at any time, unless the vault has an active strategy in progress (typically resolves within minutes).</p>
          </div>
        </div>

        <button onClick={dismiss} className="btn-primary w-full py-3 text-base">
          Got it — show me the vaults
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Create `NetworkBanner.tsx`**

```tsx
'use client';

import { useChainId, useSwitchChain } from 'wagmi';
import { useAccount } from 'wagmi';

interface NetworkBannerProps {
  expectedChainId: number;
  chainName?: string;
}

export function NetworkBanner({ expectedChainId, chainName }: NetworkBannerProps) {
  const chainId = useChainId();
  const { isConnected } = useAccount();
  const { switchChain } = useSwitchChain();

  if (!isConnected || chainId === expectedChainId) return null;

  return (
    <div className="w-full bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 flex items-center justify-between mb-4">
      <span className="text-amber-400 text-sm">
        This vault is on {chainName ?? `chain ${expectedChainId}`}. Switch networks to deposit.
      </span>
      <button
        onClick={() => switchChain({ chainId: expectedChainId })}
        className="text-amber-400 text-sm font-semibold hover:text-amber-300 transition-colors"
      >
        Switch Network
      </button>
    </div>
  );
}
```

**Step 3: Create `DepositStepper.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { useDeposit, type DepositStep } from '@tokamak/execution-kernel-sdk/react';

interface DepositStepperProps {
  vaultAddress: `0x${string}`;
  asset: `0x${string}`;
  assetSymbol: string;
  assetDecimals: number;
  userBalance: bigint;
  onSuccess?: (sharesMinted: bigint) => void;
}

const STEP_LABELS: Record<DepositStep, string> = {
  idle: 'Enter amount',
  checking: 'Checking...',
  approving: 'Approving token...',
  depositing: 'Depositing...',
  success: 'Complete!',
  error: 'Failed',
};

export function DepositStepper({
  vaultAddress,
  asset,
  assetSymbol,
  assetDecimals,
  userBalance,
  onSuccess,
}: DepositStepperProps) {
  const { isConnected } = useAccount();
  const { step, error, deposit, reset, needsApproval, isETH } = useDeposit(vaultAddress, asset);
  const [amount, setAmount] = useState('');

  const parsedAmount = (() => {
    try {
      return amount ? parseUnits(amount, assetDecimals) : 0n;
    } catch {
      return 0n;
    }
  })();

  const handleDeposit = async () => {
    if (parsedAmount <= 0n) return;
    await deposit(parsedAmount);
    onSuccess?.(parsedAmount);
  };

  const handleMax = () => {
    setAmount(formatUnits(userBalance, assetDecimals));
  };

  // Step indicator
  const steps = isETH
    ? [{ label: 'Connect', done: isConnected }, { label: 'Deposit', done: step === 'success' }]
    : [
        { label: 'Connect', done: isConnected },
        { label: `Approve ${assetSymbol}`, done: step === 'depositing' || step === 'success' || !needsApproval(parsedAmount) },
        { label: 'Deposit', done: step === 'success' },
      ];

  const currentStepIndex = steps.findIndex((s) => !s.done);
  const totalSteps = steps.length;

  const isProcessing = step === 'approving' || step === 'depositing' || step === 'checking';

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs text-white/50">
        {steps.map((s, i) => (
          <div key={s.label} className="flex items-center gap-1">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              s.done ? 'bg-emerald-500/20 text-emerald-400' : i === currentStepIndex ? 'bg-purple-500/20 text-purple-400 animate-pulse' : 'bg-white/5 text-white/30'
            }`}>
              {s.done ? '+' : i + 1}
            </span>
            <span className={s.done ? 'text-emerald-400' : i === currentStepIndex ? 'text-white/70' : ''}>{s.label}</span>
            {i < steps.length - 1 && <span className="text-white/20 mx-1">--</span>}
          </div>
        ))}
      </div>

      {/* Amount input */}
      <div className="relative">
        <input
          type="text"
          value={amount}
          onChange={(e) => { setAmount(e.target.value); if (step === 'error') reset(); }}
          placeholder="0.00"
          disabled={isProcessing}
          className="input-dark w-full pr-24"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
          <button onClick={handleMax} disabled={isProcessing} className="text-xs text-purple-400 hover:text-purple-300">
            MAX
          </button>
          <span className="text-xs text-white/40">{assetSymbol}</span>
        </div>
      </div>

      {/* Balance */}
      <p className="text-xs text-white/40">
        Balance: {formatUnits(userBalance, assetDecimals)} {assetSymbol}
      </p>

      {/* Help text */}
      {!isETH && needsApproval(parsedAmount) && step === 'idle' && parsedAmount > 0n && (
        <p className="text-xs text-white/50">
          You need to approve the vault to spend your {assetSymbol} before depositing. This is a one-time transaction.
        </p>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-sm text-red-400">
          {error.message}
        </div>
      )}

      {/* Action button */}
      {!isConnected ? (
        <p className="text-sm text-white/50 text-center">Connect your wallet to deposit</p>
      ) : (
        <button
          onClick={handleDeposit}
          disabled={isProcessing || parsedAmount <= 0n || parsedAmount > userBalance}
          className="btn-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isProcessing ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {STEP_LABELS[step]}
              {!isETH && ` (Step ${currentStepIndex + 1} of ${totalSteps})`}
            </span>
          ) : step === 'error' ? (
            'Try Again'
          ) : !isETH && needsApproval(parsedAmount) ? (
            `Approve & Deposit ${assetSymbol} (${totalSteps} steps)`
          ) : (
            `Deposit ${assetSymbol}`
          )}
        </button>
      )}
    </div>
  );
}
```

**Step 4: Create `PostDepositConfirmation.tsx`**

```tsx
'use client';

import { formatUnits } from 'viem';

interface PostDepositConfirmationProps {
  sharesMinted: bigint;
  assetSymbol: string;
  assetDecimals: number;
  txHash: `0x${string}`;
  explorerUrl?: string;
  onDismiss: () => void;
}

export function PostDepositConfirmation({
  sharesMinted,
  assetSymbol,
  assetDecimals,
  txHash,
  explorerUrl,
  onDismiss,
}: PostDepositConfirmationProps) {
  return (
    <div className="card p-6 space-y-4 border-emerald-500/30">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
          <span className="text-emerald-400 text-lg">+</span>
        </div>
        <div>
          <h3 className="text-white font-semibold">Deposit Complete</h3>
          <p className="text-sm text-white/50">
            You received {formatUnits(sharesMinted, assetDecimals)} shares
          </p>
        </div>
      </div>

      <div className="bg-white/5 rounded-lg p-4 space-y-2 text-sm text-white/60">
        <p className="font-medium text-white/80">What happens next:</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>The vault&apos;s agent executes strategies on your behalf</li>
          <li>Your shares grow in value as the agent generates returns</li>
          <li>You can withdraw anytime (unless a strategy is in progress)</li>
        </ul>
      </div>

      {explorerUrl && (
        <a
          href={`${explorerUrl}/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
        >
          View transaction
        </a>
      )}

      <button onClick={onDismiss} className="btn-secondary w-full py-2">
        Back to Vault
      </button>
    </div>
  );
}
```

**Step 5: Commit**

```bash
git add frontend/src/components/VaultExplainer.tsx frontend/src/components/NetworkBanner.tsx \
        frontend/src/components/DepositStepper.tsx frontend/src/components/PostDepositConfirmation.tsx
git commit -m "feat(frontend): add onboarding components (explainer, stepper, network banner, confirmation)"
```

---

### Task 8: Frontend — vault detail page migration

**Files:**
- Modify: `frontend/src/app/vaults/[address]/page.tsx`

**Step 1: Migrate vault detail page**

Read the current page file. Then:

1. Replace `useVaultInfo` import with `useVault` from `@tokamak/execution-kernel-sdk/react`
2. Replace `useVaultShares` import with `useUserShares` from SDK
3. Remove the existing `VaultDepositForm` / `VaultWithdrawForm` usage
4. Add imports for `NetworkBanner`, `DepositStepper`, `PostDepositConfirmation`
5. Replace the deposit section with `DepositStepper` + `PostDepositConfirmation`
6. Add `NetworkBanner` at the top of the vault detail section (after breadcrumb, before content)
7. Keep all non-migrated hooks unchanged: `useVaultHistory`, `useVaultExecutions`, `useHyperliquidPosition`, `useVaultProtocolType`, `useVaultPerformance`, `useStrategyStatus`, `useOptimisticExecutions`

The key data mapping:
- `vaultInfo.totalAssets` → `vault.data?.totalAssets`
- `vaultInfo.agentId` → `vault.data?.agentId`
- `vaultInfo.isLoading` → `vault.isLoading`
- `userShares` (bigint) → `userSharesInfo.data?.shares`

**Step 2: Verify**

Run: `cd frontend && npm run build`
Expected: Builds with no errors.

**Step 3: Commit**

```bash
git add frontend/src/app/vaults/[address]/page.tsx
git commit -m "feat(frontend): migrate vault detail page to SDK hooks + deposit stepper"
```

---

### Task 9: Frontend — vault list and agent pages migration

**Files:**
- Modify: `frontend/src/app/vaults/page.tsx`
- Modify: `frontend/src/app/agents/page.tsx`
- Modify: `frontend/src/app/agents/[id]/page.tsx`

**Step 1: Migrate vault list page**

1. Add `VaultExplainer` component at the top of the page
2. Replace `useDeployedVaultsList()` with `useVaultList()` from SDK (if the page uses it directly)
3. Note: The vault list page likely does complex filtering/sorting that the SDK hook doesn't replicate. In that case, keep the existing `useDeployedVaultsList` hook (it fetches protocol types, optimistic status, etc. that the SDK doesn't). Just add the `VaultExplainer` component.

**Step 2: Migrate agent pages**

1. In `/agents/page.tsx`: replace `useRegisteredAgents()` with `useAgentList()` from SDK if it's a simple list
2. In `/agents/[id]/page.tsx`: replace `useAgent(agentId)` with SDK's `useAgent(agentId)`. Keep `useVaultsForAgent` if it's used.

**Step 3: Verify**

Run: `cd frontend && npm run build`
Expected: Builds with no errors.

**Step 4: Commit**

```bash
git add frontend/src/app/vaults/page.tsx frontend/src/app/agents/page.tsx frontend/src/app/agents/[id]/page.tsx
git commit -m "feat(frontend): add vault explainer, migrate agent pages to SDK hooks"
```

---

### Task 10: Build verification and cleanup

**Step 1: SDK full build**

Run: `cd sdk && npm run build && npm run typecheck`
Expected: Both pass.

**Step 2: SDK tests**

Run: `cd sdk && npm test`
Expected: All existing tests pass.

**Step 3: Frontend build**

Run: `cd frontend && npm run build`
Expected: Builds with no errors.

**Step 4: Frontend typecheck**

Run: `cd frontend && npm run typecheck`
Expected: No type errors.

**Step 5: Remove unused frontend hooks (if fully migrated)**

If any frontend hooks are no longer imported anywhere after migration, delete them. Check with:
```bash
cd frontend && grep -r "useLegacyGas" src/ --include="*.ts" --include="*.tsx"
```

If zero results, delete `src/hooks/useLegacyGas.ts`.

Repeat for any other fully-migrated hooks.

**Step 6: Final commit**

```bash
git commit -m "chore(frontend): remove unused hooks after SDK migration"
```
