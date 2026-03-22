import {
  DEPLOYMENTS,
  DepositError,
  ExecutionKernelClient,
  WithdrawError
} from "./chunk-LWHRFYJG.mjs";

// src/react/provider.tsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePublicClient, useWalletClient, useChainId } from "wagmi";
import { jsx } from "react/jsx-runtime";
var TokamakContext = createContext(null);
function TokamakProviderInner({ children, addresses }) {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const chainId = useChainId();
  const client = useMemo(() => {
    if (!publicClient) return null;
    const addrs = addresses ?? DEPLOYMENTS[chainId];
    if (!addrs) return null;
    return new ExecutionKernelClient({
      publicClient,
      walletClient: walletClient ?? void 0,
      ...addrs
    });
  }, [publicClient, walletClient, chainId, addresses]);
  return /* @__PURE__ */ jsx(TokamakContext.Provider, { value: client, children });
}
function TokamakProvider({ children, addresses }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return /* @__PURE__ */ jsx(TokamakContext.Provider, { value: null, children });
  }
  return /* @__PURE__ */ jsx(TokamakProviderInner, { addresses, children });
}
function useTokamakClient() {
  return useContext(TokamakContext);
}
function useRequiredTokamakClient() {
  const client = useContext(TokamakContext);
  if (!client) {
    throw new Error(
      "useTokamakClient: no client available. Wrap your app in <TokamakProvider> and ensure the wallet is connected to a supported chain."
    );
  }
  return client;
}

// src/react/useAgent.ts
import { useQuery } from "@tanstack/react-query";
function useAgent(agentId) {
  const client = useTokamakClient();
  return useQuery({
    queryKey: ["tokamak", "agent", agentId],
    queryFn: async () => {
      if (!client || !agentId) return null;
      return client.getAgent(agentId);
    },
    enabled: !!client && !!agentId,
    staleTime: 6e4
  });
}
function useAgentList() {
  const client = useTokamakClient();
  return useQuery({
    queryKey: ["tokamak", "agents"],
    queryFn: async () => {
      if (!client) return [];
      const ids = await client.agents.getAllAgentIds();
      const agents = await Promise.all(ids.map((id) => client.getAgent(id)));
      return agents.filter((a) => a !== null && a.exists);
    },
    enabled: !!client,
    staleTime: 6e4
  });
}

// src/react/useVault.ts
import { useQuery as useQuery2 } from "@tanstack/react-query";
import { useAccount } from "wagmi";
function useVault(vaultAddress) {
  const client = useTokamakClient();
  const { address: userAddress } = useAccount();
  return useQuery2({
    queryKey: ["tokamak", "vault", vaultAddress, userAddress],
    queryFn: async () => {
      if (!client || !vaultAddress) return null;
      const vaultClient = client.createVaultClient(vaultAddress);
      return vaultClient.getInfo(userAddress);
    },
    enabled: !!client && !!vaultAddress,
    staleTime: 3e4
  });
}

// src/react/useVaultList.ts
import { useQuery as useQuery3 } from "@tanstack/react-query";
function useVaultList() {
  const client = useTokamakClient();
  return useQuery3({
    queryKey: ["tokamak", "vaults"],
    queryFn: async () => {
      if (!client) return [];
      const addresses = await client.vaultFactory.getAllVaults();
      const vaults = await Promise.all(
        addresses.map(async (addr) => {
          try {
            const vc = client.createVaultClient(addr);
            const info = await vc.getInfo();
            return {
              address: addr,
              agentId: info.agentId,
              asset: info.asset,
              totalAssets: info.totalAssets,
              totalShares: info.totalShares,
              totalValueLocked: info.totalValueLocked
            };
          } catch {
            return null;
          }
        })
      );
      return vaults.filter((v) => v !== null);
    },
    enabled: !!client,
    staleTime: 3e4
  });
}
function useVaultsForAgent(agentId) {
  const { data: allVaults, ...rest } = useVaultList();
  const filtered = allVaults?.filter((v) => v.agentId === agentId) ?? [];
  return { data: filtered, ...rest };
}

// src/react/useUserShares.ts
import { useQuery as useQuery4 } from "@tanstack/react-query";
import { useAccount as useAccount2 } from "wagmi";
function useUserShares(vaultAddress) {
  const client = useTokamakClient();
  const { address } = useAccount2();
  return useQuery4({
    queryKey: ["tokamak", "userShares", vaultAddress, address],
    queryFn: async () => {
      if (!client || !vaultAddress || !address) return null;
      const vc = client.createVaultClient(vaultAddress);
      const shares = await vc.shares(address);
      const assetsValue = shares > 0n ? await vc.convertToAssets(shares) : 0n;
      return { shares, assetsValue };
    },
    enabled: !!client && !!vaultAddress && !!address,
    staleTime: 15e3
  });
}

// src/react/useDeposit.ts
import { useState as useState2, useCallback } from "react";
import { useAccount as useAccount3, useChainId as useChainId3, usePublicClient as usePublicClient2, useWalletClient as useWalletClient2 } from "wagmi";
import { erc20Abi } from "viem";
import { useQueryClient, useQuery as useQuery5 } from "@tanstack/react-query";

// src/react/useChainValidation.ts
import { useChainId as useChainId2 } from "wagmi";
var LEGACY_GAS_CHAINS = /* @__PURE__ */ new Set([999, 998]);
function useIsLegacyChain() {
  const chainId = useChainId2();
  return LEGACY_GAS_CHAINS.has(chainId);
}
function useIsChainSupported() {
  const chainId = useChainId2();
  return chainId in DEPLOYMENTS;
}
function useChainMismatch(expectedChainId) {
  const chainId = useChainId2();
  if (!expectedChainId) return false;
  return chainId !== expectedChainId;
}
function getLegacyGasOverrides(chainId) {
  return LEGACY_GAS_CHAINS.has(chainId) ? { type: "legacy" } : {};
}

// src/react/useDeposit.ts
var ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
function useDeposit(vaultAddress, asset) {
  const client = useTokamakClient();
  const { address } = useAccount3();
  const chainId = useChainId3();
  const publicClient = usePublicClient2();
  const { data: walletClient } = useWalletClient2();
  const queryClient = useQueryClient();
  const [step, setStep] = useState2("idle");
  const [error, setError] = useState2(null);
  const [txHash, setTxHash] = useState2(null);
  const [sharesMinted, setSharesMinted] = useState2(null);
  const isETH = !asset || asset === ZERO_ADDRESS;
  const { data: allowance = 0n } = useQuery5({
    queryKey: ["tokamak", "allowance", asset, vaultAddress, address],
    queryFn: async () => {
      if (!publicClient || !address || !vaultAddress || !asset || isETH) return 0n;
      return publicClient.readContract({
        address: asset,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, vaultAddress]
      });
    },
    enabled: !!publicClient && !!address && !!vaultAddress && !isETH,
    staleTime: 1e4
  });
  const needsApproval = useCallback(
    (amount) => !isETH && allowance < amount,
    [isETH, allowance]
  );
  const deposit = useCallback(async (amount) => {
    if (!client || !vaultAddress || !walletClient || !publicClient || !address) {
      setError(new DepositError("TRANSACTION_REVERTED" /* TRANSACTION_REVERTED */, "Wallet not connected"));
      setStep("error");
      return;
    }
    try {
      setError(null);
      setTxHash(null);
      setSharesMinted(null);
      const vaultClient = client.createVaultClient(vaultAddress);
      if (!isETH && allowance < amount) {
        setStep("approving");
        const approveTx = await walletClient.writeContract({
          address: asset,
          abi: erc20Abi,
          functionName: "approve",
          args: [vaultAddress, amount],
          ...getLegacyGasOverrides(chainId)
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
        await queryClient.invalidateQueries({
          queryKey: ["tokamak", "allowance", asset, vaultAddress, address]
        });
      }
      setStep("depositing");
      const result = isETH ? await vaultClient.depositETH(amount) : await vaultClient.depositERC20(amount);
      setTxHash(result.txHash);
      setSharesMinted(result.sharesMinted);
      setStep("success");
      await queryClient.invalidateQueries({ queryKey: ["tokamak", "vault", vaultAddress] });
      await queryClient.invalidateQueries({ queryKey: ["tokamak", "userShares", vaultAddress] });
    } catch (err) {
      const depositErr = DepositError.from(err);
      setError(depositErr);
      setStep("error");
    }
  }, [client, vaultAddress, walletClient, publicClient, address, isETH, allowance, asset, chainId, queryClient]);
  const reset = useCallback(() => {
    setStep("idle");
    setError(null);
    setTxHash(null);
    setSharesMinted(null);
  }, []);
  return { step, error, txHash, sharesMinted, deposit, reset, needsApproval, isETH, allowance };
}

// src/react/useWithdraw.ts
import { useState as useState3, useCallback as useCallback2 } from "react";
import { useQueryClient as useQueryClient2 } from "@tanstack/react-query";
function useWithdraw(vaultAddress) {
  const client = useTokamakClient();
  const queryClient = useQueryClient2();
  const [step, setStep] = useState3("idle");
  const [error, setError] = useState3(null);
  const [txHash, setTxHash] = useState3(null);
  const [assetsOut, setAssetsOut] = useState3(null);
  const withdraw = useCallback2(async (shares) => {
    if (!client || !vaultAddress) {
      setError(new WithdrawError("TRANSACTION_REVERTED" /* TRANSACTION_REVERTED */, "Wallet not connected"));
      setStep("error");
      return;
    }
    try {
      setError(null);
      setTxHash(null);
      setAssetsOut(null);
      setStep("withdrawing");
      const vaultClient = client.createVaultClient(vaultAddress);
      const result = await vaultClient.withdraw(shares);
      setTxHash(result.txHash);
      setAssetsOut(result.assetsOut);
      setStep("success");
      await queryClient.invalidateQueries({ queryKey: ["tokamak", "vault", vaultAddress] });
      await queryClient.invalidateQueries({ queryKey: ["tokamak", "userShares", vaultAddress] });
    } catch (err) {
      setError(WithdrawError.from(err));
      setStep("error");
    }
  }, [client, vaultAddress, queryClient]);
  const reset = useCallback2(() => {
    setStep("idle");
    setError(null);
    setTxHash(null);
    setAssetsOut(null);
  }, []);
  return { step, error, txHash, assetsOut, withdraw, reset };
}
export {
  TokamakProvider,
  useAgent,
  useAgentList,
  useChainMismatch,
  useDeposit,
  useIsChainSupported,
  useIsLegacyChain,
  useRequiredTokamakClient,
  useTokamakClient,
  useUserShares,
  useVault,
  useVaultList,
  useVaultsForAgent,
  useWithdraw
};
//# sourceMappingURL=react.mjs.map