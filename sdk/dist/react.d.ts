import * as react_jsx_runtime from 'react/jsx-runtime';
import { ReactNode } from 'react';
import { c as DeploymentAddresses, f as ExecutionKernelClient, j as KernelAgentInfo, n as KernelVaultInfo, d as DepositError, W as WithdrawError } from './errors-Bo9oKMn7.js';
import * as _tanstack_react_query from '@tanstack/react-query';
import * as _tanstack_query_core from '@tanstack/query-core';
import 'viem';

interface TokamakProviderProps {
    children: ReactNode;
    addresses?: DeploymentAddresses;
}
declare function TokamakProvider({ children, addresses }: TokamakProviderProps): react_jsx_runtime.JSX.Element;
declare function useTokamakClient(): ExecutionKernelClient | null;
declare function useRequiredTokamakClient(): ExecutionKernelClient;

declare function useAgent(agentId: `0x${string}` | undefined): _tanstack_react_query.UseQueryResult<KernelAgentInfo | null, Error>;
declare function useAgentList(): _tanstack_react_query.UseQueryResult<KernelAgentInfo[], Error>;

declare function useVault(vaultAddress: `0x${string}` | undefined): _tanstack_react_query.UseQueryResult<KernelVaultInfo | null, Error>;

interface VaultListItem {
    address: `0x${string}`;
    agentId: `0x${string}`;
    asset: `0x${string}`;
    totalAssets: bigint;
    totalShares: bigint;
    totalValueLocked: bigint;
}
declare function useVaultList(): _tanstack_react_query.UseQueryResult<VaultListItem[], Error>;
declare function useVaultsForAgent(agentId: `0x${string}` | undefined): {
    error: Error;
    isError: true;
    isPending: false;
    isLoading: false;
    isLoadingError: false;
    isRefetchError: true;
    isSuccess: false;
    isPlaceholderData: false;
    status: "error";
    dataUpdatedAt: number;
    errorUpdatedAt: number;
    failureCount: number;
    failureReason: Error | null;
    errorUpdateCount: number;
    isFetched: boolean;
    isFetchedAfterMount: boolean;
    isFetching: boolean;
    isInitialLoading: boolean;
    isPaused: boolean;
    isRefetching: boolean;
    isStale: boolean;
    isEnabled: boolean;
    refetch: (options?: _tanstack_query_core.RefetchOptions) => Promise<_tanstack_query_core.QueryObserverResult<VaultListItem[], Error>>;
    fetchStatus: _tanstack_query_core.FetchStatus;
    promise: Promise<VaultListItem[]>;
    data: VaultListItem[];
} | {
    error: null;
    isError: false;
    isPending: false;
    isLoading: false;
    isLoadingError: false;
    isRefetchError: false;
    isSuccess: true;
    isPlaceholderData: false;
    status: "success";
    dataUpdatedAt: number;
    errorUpdatedAt: number;
    failureCount: number;
    failureReason: Error | null;
    errorUpdateCount: number;
    isFetched: boolean;
    isFetchedAfterMount: boolean;
    isFetching: boolean;
    isInitialLoading: boolean;
    isPaused: boolean;
    isRefetching: boolean;
    isStale: boolean;
    isEnabled: boolean;
    refetch: (options?: _tanstack_query_core.RefetchOptions) => Promise<_tanstack_query_core.QueryObserverResult<VaultListItem[], Error>>;
    fetchStatus: _tanstack_query_core.FetchStatus;
    promise: Promise<VaultListItem[]>;
    data: VaultListItem[];
} | {
    error: Error;
    isError: true;
    isPending: false;
    isLoading: false;
    isLoadingError: true;
    isRefetchError: false;
    isSuccess: false;
    isPlaceholderData: false;
    status: "error";
    dataUpdatedAt: number;
    errorUpdatedAt: number;
    failureCount: number;
    failureReason: Error | null;
    errorUpdateCount: number;
    isFetched: boolean;
    isFetchedAfterMount: boolean;
    isFetching: boolean;
    isInitialLoading: boolean;
    isPaused: boolean;
    isRefetching: boolean;
    isStale: boolean;
    isEnabled: boolean;
    refetch: (options?: _tanstack_query_core.RefetchOptions) => Promise<_tanstack_query_core.QueryObserverResult<VaultListItem[], Error>>;
    fetchStatus: _tanstack_query_core.FetchStatus;
    promise: Promise<VaultListItem[]>;
    data: VaultListItem[];
} | {
    error: null;
    isError: false;
    isPending: true;
    isLoading: true;
    isLoadingError: false;
    isRefetchError: false;
    isSuccess: false;
    isPlaceholderData: false;
    status: "pending";
    dataUpdatedAt: number;
    errorUpdatedAt: number;
    failureCount: number;
    failureReason: Error | null;
    errorUpdateCount: number;
    isFetched: boolean;
    isFetchedAfterMount: boolean;
    isFetching: boolean;
    isInitialLoading: boolean;
    isPaused: boolean;
    isRefetching: boolean;
    isStale: boolean;
    isEnabled: boolean;
    refetch: (options?: _tanstack_query_core.RefetchOptions) => Promise<_tanstack_query_core.QueryObserverResult<VaultListItem[], Error>>;
    fetchStatus: _tanstack_query_core.FetchStatus;
    promise: Promise<VaultListItem[]>;
    data: VaultListItem[];
} | {
    error: null;
    isError: false;
    isPending: true;
    isLoadingError: false;
    isRefetchError: false;
    isSuccess: false;
    isPlaceholderData: false;
    status: "pending";
    dataUpdatedAt: number;
    errorUpdatedAt: number;
    failureCount: number;
    failureReason: Error | null;
    errorUpdateCount: number;
    isFetched: boolean;
    isFetchedAfterMount: boolean;
    isFetching: boolean;
    isLoading: boolean;
    isInitialLoading: boolean;
    isPaused: boolean;
    isRefetching: boolean;
    isStale: boolean;
    isEnabled: boolean;
    refetch: (options?: _tanstack_query_core.RefetchOptions) => Promise<_tanstack_query_core.QueryObserverResult<VaultListItem[], Error>>;
    fetchStatus: _tanstack_query_core.FetchStatus;
    promise: Promise<VaultListItem[]>;
    data: VaultListItem[];
} | {
    isError: false;
    error: null;
    isPending: false;
    isLoading: false;
    isLoadingError: false;
    isRefetchError: false;
    isSuccess: true;
    isPlaceholderData: true;
    status: "success";
    dataUpdatedAt: number;
    errorUpdatedAt: number;
    failureCount: number;
    failureReason: Error | null;
    errorUpdateCount: number;
    isFetched: boolean;
    isFetchedAfterMount: boolean;
    isFetching: boolean;
    isInitialLoading: boolean;
    isPaused: boolean;
    isRefetching: boolean;
    isStale: boolean;
    isEnabled: boolean;
    refetch: (options?: _tanstack_query_core.RefetchOptions) => Promise<_tanstack_query_core.QueryObserverResult<VaultListItem[], Error>>;
    fetchStatus: _tanstack_query_core.FetchStatus;
    promise: Promise<VaultListItem[]>;
    data: VaultListItem[];
};

interface UserSharesInfo {
    shares: bigint;
    assetsValue: bigint;
}
declare function useUserShares(vaultAddress: `0x${string}` | undefined): _tanstack_react_query.UseQueryResult<UserSharesInfo | null, Error>;

type DepositStep = 'idle' | 'checking' | 'approving' | 'depositing' | 'success' | 'error';
interface UseDepositReturn {
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
declare function useDeposit(vaultAddress: `0x${string}` | undefined, asset: `0x${string}` | undefined): UseDepositReturn;

type WithdrawStep = 'idle' | 'withdrawing' | 'success' | 'error';
interface UseWithdrawReturn {
    step: WithdrawStep;
    error: WithdrawError | null;
    txHash: `0x${string}` | null;
    assetsOut: bigint | null;
    withdraw: (shares: bigint) => Promise<void>;
    reset: () => void;
}
declare function useWithdraw(vaultAddress: `0x${string}` | undefined): UseWithdrawReturn;

declare function useIsLegacyChain(): boolean;
declare function useIsChainSupported(): boolean;
declare function useChainMismatch(expectedChainId?: number): boolean;

export { type DepositStep, TokamakProvider, type UseDepositReturn, type UseWithdrawReturn, type UserSharesInfo, type VaultListItem, type WithdrawStep, useAgent, useAgentList, useChainMismatch, useDeposit, useIsChainSupported, useIsLegacyChain, useRequiredTokamakClient, useTokamakClient, useUserShares, useVault, useVaultList, useVaultsForAgent, useWithdraw };
