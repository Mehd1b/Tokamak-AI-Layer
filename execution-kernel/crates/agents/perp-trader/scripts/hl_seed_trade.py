#!/usr/bin/env python3
"""Hyperliquid Exchange API helper for seed trades.

Called by the Rust perp-trader host when CoreWriter can't place orders
because the HyperCore position precompile shows leverage=0 (no existing
position). This script uses the API wallet to set leverage and place
the opening order via the REST API, after which CoreWriter works.

Usage:
    python3 hl_seed_trade.py seed_trade \
        --key 0x... --asset BTC --leverage 5 \
        --is-buy true --size 0.001 --price 67000.0

    python3 hl_seed_trade.py set_leverage \
        --key 0x... --asset BTC --leverage 10

    python3 hl_seed_trade.py close_position \
        --key 0x... --asset BTC --size 0.001 --price 66000.0
"""

import sys
import json
import argparse
from eth_account import Account


def make_exchange(key, hl_url):
    """Create a Hyperliquid Exchange client."""
    from hyperliquid.exchange import Exchange
    account = Account.from_key(key)
    return Exchange(account, hl_url)


def make_info(hl_url):
    """Create a Hyperliquid Info client."""
    from hyperliquid.info import Info
    return Info(hl_url)


def do_set_leverage(args):
    """Set leverage for an asset via REST API."""
    try:
        exchange = make_exchange(args.key, args.hl_url)
        result = exchange.update_leverage(args.leverage, args.asset, True)
        if result.get("status") == "ok":
            return {"status": "ok"}
        else:
            return {"status": "error", "detail": str(result)}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


def do_seed_trade(args):
    """Set leverage + place IOC order to seed a position."""
    try:
        exchange = make_exchange(args.key, args.hl_url)

        # Step 1: Set leverage
        lev_result = exchange.update_leverage(args.leverage, args.asset, True)
        if lev_result.get("status") != "ok":
            return {"status": "error", "step": "set_leverage", "detail": str(lev_result)}

        # Step 2: Place IOC order
        order_result = exchange.order(
            args.asset,
            args.is_buy,
            args.size,
            args.price,
            {"limit": {"tif": "Ioc"}}
        )

        return parse_order_result(order_result)
    except Exception as e:
        return {"status": "error", "step": "exception", "detail": str(e)}


def do_close_position(args):
    """Place a closing IOC order."""
    try:
        exchange = make_exchange(args.key, args.hl_url)

        # Close = sell if long (is_buy=false), buy if short (is_buy=true)
        order_result = exchange.order(
            args.asset,
            args.is_buy,  # opposite of position direction
            args.size,
            args.price,
            {"limit": {"tif": "Ioc"}}
        )

        return parse_order_result(order_result)
    except Exception as e:
        return {"status": "error", "step": "exception", "detail": str(e)}


def parse_order_result(order_result):
    """Parse Hyperliquid order response into a simple status dict."""
    if order_result.get("status") == "ok":
        data = order_result.get("response", {}).get("data", {})
        statuses = data.get("statuses", [])
        if statuses and "filled" in statuses[0]:
            fill = statuses[0]["filled"]
            return {
                "status": "filled",
                "avg_price": fill.get("avgPx", "0"),
                "total_size": fill.get("totalSz", "0"),
            }
        elif statuses and "resting" in statuses[0]:
            return {"status": "resting", "detail": str(statuses[0])}
        elif statuses and "error" in statuses[0]:
            return {"status": "error", "step": "order_rejected", "detail": statuses[0]["error"]}
        else:
            return {"status": "no_fill", "detail": str(statuses)}
    else:
        return {"status": "error", "step": "place_order", "detail": str(order_result)}


def main():
    parser = argparse.ArgumentParser(description="Hyperliquid Exchange API helper")
    parser.add_argument("action", choices=["set_leverage", "seed_trade", "close_position"])
    parser.add_argument("--key", required=True, help="API wallet private key (0x-prefixed)")
    parser.add_argument("--hl-url", default="https://api.hyperliquid.xyz", help="Hyperliquid API URL")
    parser.add_argument("--asset", default="BTC", help="Asset symbol")
    parser.add_argument("--leverage", type=int, default=10, help="Leverage multiplier")
    parser.add_argument("--is-buy", type=lambda x: x.lower() == "true", default=True, help="Order side")
    parser.add_argument("--size", type=float, default=0.0, help="Order size in base asset")
    parser.add_argument("--price", type=float, default=0.0, help="Limit price in USD")

    args = parser.parse_args()

    if args.action == "set_leverage":
        result = do_set_leverage(args)
    elif args.action == "seed_trade":
        result = do_seed_trade(args)
    elif args.action == "close_position":
        result = do_close_position(args)
    else:
        result = {"status": "error", "detail": f"Unknown action: {args.action}"}

    print(json.dumps(result))


if __name__ == "__main__":
    main()
