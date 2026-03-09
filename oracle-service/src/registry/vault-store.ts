import { query } from '../db/client.js';
import type { Address } from 'viem';
import pino from 'pino';

const logger = pino({ name: 'vault-store' });

export interface VaultRecord {
  address: string;
  chainId: number;
  agentId: string;
  owner: string;
  bondChainId: number;
  discoveredAt: Date;
}

export async function upsertVault(vault: Omit<VaultRecord, 'discoveredAt'>): Promise<void> {
  await query(
    `INSERT INTO vaults (address, chain_id, agent_id, owner, bond_chain_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (address, chain_id) DO UPDATE SET
       agent_id = EXCLUDED.agent_id,
       owner = EXCLUDED.owner,
       bond_chain_id = EXCLUDED.bond_chain_id`,
    [vault.address.toLowerCase(), vault.chainId, vault.agentId, vault.owner.toLowerCase(), vault.bondChainId]
  );
  logger.info({ vault: vault.address, chainId: vault.chainId }, 'Vault upserted');
}

export async function getVaults(): Promise<VaultRecord[]> {
  const { rows } = await query<{
    address: string;
    chain_id: number;
    agent_id: string;
    owner: string;
    bond_chain_id: number;
    discovered_at: Date;
  }>('SELECT * FROM vaults ORDER BY discovered_at DESC');
  return rows.map(r => ({
    address: r.address,
    chainId: r.chain_id,
    agentId: r.agent_id,
    owner: r.owner,
    bondChainId: r.bond_chain_id,
    discoveredAt: r.discovered_at,
  }));
}

export async function getVault(address: string, chainId: number): Promise<VaultRecord | null> {
  const { rows } = await query<{
    address: string;
    chain_id: number;
    agent_id: string;
    owner: string;
    bond_chain_id: number;
    discovered_at: Date;
  }>('SELECT * FROM vaults WHERE address = $1 AND chain_id = $2', [address.toLowerCase(), chainId]);
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    address: r.address,
    chainId: r.chain_id,
    agentId: r.agent_id,
    owner: r.owner,
    bondChainId: r.bond_chain_id,
    discoveredAt: r.discovered_at,
  };
}

export async function isRegisteredVault(address: string, chainId: number): Promise<boolean> {
  const { rows } = await query(
    'SELECT 1 FROM vaults WHERE address = $1 AND chain_id = $2',
    [address.toLowerCase(), chainId]
  );
  return rows.length > 0;
}

export async function getVaultCount(): Promise<number> {
  const { rows } = await query<{ count: string }>('SELECT COUNT(*) as count FROM vaults');
  return parseInt(rows[0].count);
}
