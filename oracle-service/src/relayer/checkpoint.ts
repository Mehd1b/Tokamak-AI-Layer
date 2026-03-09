import { query } from '../db/client.js';

export async function getCheckpoint(vaultAddress: string, chainId: number): Promise<bigint> {
  const { rows } = await query<{ last_block: string }>(
    'SELECT last_block FROM checkpoints WHERE vault_address = $1 AND chain_id = $2',
    [vaultAddress.toLowerCase(), chainId]
  );
  return rows.length > 0 ? BigInt(rows[0].last_block) : 0n;
}

export async function setCheckpoint(
  vaultAddress: string,
  chainId: number,
  block: bigint
): Promise<void> {
  await query(
    `INSERT INTO checkpoints (vault_address, chain_id, last_block, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (vault_address, chain_id) DO UPDATE SET
       last_block = EXCLUDED.last_block,
       updated_at = NOW()`,
    [vaultAddress.toLowerCase(), chainId, block.toString()]
  );
}
