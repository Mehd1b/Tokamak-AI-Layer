"""Oracle price feed parser matching the Rust wire format.

Wire format (all integers little-endian)::

    HASHABLE BODY (30 + 16*N bytes):
      [0]       feed_version    u8       (must be 0x01)
      [1:21]    signer          [u8;20]
      [21:29]   timestamp       u64 LE
      [29]      price_count     u8       (1..32)
      [30..]    prices          16 bytes each:
                  asset_id      u32 LE
                  price         u64 LE   (1e8 scaled)
                  conf          u32 LE   (1e8 scaled confidence)

    SIGNATURE (65 bytes, appended after body):
      sig_v     u8
      sig_r     [u8;32]
      sig_s     [u8;32]
"""

from __future__ import annotations

import struct

from .types import (
    FEED_HEADER_SIZE,
    FEED_VERSION,
    MAX_PRICE_COUNT,
    PRICE_POINT_SIZE,
    SIGNATURE_SIZE,
    OraclePriceFeed,
    PricePoint,
    Signature,
)


def feed_wire_len(price_count: int) -> int:
    """Compute total wire length: 30 (header) + 16*N (prices) + 65 (sig)."""
    return FEED_HEADER_SIZE + PRICE_POINT_SIZE * price_count + SIGNATURE_SIZE


def parse_feed(data: bytes) -> OraclePriceFeed | None:
    """Decode an ``OraclePriceFeed`` from raw wire bytes.

    Returns ``None`` if the data is malformed, too short, has wrong version,
    or has an invalid price count.
    """
    min_len = FEED_HEADER_SIZE + PRICE_POINT_SIZE + SIGNATURE_SIZE
    if len(data) < min_len:
        return None

    offset = 0

    # Header
    feed_version = data[offset]
    offset += 1
    if feed_version != FEED_VERSION:
        return None

    signer = data[offset : offset + 20]
    offset += 20

    timestamp = struct.unpack_from("<Q", data, offset)[0]
    offset += 8

    price_count = data[offset]
    offset += 1

    if price_count == 0 or price_count > MAX_PRICE_COUNT:
        return None

    expected_len = feed_wire_len(price_count)
    if len(data) < expected_len:
        return None

    # Prices
    prices: list[PricePoint] = []
    for _ in range(price_count):
        asset_id = struct.unpack_from("<I", data, offset)[0]
        offset += 4
        price = struct.unpack_from("<Q", data, offset)[0]
        offset += 8
        conf = struct.unpack_from("<I", data, offset)[0]
        offset += 4
        prices.append(PricePoint(asset_id=asset_id, price=price, conf=conf))

    # Signature
    sig_v = data[offset]
    offset += 1
    sig_r = data[offset : offset + 32]
    offset += 32
    sig_s = data[offset : offset + 32]
    offset += 32

    return OraclePriceFeed(
        feed_version=feed_version,
        signer=signer,
        timestamp=timestamp,
        price_count=price_count,
        prices=prices,
        signature=Signature(v=sig_v, r=sig_r, s=sig_s),
    )


def encode_feed(feed: OraclePriceFeed) -> bytes:
    """Encode an ``OraclePriceFeed`` back to wire format (useful for tests)."""
    buf = bytearray()

    # Header
    buf.append(feed.feed_version)
    buf += feed.signer
    buf += struct.pack("<Q", feed.timestamp)
    buf.append(feed.price_count)

    # Prices
    for pp in feed.prices[: feed.price_count]:
        buf += struct.pack("<I", pp.asset_id)
        buf += struct.pack("<Q", pp.price)
        buf += struct.pack("<I", pp.conf)

    # Signature
    if feed.signature is not None:
        buf.append(feed.signature.v)
        buf += feed.signature.r
        buf += feed.signature.s
    else:
        buf += b"\x00" * SIGNATURE_SIZE

    return bytes(buf)


def get_price(feed: OraclePriceFeed, asset_id: int) -> PricePoint | None:
    """Look up a ``PricePoint`` by asset ID (linear scan, max 32 items)."""
    for pp in feed.prices[: feed.price_count]:
        if pp.asset_id == asset_id:
            return pp
    return None
