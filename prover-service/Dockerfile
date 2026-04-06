# ===========================================================================
# Stage 1: Build
# ===========================================================================
FROM rust:1.77-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only manifests first to cache dependency compilation.
COPY Cargo.toml Cargo.lock* ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release 2>/dev/null || true

# Copy actual source and rebuild.
COPY src/ src/
RUN cargo build --release

# ===========================================================================
# Stage 2: Runtime
# ===========================================================================
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/prover-service /usr/local/bin/prover-service

ENV HOST=0.0.0.0
ENV PORT=3001

EXPOSE 3001

ENTRYPOINT ["prover-service"]
