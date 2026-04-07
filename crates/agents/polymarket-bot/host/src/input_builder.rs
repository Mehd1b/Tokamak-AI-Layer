use anyhow::Result;

use crate::polymarket::types::{BookPrices, BotConfig, Position};

/// Probability scale (1e6).
const PROB_SCALE: f64 = 1_000_000.0;

/// USDC scale (1e6).
const USDC_SCALE: f64 = 1_000_000.0;

/// Build the 160-byte PolymarketInput from live market data.
pub fn build_polymarket_input(
    adapter_address: &[u8; 20],
    usdc_address: &[u8; 20],
    prices: &BookPrices,
    volume_24h: f64,
    position: &Option<Position>,
    usdc_balance: f64,
    config: &BotConfig,
    market_resolved: bool,
    winning_side: u8,
) -> Result<Vec<u8>> {
    let mut buf = vec![0u8; 160];

    buf[0..20].copy_from_slice(adapter_address);
    buf[20..40].copy_from_slice(usdc_address);

    let write_u64 = |buf: &mut Vec<u8>, offset: usize, val: u64| {
        buf[offset..offset + 8].copy_from_slice(&val.to_le_bytes());
    };

    write_u64(&mut buf, 40, to_prob(prices.best_bid));
    write_u64(&mut buf, 48, to_prob(prices.best_ask));
    write_u64(&mut buf, 56, to_prob(prices.mid_price));
    write_u64(&mut buf, 64, to_usdc(volume_24h));

    if let Some(pos) = position {
        if pos.side == "Yes" {
            write_u64(&mut buf, 72, to_prob(pos.size));
            buf[105] = 0;
        } else {
            write_u64(&mut buf, 80, to_prob(pos.size));
            buf[105] = 1;
        }
        write_u64(&mut buf, 88, to_prob(pos.entry_price));
        buf[104] = 1;
    }

    write_u64(&mut buf, 96, to_usdc(usdc_balance));

    buf[106] = config.strategy_mode;
    write_u64(&mut buf, 107, to_prob(config.buy_threshold));
    write_u64(&mut buf, 115, to_prob(config.sell_threshold));
    write_u64(&mut buf, 123, to_usdc(config.max_position_usdc));
    write_u64(&mut buf, 131, config.slippage_bps);
    write_u64(&mut buf, 139, config.stop_loss_bps);
    write_u64(&mut buf, 147, config.take_profit_bps);
    buf[155..157].copy_from_slice(&0u16.to_le_bytes()); // default drawdown

    buf[157] = market_resolved as u8;
    buf[158] = winning_side;

    Ok(buf)
}

fn to_prob(val: f64) -> u64 {
    (val * PROB_SCALE) as u64
}

fn to_usdc(val: f64) -> u64 {
    (val * USDC_SCALE) as u64
}
