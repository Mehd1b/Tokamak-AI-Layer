//! Off-chain oracle price feed decoding and verification.
//!
//! Provides deterministic parsing of `OraclePriceFeed` wire format, SHA-256
//! feed hash computation, and commitment verification against the kernel's
//! `input_root`.
//!
//! # Wire Format
//!
//! ```text
//! HASHABLE BODY (30 + 16*N bytes):
//!   [0]       feed_version    u8       (must be 0x01)
//!   [1:21]    signer          [u8;20]  (oracle Ethereum address)
//!   [21:29]   timestamp       u64 LE   (unix seconds)
//!   [29]      price_count     u8       (1..32)
//!   [30..]    prices          16 bytes each:
//!               asset_id      u32 LE
//!               price         u64 LE   (1e8 scaled)
//!               conf          u32 LE   (1e8 scaled confidence)
//!
//! SIGNATURE (65 bytes, appended after body):
//!   sig_v     u8
//!   sig_r     [u8;32]
//!   sig_s     [u8;32]
//! ```
//!
//! `feed_hash = SHA256(hashable_body)` — signature is excluded from hash.

use crate::agent::AgentContext;
use crate::bytes::{read_bytes20_at, read_bytes32_at, read_u32_le_at, read_u64_le_at, read_u8_at};

/// Maximum number of price points in a single feed.
pub const MAX_PRICE_COUNT: usize = 32;

/// Required feed version byte.
pub const FEED_VERSION: u8 = 0x01;

/// Size of a single PricePoint in wire format (4 + 8 + 4 = 16 bytes).
pub const PRICE_POINT_SIZE: usize = 16;

/// Size of the fixed header before prices (1 + 20 + 8 + 1 = 30 bytes).
pub const FEED_HEADER_SIZE: usize = 30;

/// Size of the ECDSA signature appended after the body (1 + 32 + 32 = 65 bytes).
pub const SIGNATURE_SIZE: usize = 65;

/// A single price observation.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PricePoint {
    /// Asset identifier (application-defined).
    pub asset_id: u32,
    /// Price in 1e8 fixed-point.
    pub price: u64,
    /// Confidence interval in 1e8 fixed-point.
    pub conf: u32,
}

/// ECDSA signature (v, r, s).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Signature {
    pub v: u8,
    pub r: [u8; 32],
    pub s: [u8; 32],
}

/// Decoded oracle price feed.
///
/// Fixed-size: prices stored in a `[PricePoint; 32]` array with `price_count`
/// indicating how many entries are valid. This avoids heap allocation.
#[derive(Clone, Debug)]
pub struct OraclePriceFeed {
    pub feed_version: u8,
    pub signer: [u8; 20],
    pub timestamp: u64,
    pub price_count: u8,
    pub prices: [PricePoint; MAX_PRICE_COUNT],
    pub signature: Signature,
}

/// Compute the total wire length of an oracle price feed.
///
/// Returns `95 + 16 * price_count`.
#[inline]
pub fn feed_wire_len(price_count: u8) -> usize {
    FEED_HEADER_SIZE + PRICE_POINT_SIZE * (price_count as usize) + SIGNATURE_SIZE
}

/// Decode an `OraclePriceFeed` from raw bytes.
///
/// Returns `None` if:
/// - Input is too short
/// - `feed_version` is not `0x01`
/// - `price_count` is 0 or exceeds `MAX_PRICE_COUNT`
/// - Input length doesn't match expected wire length
pub fn decode_price_feed(bytes: &[u8]) -> Option<OraclePriceFeed> {
    // Need at least header + signature for 1 price
    if bytes.len() < FEED_HEADER_SIZE + PRICE_POINT_SIZE + SIGNATURE_SIZE {
        return None;
    }

    let mut offset = 0usize;

    // Header
    let feed_version = read_u8_at(bytes, &mut offset)?;
    if feed_version != FEED_VERSION {
        return None;
    }

    let signer = read_bytes20_at(bytes, &mut offset)?;
    let timestamp = read_u64_le_at(bytes, &mut offset)?;
    let price_count = read_u8_at(bytes, &mut offset)?;

    if price_count == 0 || price_count as usize > MAX_PRICE_COUNT {
        return None;
    }

    // Verify total length
    let expected_len = feed_wire_len(price_count);
    if bytes.len() < expected_len {
        return None;
    }

    // Parse prices
    let mut prices = [PricePoint {
        asset_id: 0,
        price: 0,
        conf: 0,
    }; MAX_PRICE_COUNT];

    for i in 0..price_count as usize {
        let asset_id = read_u32_le_at(bytes, &mut offset)?;
        let price = read_u64_le_at(bytes, &mut offset)?;
        let conf = read_u32_le_at(bytes, &mut offset)?;
        prices[i] = PricePoint {
            asset_id,
            price,
            conf,
        };
    }

    // Parse signature
    let v = read_u8_at(bytes, &mut offset)?;
    let r = read_bytes32_at(bytes, &mut offset)?;
    let s = read_bytes32_at(bytes, &mut offset)?;

    Some(OraclePriceFeed {
        feed_version,
        signer,
        timestamp,
        price_count,
        prices,
        signature: Signature { v, r, s },
    })
}

/// Compute the SHA-256 hash of the hashable body (excluding signature).
///
/// Rebuilds the canonical body bytes and hashes them. This ensures the
/// hash matches what was originally signed by the oracle.
pub fn compute_feed_hash(feed: &OraclePriceFeed) -> [u8; 32] {
    let body_len = FEED_HEADER_SIZE + PRICE_POINT_SIZE * (feed.price_count as usize);
    let mut body = alloc::vec::Vec::with_capacity(body_len);

    // Header
    body.push(feed.feed_version);
    body.extend_from_slice(&feed.signer);
    body.extend_from_slice(&feed.timestamp.to_le_bytes());
    body.push(feed.price_count);

    // Prices
    for i in 0..feed.price_count as usize {
        body.extend_from_slice(&feed.prices[i].asset_id.to_le_bytes());
        body.extend_from_slice(&feed.prices[i].price.to_le_bytes());
        body.extend_from_slice(&feed.prices[i].conf.to_le_bytes());
    }

    kernel_core::hash::sha256(&body)
}

/// Verify that the feed's SHA-256 hash matches the kernel context's `input_root`.
///
/// This binds the oracle data to the ZK proof: the guest proves it operated
/// on exactly the data whose hash appears in the committed journal.
#[inline]
pub fn verify_feed_commitment(feed: &OraclePriceFeed, ctx: &AgentContext) -> bool {
    compute_feed_hash(feed) == ctx.input_root
}

/// Look up a price by asset ID (bounded linear scan, max 32 iterations).
///
/// Returns the price in 1e8 fixed-point, or `None` if the asset is not found.
#[inline]
pub fn get_price(feed: &OraclePriceFeed, asset_id: u32) -> Option<u64> {
    for i in 0..feed.price_count as usize {
        if feed.prices[i].asset_id == asset_id {
            return Some(feed.prices[i].price);
        }
    }
    None
}

/// Look up a full PricePoint by asset ID.
///
/// Returns `None` if the asset is not found.
#[inline]
pub fn get_price_point(feed: &OraclePriceFeed, asset_id: u32) -> Option<PricePoint> {
    for i in 0..feed.price_count as usize {
        if feed.prices[i].asset_id == asset_id {
            return Some(feed.prices[i]);
        }
    }
    None
}

/// Encode an `OraclePriceFeed` back into its wire format.
///
/// Useful for tests and host-side tooling.
pub fn encode_price_feed(feed: &OraclePriceFeed) -> alloc::vec::Vec<u8> {
    let total_len = feed_wire_len(feed.price_count);
    let mut buf = alloc::vec::Vec::with_capacity(total_len);

    // Header
    buf.push(feed.feed_version);
    buf.extend_from_slice(&feed.signer);
    buf.extend_from_slice(&feed.timestamp.to_le_bytes());
    buf.push(feed.price_count);

    // Prices
    for i in 0..feed.price_count as usize {
        buf.extend_from_slice(&feed.prices[i].asset_id.to_le_bytes());
        buf.extend_from_slice(&feed.prices[i].price.to_le_bytes());
        buf.extend_from_slice(&feed.prices[i].conf.to_le_bytes());
    }

    // Signature
    buf.push(feed.signature.v);
    buf.extend_from_slice(&feed.signature.r);
    buf.extend_from_slice(&feed.signature.s);

    buf
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_SIGNER: [u8; 20] = [0xAA; 20];

    fn make_test_feed(price_count: u8) -> OraclePriceFeed {
        let mut prices = [PricePoint {
            asset_id: 0,
            price: 0,
            conf: 0,
        }; MAX_PRICE_COUNT];
        for i in 0..price_count as usize {
            prices[i] = PricePoint {
                asset_id: (i + 1) as u32,
                price: (50_000 + i as u64) * 100_000_000, // 1e8 scaled
                conf: 100,
            };
        }
        OraclePriceFeed {
            feed_version: FEED_VERSION,
            signer: TEST_SIGNER,
            timestamp: 1_700_000_000,
            price_count,
            prices,
            signature: Signature {
                v: 27,
                r: [0xBB; 32],
                s: [0xCC; 32],
            },
        }
    }

    #[test]
    fn test_feed_wire_len() {
        assert_eq!(feed_wire_len(1), 95 + 16); // 111
        assert_eq!(feed_wire_len(2), 95 + 32); // 127
        assert_eq!(feed_wire_len(32), 95 + 512); // 607
    }

    #[test]
    fn test_encode_decode_roundtrip_single_price() {
        let feed = make_test_feed(1);
        let bytes = encode_price_feed(&feed);
        assert_eq!(bytes.len(), feed_wire_len(1));

        let decoded = decode_price_feed(&bytes).expect("decode should succeed");
        assert_eq!(decoded.feed_version, FEED_VERSION);
        assert_eq!(decoded.signer, TEST_SIGNER);
        assert_eq!(decoded.timestamp, 1_700_000_000);
        assert_eq!(decoded.price_count, 1);
        assert_eq!(decoded.prices[0].asset_id, 1);
        assert_eq!(decoded.prices[0].price, 50_000 * 100_000_000);
        assert_eq!(decoded.prices[0].conf, 100);
        assert_eq!(decoded.signature.v, 27);
        assert_eq!(decoded.signature.r, [0xBB; 32]);
        assert_eq!(decoded.signature.s, [0xCC; 32]);
    }

    #[test]
    fn test_encode_decode_roundtrip_multiple_prices() {
        let feed = make_test_feed(5);
        let bytes = encode_price_feed(&feed);
        assert_eq!(bytes.len(), feed_wire_len(5));

        let decoded = decode_price_feed(&bytes).expect("decode should succeed");
        assert_eq!(decoded.price_count, 5);
        for i in 0..5 {
            assert_eq!(decoded.prices[i].asset_id, (i + 1) as u32);
            assert_eq!(
                decoded.prices[i].price,
                (50_000 + i as u64) * 100_000_000
            );
        }
    }

    #[test]
    fn test_encode_decode_roundtrip_max_prices() {
        let feed = make_test_feed(32);
        let bytes = encode_price_feed(&feed);
        assert_eq!(bytes.len(), feed_wire_len(32));

        let decoded = decode_price_feed(&bytes).expect("decode should succeed");
        assert_eq!(decoded.price_count, 32);
    }

    #[test]
    fn test_decode_rejects_wrong_version() {
        let feed = make_test_feed(1);
        let mut bytes = encode_price_feed(&feed);
        bytes[0] = 0x02; // wrong version
        assert!(decode_price_feed(&bytes).is_none());
    }

    #[test]
    fn test_decode_rejects_zero_price_count() {
        let feed = make_test_feed(1);
        let mut bytes = encode_price_feed(&feed);
        bytes[29] = 0; // price_count = 0
        assert!(decode_price_feed(&bytes).is_none());
    }

    #[test]
    fn test_decode_rejects_too_many_prices() {
        let feed = make_test_feed(1);
        let mut bytes = encode_price_feed(&feed);
        bytes[29] = 33; // price_count = 33 (exceeds MAX_PRICE_COUNT)
        assert!(decode_price_feed(&bytes).is_none());
    }

    #[test]
    fn test_decode_rejects_truncated_input() {
        let feed = make_test_feed(3);
        let bytes = encode_price_feed(&feed);
        // Truncate to remove some price data
        let truncated = &bytes[..bytes.len() - 20];
        assert!(decode_price_feed(truncated).is_none());
    }

    #[test]
    fn test_decode_rejects_empty_input() {
        assert!(decode_price_feed(&[]).is_none());
    }

    #[test]
    fn test_compute_feed_hash_deterministic() {
        let feed = make_test_feed(3);
        let hash1 = compute_feed_hash(&feed);
        let hash2 = compute_feed_hash(&feed);
        assert_eq!(hash1, hash2, "Hash must be deterministic");
    }

    #[test]
    fn test_compute_feed_hash_changes_with_data() {
        let feed1 = make_test_feed(1);
        let mut feed2 = make_test_feed(1);
        feed2.prices[0].price += 1; // change one price

        let hash1 = compute_feed_hash(&feed1);
        let hash2 = compute_feed_hash(&feed2);
        assert_ne!(hash1, hash2, "Different data must produce different hash");
    }

    #[test]
    fn test_compute_feed_hash_excludes_signature() {
        let mut feed1 = make_test_feed(1);
        let mut feed2 = make_test_feed(1);
        feed1.signature.v = 27;
        feed2.signature.v = 28;
        feed1.signature.r = [0x11; 32];
        feed2.signature.r = [0x22; 32];

        let hash1 = compute_feed_hash(&feed1);
        let hash2 = compute_feed_hash(&feed2);
        assert_eq!(
            hash1, hash2,
            "Signature must be excluded from hash computation"
        );
    }

    #[test]
    fn test_verify_feed_commitment_match() {
        let feed = make_test_feed(2);
        let expected_hash = compute_feed_hash(&feed);
        let ctx = AgentContext {
            protocol_version: 1,
            kernel_version: 1,
            agent_id: [0x42; 32],
            agent_code_hash: [0; 32],
            constraint_set_hash: [0; 32],
            input_root: expected_hash,
            execution_nonce: 1,
        };

        assert!(
            verify_feed_commitment(&feed, &ctx),
            "Commitment should match when input_root == feed_hash"
        );
    }

    #[test]
    fn test_verify_feed_commitment_mismatch() {
        let feed = make_test_feed(2);
        let ctx = AgentContext {
            protocol_version: 1,
            kernel_version: 1,
            agent_id: [0x42; 32],
            agent_code_hash: [0; 32],
            constraint_set_hash: [0; 32],
            input_root: [0xFF; 32], // wrong hash
            execution_nonce: 1,
        };

        assert!(
            !verify_feed_commitment(&feed, &ctx),
            "Commitment should not match with wrong input_root"
        );
    }

    #[test]
    fn test_get_price_found() {
        let feed = make_test_feed(3);
        // asset_id 2 should have price (50_001) * 1e8
        let price = get_price(&feed, 2);
        assert_eq!(price, Some(50_001 * 100_000_000));
    }

    #[test]
    fn test_get_price_not_found() {
        let feed = make_test_feed(3);
        assert_eq!(get_price(&feed, 99), None);
    }

    #[test]
    fn test_get_price_point_found() {
        let feed = make_test_feed(3);
        let pp = get_price_point(&feed, 1).unwrap();
        assert_eq!(pp.asset_id, 1);
        assert_eq!(pp.price, 50_000 * 100_000_000);
        assert_eq!(pp.conf, 100);
    }

    #[test]
    fn test_get_price_point_not_found() {
        let feed = make_test_feed(3);
        assert!(get_price_point(&feed, 99).is_none());
    }

    #[test]
    fn test_hash_matches_manual_body_encoding() {
        let feed = make_test_feed(1);
        let hash_from_fn = compute_feed_hash(&feed);

        // Manually build the body bytes
        let encoded = encode_price_feed(&feed);
        let body_len = FEED_HEADER_SIZE + PRICE_POINT_SIZE;
        let body = &encoded[..body_len];
        let hash_manual = kernel_core::hash::sha256(body);

        assert_eq!(hash_from_fn, hash_manual, "Hash must match manual body encoding");
    }
}
