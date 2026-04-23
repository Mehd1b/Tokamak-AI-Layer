//! Protocol pack definitions used by the `tal deploy --kind tokagent` command.
//!
//! A protocol pack is a curated list of (target, selector, human-label) entries
//! that the user allowlists at deploy time. Packs are keyed by (chain_id, pack_id).
//! Adding a new pack: append to `PACKS` below.

use alloy::primitives::{address, fixed_bytes, Address, FixedBytes};

#[derive(Debug, Clone)]
pub struct PackEntry {
    pub target: Address,
    pub selector: FixedBytes<4>,
    pub label: &'static str,
}

#[derive(Debug, Clone)]
pub struct ApprovalEntry {
    pub token: Address,
    pub spender: Address,
    pub label: &'static str,
}

#[derive(Debug, Clone)]
pub struct ProtocolPack {
    pub id: &'static str,
    pub chain_id: u64,
    pub display_name: &'static str,
    pub entries: &'static [PackEntry],
    pub approvals: &'static [ApprovalEntry],
}

// Polygon Aave v3 pack
static POLYGON_AAVE_V3_ENTRIES: &[PackEntry] = &[
    PackEntry {
        target: address!("794a61358D6845594F94dc1DB02A252b5b4814aD"),
        selector: fixed_bytes!("617ba037"),
        label: "Pool.supply",
    },
    PackEntry {
        target: address!("794a61358D6845594F94dc1DB02A252b5b4814aD"),
        selector: fixed_bytes!("69328dec"),
        label: "Pool.withdraw",
    },
    PackEntry {
        target: address!("794a61358D6845594F94dc1DB02A252b5b4814aD"),
        selector: fixed_bytes!("a415bcad"),
        label: "Pool.borrow",
    },
    PackEntry {
        target: address!("794a61358D6845594F94dc1DB02A252b5b4814aD"),
        selector: fixed_bytes!("573ade81"),
        label: "Pool.repay",
    },
];

static POLYGON_AAVE_V3_APPROVALS: &[ApprovalEntry] = &[ApprovalEntry {
    token: address!("2791Bca1f2de4661ED88A30C99A7a9449Aa84174"),
    spender: address!("794a61358D6845594F94dc1DB02A252b5b4814aD"),
    label: "USDC.e -> Aave Pool (max)",
}];

static POLYGON_AAVE_V3: ProtocolPack = ProtocolPack {
    id: "aave-v3-polygon",
    chain_id: 137,
    display_name: "Aave v3 on Polygon",
    entries: POLYGON_AAVE_V3_ENTRIES,
    approvals: POLYGON_AAVE_V3_APPROVALS,
};

// ─── Hyperliquid Perps on HyperEVM (chain 999) ──────────────────────────────
//
// Allowlisted functions on TokagentHyperEvmHelper:
//   bridgeHype(uint256)       => 0xf4e0b185
//   dispatchCoreWriter(bytes) => 0xa62c829a
//
// NOTE: HYPERLIQUID_HELPER_HYPEREVM is a placeholder (zero address). Deploy
// TokagentHyperEvmHelper.s.sol on HyperEVM, then update this address and
// re-publish the CLI. Until updated, the pack is valid for pack-listing
// but the zero target cannot be called.
//
// Selectors verified against: cast sig "bridgeHype(uint256)" => 0xf4e0b185
//                             cast sig "dispatchCoreWriter(bytes)" => 0xa62c829a
const HYPERLIQUID_HELPER_HYPEREVM: Address = address!("0000000000000000000000000000000000000000");

static HYPEREVM_HL_PERPS_ENTRIES: &[PackEntry] = &[
    PackEntry {
        target: HYPERLIQUID_HELPER_HYPEREVM,
        selector: fixed_bytes!("f4e0b185"),
        label: "Helper.bridgeHype",
    },
    PackEntry {
        target: HYPERLIQUID_HELPER_HYPEREVM,
        selector: fixed_bytes!("a62c829a"),
        label: "Helper.dispatchCoreWriter",
    },
];

static HYPEREVM_HL_PERPS: ProtocolPack = ProtocolPack {
    id: "hyperliquid-perps-hyperevm",
    chain_id: 999,
    display_name: "Hyperliquid Perps (HyperEVM)",
    entries: HYPEREVM_HL_PERPS_ENTRIES,
    approvals: &[],
};

/// All packs registered in the CLI.
pub static PACKS: &[&ProtocolPack] = &[&POLYGON_AAVE_V3, &HYPEREVM_HL_PERPS];

pub fn find_pack(id: &str, chain_id: u64) -> Option<&'static ProtocolPack> {
    PACKS.iter().copied().find(|p| p.id == id && p.chain_id == chain_id)
}

pub fn list_for_chain(chain_id: u64) -> Vec<&'static ProtocolPack> {
    PACKS.iter().copied().filter(|p| p.chain_id == chain_id).collect()
}
