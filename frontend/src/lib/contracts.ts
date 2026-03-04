// Single source of truth: all addresses and ABIs imported from the SDK.
// Never duplicate addresses or ABIs here — edit the SDK source instead.
// Addresses are now provided by NetworkContext via useNetwork().

import { AgentRegistryABI as _AgentRegistryABI } from '@ek-sdk/abi/AgentRegistry';
import { VaultFactoryABI as _VaultFactoryABI } from '@ek-sdk/abi/VaultFactory';
import { KernelVaultABI as _KernelVaultABI } from '@ek-sdk/abi/KernelVault';
import { KernelExecutionVerifierABI as _KernelExecutionVerifierABI } from '@ek-sdk/abi/KernelExecutionVerifier';

export const AgentRegistryABI = _AgentRegistryABI;
export const VaultFactoryABI = _VaultFactoryABI;
export const KernelVaultABI = _KernelVaultABI;
export const KernelExecutionVerifierABI = _KernelExecutionVerifierABI;
