/**
 * Oracle price feed parser matching the Rust wire format in kernel-sdk/src/oracle.rs.
 *
 * Wire format (all integers little-endian):
 *
 * HASHABLE BODY (30 + 16*N bytes):
 *   [0]       feed_version    u8       (must be 0x01)
 *   [1:21]    signer          [u8;20]
 *   [21:29]   timestamp       u64 LE
 *   [29]      price_count     u8       (1..32)
 *   [30..]    prices          16 bytes each:
 *               asset_id      u32 LE
 *               price         u64 LE   (1e8 scaled)
 *               conf          u32 LE   (1e8 scaled confidence)
 *
 * SIGNATURE (65 bytes, appended after body):
 *   sig_v     u8
 *   sig_r     [u8;32]
 *   sig_s     [u8;32]
 */

import type { OraclePriceFeed, PricePoint } from "./types.js";
import {
  FEED_HEADER_SIZE,
  FEED_VERSION,
  MAX_PRICE_COUNT,
  PRICE_POINT_SIZE,
  SIGNATURE_SIZE,
} from "./types.js";

/**
 * Compute the total wire length of an oracle price feed.
 *
 * @returns 95 + 16 * priceCount (header + prices + signature)
 */
export function feedWireLen(priceCount: number): number {
  return FEED_HEADER_SIZE + PRICE_POINT_SIZE * priceCount + SIGNATURE_SIZE;
}

/**
 * Parse an OraclePriceFeed from raw wire bytes.
 *
 * @param data - Raw wire format bytes
 * @returns Parsed feed, or undefined if data is invalid
 *
 * Returns undefined if:
 * - Input is too short
 * - feed_version is not 0x01
 * - price_count is 0 or exceeds MAX_PRICE_COUNT (32)
 * - Input length is shorter than expected wire length
 */
export function parseOracleFeed(data: Uint8Array): OraclePriceFeed | undefined {
  // Need at least header + 1 price + signature
  if (data.length < FEED_HEADER_SIZE + PRICE_POINT_SIZE + SIGNATURE_SIZE) {
    return undefined;
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  // Header
  const feedVersion = data[offset]!;
  offset += 1;

  if (feedVersion !== FEED_VERSION) {
    return undefined;
  }

  const signer = data.slice(offset, offset + 20);
  offset += 20;

  const timestamp = view.getBigUint64(offset, true);
  offset += 8;

  const priceCount = data[offset]!;
  offset += 1;

  if (priceCount === 0 || priceCount > MAX_PRICE_COUNT) {
    return undefined;
  }

  // Verify total length
  const expectedLen = feedWireLen(priceCount);
  if (data.length < expectedLen) {
    return undefined;
  }

  // Parse prices
  const prices: PricePoint[] = [];
  for (let i = 0; i < priceCount; i++) {
    const assetId = view.getUint32(offset, true);
    offset += 4;
    const price = view.getBigUint64(offset, true);
    offset += 8;
    const conf = view.getUint32(offset, true);
    offset += 4;

    prices.push({ assetId, price, conf });
  }

  // Parse signature
  const v = data[offset]!;
  offset += 1;
  const r = data.slice(offset, offset + 32);
  offset += 32;
  const s = data.slice(offset, offset + 32);

  return {
    feedVersion,
    signer,
    timestamp,
    priceCount,
    prices,
    signature: { v, r, s },
  };
}

/**
 * Look up a PricePoint by asset ID.
 *
 * @param feed - Parsed oracle price feed
 * @param assetId - Asset identifier to search for
 * @returns The matching PricePoint, or undefined if not found
 */
export function getPrice(
  feed: OraclePriceFeed,
  assetId: number
): PricePoint | undefined {
  for (let i = 0; i < feed.priceCount; i++) {
    const point = feed.prices[i];
    if (point !== undefined && point.assetId === assetId) {
      return point;
    }
  }
  return undefined;
}
