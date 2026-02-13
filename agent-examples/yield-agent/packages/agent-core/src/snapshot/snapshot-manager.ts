import { keccak256, toHex } from "viem";
import type {
  DataSnapshot,
  PoolData,
  IIPFSStorage,
} from "../types.js";
import { DataSnapshotSchema } from "../types.js";
import { createChildLogger } from "../logger.js";

const log = createChildLogger("snapshot-manager");

/**
 * Creates and manages deterministic DataSnapshots.
 *
 * Snapshots are the immutable input for strategy generation.
 * Validators re-execute with the same snapshot to verify results.
 * The snapshotId is a keccak256 hash of all pool data + prices,
 * ensuring content-addressed integrity.
 */
export class SnapshotManager {
  private readonly storage: IIPFSStorage | null;

  constructor(storage?: IIPFSStorage) {
    this.storage = storage ?? null;
  }

  /**
   * Create a snapshot from pool data and price feeds.
   * The snapshot is deterministically identified by its content hash.
   */
  createSnapshot(params: {
    poolStates: PoolData[];
    priceFeed: Record<string, number>;
    blockNumbers: Record<string, number>;
    timestamp: number;
    sources: string[];
    fetchDuration: number;
    adapterVersions: Record<string, string>;
  }): DataSnapshot {
    // Sort pools deterministically for consistent hashing
    const sortedPools = [...params.poolStates].sort((a, b) =>
      `${a.protocol}:${a.poolId}`.localeCompare(`${b.protocol}:${b.poolId}`),
    );

    // Sort price feed keys for deterministic serialization
    const sortedPrices: Record<string, number> = {};
    for (const key of Object.keys(params.priceFeed).sort()) {
      sortedPrices[key] = params.priceFeed[key]!;
    }

    // Compute content hash
    const contentToHash = JSON.stringify({
      pools: sortedPools,
      prices: sortedPrices,
      blocks: params.blockNumbers,
      timestamp: params.timestamp,
    });
    const snapshotId = keccak256(toHex(contentToHash));

    const snapshot: DataSnapshot = {
      snapshotId,
      timestamp: params.timestamp,
      blockNumbers: params.blockNumbers,
      poolStates: sortedPools,
      priceFeed: sortedPrices,
      metadata: {
        sources: params.sources,
        fetchDuration: params.fetchDuration,
        adapterVersions: params.adapterVersions,
      },
    };

    log.info(
      {
        snapshotId,
        poolCount: sortedPools.length,
        priceCount: Object.keys(sortedPrices).length,
      },
      "Snapshot created",
    );

    return snapshot;
  }

  /**
   * Verify a snapshot's integrity by recomputing its hash.
   */
  verifySnapshot(snapshot: DataSnapshot): boolean {
    const sortedPools = [...snapshot.poolStates].sort((a, b) =>
      `${a.protocol}:${a.poolId}`.localeCompare(`${b.protocol}:${b.poolId}`),
    );

    const sortedPrices: Record<string, number> = {};
    for (const key of Object.keys(snapshot.priceFeed).sort()) {
      sortedPrices[key] = snapshot.priceFeed[key]!;
    }

    const contentToHash = JSON.stringify({
      pools: sortedPools,
      prices: sortedPrices,
      blocks: snapshot.blockNumbers,
      timestamp: snapshot.timestamp,
    });
    const expectedId = keccak256(toHex(contentToHash));

    return expectedId === snapshot.snapshotId;
  }

  /**
   * Pin a snapshot to IPFS and return the CID.
   */
  async pinToIPFS(snapshot: DataSnapshot): Promise<string> {
    if (!this.storage) {
      throw new Error("IPFS storage not configured");
    }
    const cid = await this.storage.pin(snapshot);
    log.info({ snapshotId: snapshot.snapshotId, cid }, "Snapshot pinned to IPFS");
    return cid;
  }

  /**
   * Retrieve and validate a snapshot from IPFS.
   */
  async getFromIPFS(cid: string): Promise<DataSnapshot> {
    if (!this.storage) {
      throw new Error("IPFS storage not configured");
    }
    const snapshot = await this.storage.get(cid, DataSnapshotSchema);

    if (!this.verifySnapshot(snapshot)) {
      throw new Error(`Snapshot integrity check failed for CID ${cid}`);
    }

    return snapshot;
  }

  /**
   * Serialize a snapshot to a deterministic JSON string.
   * Used for comparing snapshots across validator re-executions.
   */
  serialize(snapshot: DataSnapshot): string {
    return JSON.stringify(snapshot, Object.keys(snapshot).sort());
  }
}
