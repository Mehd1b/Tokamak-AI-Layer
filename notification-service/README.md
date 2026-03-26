# Tokagent Notification Service

Telegram bot that monitors KernelVault events on HyperEVM and sends notifications to subscribers.

## Monitored events

- **ExecutionApplied** — agent executed a trade (includes PPS change)
- **Deposit** — new deposit into a vault
- **Withdraw** — withdrawal from a vault
- **PPS Alert** — price-per-share changed more than 1% after an execution

## Setup

1. Create a Telegram bot via [@BotFather](https://t.me/BotFather) and get the token.

2. Install dependencies:

```bash
cd notification-service
npm install
```

3. Copy `.env.example` to `.env` and fill in your bot token:

```bash
cp .env.example .env
# Edit .env with your TELEGRAM_BOT_TOKEN
```

4. Run the service:

```bash
npx tsx src/index.ts
```

Or for development with auto-reload:

```bash
npm run dev
```

## Bot commands

| Command | Description |
|---|---|
| `/start` | Welcome message |
| `/subscribe <vault-address>` | Subscribe to a vault's events |
| `/unsubscribe <vault-address>` | Remove a subscription |
| `/list` | Show your current subscriptions |
| `/help` | Show available commands |

## Architecture

- **Polling-based** — queries the HyperEVM RPC for new blocks on a configurable interval (default 15s)
- **SQLite storage** — subscriptions stored locally in `subscriptions.db`, no external database needed
- **Self-contained** — single process running bot + monitor

## Configuration

| Variable | Default | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | (required) | Bot token from BotFather |
| `RPC_URL` | `https://rpc.hyperliquid.xyz/evm` | HyperEVM RPC endpoint |
| `CHAIN_ID` | `999` | Chain ID for HyperEVM |
| `POLL_INTERVAL_MS` | `15000` | Block polling interval in ms |
