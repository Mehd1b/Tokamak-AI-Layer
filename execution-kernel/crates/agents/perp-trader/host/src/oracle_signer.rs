//! Oracle feed building and EIP-191 signing.
//!
//! Produces two signature formats:
//! - **Guest wire format**: `v[1] || r[32] || s[32]` — embedded in OraclePriceFeed
//! - **On-chain format**: `r[32] || s[32] || v[1]` — passed to executeWithOracle

use crate::error::{Error, Result};
use crate::market::MarketSnapshot;
use kernel_sdk::oracle::{
    compute_feed_hash, encode_price_feed, OraclePriceFeed, PricePoint, Signature, FEED_VERSION,
    MAX_PRICE_COUNT,
};

/// Oracle asset ID for the primary traded asset (matches agent constant).
const ORACLE_ASSET_ID_MARK: u32 = 1;

/// Result of building and signing an oracle feed.
#[derive(Debug)]
pub struct SignedFeed {
    /// The oracle price feed with signature in guest wire format (v||r||s).
    pub feed: OraclePriceFeed,
    /// Encoded feed bytes (for embedding in opaque_agent_inputs).
    pub feed_bytes: Vec<u8>,
    /// SHA-256 hash of the feed body (used as input_root).
    pub feed_hash: [u8; 32],
    /// ECDSA signature in on-chain format (r||s||v) for executeWithOracle.
    pub onchain_signature: Vec<u8>,
}

/// Scale a float price to 1e8 fixed-point u64.
pub fn to_scaled_u64(f: f64) -> u64 {
    (f * 1e8).round() as u64
}

/// Build an OraclePriceFeed, sign it with EIP-191, and return both formats.
/// The on-chain signature includes domain binding: keccak256(feedHash || timestamp || chainId || vaultAddress).
pub fn build_and_sign_feed(
    snapshot: &MarketSnapshot,
    oracle_private_key: &str,
    _exchange_addr: &[u8; 20],
    vault_addr: &[u8; 20],
    chain_id: u64,
) -> Result<SignedFeed> {
    // Parse private key and derive signer address
    let pk_bytes = parse_private_key(oracle_private_key)?;
    let signing_key = k256::ecdsa::SigningKey::from_bytes((&pk_bytes).into())
        .map_err(|e| Error::OracleSigning(format!("Invalid oracle key: {}", e)))?;
    let verifying_key = signing_key.verifying_key();
    let signer_address = public_key_to_address(verifying_key);

    // Build price array
    let mut prices = [PricePoint {
        asset_id: 0,
        price: 0,
        conf: 0,
    }; MAX_PRICE_COUNT];

    prices[0] = PricePoint {
        asset_id: ORACLE_ASSET_ID_MARK,
        price: to_scaled_u64(snapshot.mark_price),
        conf: 50_000_000, // 0.5 confidence
    };

    // Build feed with placeholder signature (hash excludes signature)
    let mut feed = OraclePriceFeed {
        feed_version: FEED_VERSION,
        signer: signer_address,
        timestamp: snapshot.timestamp,
        price_count: 1,
        prices,
        signature: Signature {
            v: 0,
            r: [0; 32],
            s: [0; 32],
        },
    };

    // Compute feed hash = SHA-256(hashable body)
    let feed_hash = compute_feed_hash(&feed);

    // Domain-bound hash: keccak256(abi.encodePacked(feedHash, oracleTimestamp, chainId, vaultAddress))
    // This matches OracleVerifier.sol line 69
    let domain_feed_hash = {
        let mut packed = Vec::with_capacity(32 + 8 + 32 + 20);
        packed.extend_from_slice(&feed_hash);                       // bytes32 feedHash
        packed.extend_from_slice(&(snapshot.timestamp as u64).to_be_bytes()); // uint64 oracleTimestamp (big-endian, abi.encodePacked)
        // chainId is uint256 in Solidity — abi.encodePacked(uint256) = 32 bytes big-endian
        let mut chain_id_bytes = [0u8; 32];
        chain_id_bytes[24..].copy_from_slice(&chain_id.to_be_bytes());
        packed.extend_from_slice(&chain_id_bytes);                  // uint256 chainId
        // address is 20 bytes in abi.encodePacked
        packed.extend_from_slice(vault_addr);                       // address vaultAddress
        keccak256(&packed)
    };

    // EIP-191 personal sign: keccak256("\x19Ethereum Signed Message:\n32" || domainFeedHash)
    let eth_message_hash = eip191_hash(&domain_feed_hash);

    // ECDSA sign the EIP-191 hash
    let (signature, recovery_id) = signing_key
        .sign_prehash_recoverable(&eth_message_hash)
        .map_err(|e| Error::OracleSigning(format!("Signing failed: {}", e)))?;

    let sig_bytes = signature.to_bytes();
    let r: [u8; 32] = sig_bytes[..32].try_into().unwrap();
    let s: [u8; 32] = sig_bytes[32..].try_into().unwrap();
    let v = recovery_id.to_byte() + 27;

    // Set guest wire format signature (v||r||s)
    feed.signature = Signature { v, r, s };

    // Encode the complete feed with signature
    let feed_bytes = encode_price_feed(&feed);

    // Build on-chain format (r||s||v)
    let mut onchain_signature = Vec::with_capacity(65);
    onchain_signature.extend_from_slice(&r);
    onchain_signature.extend_from_slice(&s);
    onchain_signature.push(v);

    Ok(SignedFeed {
        feed,
        feed_bytes,
        feed_hash,
        onchain_signature,
    })
}

/// Compute EIP-191 personal sign hash: keccak256("\x19Ethereum Signed Message:\n32" || data).
fn eip191_hash(data: &[u8; 32]) -> [u8; 32] {
    let prefix = b"\x19Ethereum Signed Message:\n32";
    let mut input = Vec::with_capacity(prefix.len() + 32);
    input.extend_from_slice(prefix);
    input.extend_from_slice(data);
    keccak256(&input)
}

/// Keccak-256 hash (Ethereum's hash function).
fn keccak256(data: &[u8]) -> [u8; 32] {
    use sha3::Digest;
    let mut hasher = sha3::Keccak256::new();
    hasher.update(data);
    let result = hasher.finalize();
    let mut out = [0u8; 32];
    out.copy_from_slice(&result);
    out
}

/// Parse a private key from hex string (with optional 0x prefix).
fn parse_private_key(key: &str) -> Result<[u8; 32]> {
    let clean = key.strip_prefix("0x").unwrap_or(key);
    let bytes = hex::decode(clean)?;
    if bytes.len() != 32 {
        return Err(Error::OracleSigning(format!(
            "Private key must be 32 bytes, got {}",
            bytes.len()
        )));
    }
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&bytes);
    Ok(arr)
}

/// Derive an Ethereum address from a secp256k1 public key.
fn public_key_to_address(key: &k256::ecdsa::VerifyingKey) -> [u8; 20] {
    use k256::elliptic_curve::sec1::ToEncodedPoint;
    let point = key.to_encoded_point(false);
    let pubkey_bytes = point.as_bytes();
    // Skip the 0x04 prefix byte, hash the 64-byte uncompressed key
    let hash = keccak256(&pubkey_bytes[1..]);
    let mut addr = [0u8; 20];
    addr.copy_from_slice(&hash[12..]);
    addr
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_to_scaled_u64() {
        assert_eq!(to_scaled_u64(50000.0), 5_000_000_000_000);
        assert_eq!(to_scaled_u64(0.00000001), 1);
        assert_eq!(to_scaled_u64(1.5), 150_000_000);
    }

    #[test]
    fn test_sign_and_recover() {
        // Known test private key (DO NOT use in production)
        let pk = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
        let snapshot = MarketSnapshot {
            mark_price: 50000.0,
            index_price: 50000.0,
            best_bid: 49990.0,
            best_ask: 50010.0,
            funding_rate: 0.0001,
            position_size: 0.0,
            entry_price: 0.0,
            unrealized_pnl: 0.0,
            available_balance: 100000.0,
            account_equity: 100000.0,
            margin_used: 0.0,
            liquidation_price: 0.0,
            candle_closes: vec![],
            timestamp: 1700000000,
        };
        let exchange = [0x11u8; 20];

        let vault = [0x22u8; 20];
        let result = build_and_sign_feed(&snapshot, pk, &exchange, &vault, 999);
        assert!(result.is_ok(), "Signing should succeed");

        let signed = result.unwrap();
        assert_eq!(signed.feed.price_count, 1);
        assert_eq!(signed.feed.prices[0].asset_id, ORACLE_ASSET_ID_MARK);
        assert_eq!(signed.onchain_signature.len(), 65);

        // Verify: on-chain format r||s||v should have v at the end
        let v = signed.onchain_signature[64];
        assert!(v == 27 || v == 28, "v should be 27 or 28");

        // Verify: guest wire format v||r||s should match
        assert_eq!(signed.feed.signature.v, v);
        assert_eq!(&signed.feed.signature.r[..], &signed.onchain_signature[..32]);
        assert_eq!(&signed.feed.signature.s[..], &signed.onchain_signature[32..64]);
    }
}
