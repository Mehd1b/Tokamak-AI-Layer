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
import signal
import argparse
from eth_account import Account

# Hard kill timeout: if the script hasn't finished in 25s, abort.
# This prevents zombie processes when the SDK hangs on WebSocket/HTTP.
def _timeout_handler(signum, frame):
    print(json.dumps({"status": "error", "step": "timeout", "detail": "Script hard-killed after 25s"}))
    sys.exit(1)

signal.signal(signal.SIGALRM, _timeout_handler)
signal.alarm(25)

# HTTP timeout for all SDK requests (seconds)
SDK_TIMEOUT = 10


def make_exchange(key, hl_url):
    """Create a Hyperliquid Exchange client with timeout and skip_ws."""
    from hyperliquid.exchange import Exchange
    account = Account.from_key(key)
    return Exchange(account, hl_url, timeout=SDK_TIMEOUT)


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
        import time
        t0 = time.time()
        print(f"[seed] Creating exchange client...", file=sys.stderr, flush=True)
        exchange = make_exchange(args.key, args.hl_url)
        print(f"[seed] Exchange client created ({time.time()-t0:.1f}s)", file=sys.stderr, flush=True)

        # Step 1: Set leverage
        print(f"[seed] Setting leverage to {args.leverage}x...", file=sys.stderr, flush=True)
        lev_result = exchange.update_leverage(args.leverage, args.asset, True)
        print(f"[seed] Leverage result: {lev_result.get('status')} ({time.time()-t0:.1f}s)", file=sys.stderr, flush=True)
        if lev_result.get("status") != "ok":
            return {"status": "error", "step": "set_leverage", "detail": str(lev_result)}

        # Step 2: Compute fill-ensuring price for IOC order.
        # Use exchange.info (skip_ws=True internally) instead of separate Info client.
        print(f"[seed] Fetching L2 snapshot...", file=sys.stderr, flush=True)
        l2 = exchange.info.l2_snapshot(args.asset)
        print(f"[seed] L2 snapshot received ({time.time()-t0:.1f}s)", file=sys.stderr, flush=True)

        if args.is_buy:
            best_ask = float(l2["levels"][1][0]["px"]) if l2.get("levels") and len(l2["levels"]) > 1 and l2["levels"][1] else args.price
            ioc_price = round(best_ask * 1.005)  # 0.5% above ask
        else:
            best_bid = float(l2["levels"][0][0]["px"]) if l2.get("levels") and l2["levels"][0] else args.price
            ioc_price = round(best_bid * 0.995)  # 0.5% below bid

        print(f"[seed] IOC price: ${ioc_price} (agent limit: ${args.price})", file=sys.stderr, flush=True)

        # Step 3: Place IOC order at fill-ensuring price
        print(f"[seed] Placing IOC order: {'BUY' if args.is_buy else 'SELL'} {args.size} {args.asset} @ ${ioc_price}...", file=sys.stderr, flush=True)
        order_result = exchange.order(
            args.asset,
            args.is_buy,
            args.size,
            ioc_price,
            {"limit": {"tif": "Ioc"}}
        )
        print(f"[seed] Order result received ({time.time()-t0:.1f}s)", file=sys.stderr, flush=True)

        return parse_order_result(order_result)
    except Exception as e:
        return {"status": "error", "step": "exception", "detail": str(e)}


def do_close_position(args):
    """Place a reduce-only closing IOC order."""
    try:
        exchange = make_exchange(args.key, args.hl_url)

        # Use exchange.info (skip_ws=True internally) instead of separate Info client.
        l2 = exchange.info.l2_snapshot(args.asset)
        if args.is_buy:
            # Closing a short: buy at slightly above ask
            best_ask = float(l2["levels"][1][0]["px"]) if l2.get("levels") and len(l2["levels"]) > 1 and l2["levels"][1] else args.price
            ioc_price = round(best_ask * 1.005)
        else:
            # Closing a long: sell at slightly below bid
            best_bid = float(l2["levels"][0][0]["px"]) if l2.get("levels") and l2["levels"][0] else args.price
            ioc_price = round(best_bid * 0.995)

        print(f"Closing via REST API: {'BUY' if args.is_buy else 'SELL'} {args.size} {args.asset} @ ${ioc_price} (mark=${l2['levels'][0][0]['px'] if l2.get('levels') and l2['levels'][0] else 'unknown'})", file=sys.stderr, flush=True)

        # Close = sell if long (is_buy=false), buy if short (is_buy=true)
        # reduce_only=True prevents flipping the position
        order_result = exchange.order(
            args.asset,
            args.is_buy,
            args.size,
            ioc_price,
            {"limit": {"tif": "Ioc"}},
            reduce_only=True,
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
