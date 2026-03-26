import TelegramBot from 'node-telegram-bot-api';
import { isAddress } from 'viem';
import {
  addSubscription,
  removeSubscription,
  getSubscriptionsForChat,
} from './db.js';

let bot: TelegramBot | null = null;

/**
 * Initialise the Telegram bot and register command handlers.
 * Returns the bot instance so the monitor can send messages through it.
 */
export function createBot(token: string): TelegramBot {
  bot = new TelegramBot(token, { polling: true });

  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot!.sendMessage(
      chatId,
      [
        'Welcome to *Tokagent Vault Monitor*!',
        '',
        'I can notify you when your vaults have activity on HyperEVM.',
        '',
        'Use /subscribe <vault-address> to start tracking a vault.',
        'Use /help to see all available commands.',
      ].join('\n'),
      { parse_mode: 'Markdown' },
    );
  });

  bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot!.sendMessage(
      chatId,
      [
        '*Available commands:*',
        '',
        '/subscribe `<vault-address>` — Subscribe to vault events',
        '/unsubscribe `<vault-address>` — Remove a subscription',
        '/list — Show your current subscriptions',
        '/help — Show this help message',
      ].join('\n'),
      { parse_mode: 'Markdown' },
    );
  });

  bot.onText(/\/subscribe(?:\s+(.+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const address = match?.[1]?.trim();

    if (!address) {
      bot!.sendMessage(
        chatId,
        'Usage: /subscribe `<vault-address>`\n\nExample: /subscribe 0x1234...abcd',
        { parse_mode: 'Markdown' },
      );
      return;
    }

    if (!isAddress(address)) {
      bot!.sendMessage(chatId, 'Invalid Ethereum address. Please provide a valid vault address.');
      return;
    }

    const added = addSubscription(chatId, address);
    if (added) {
      bot!.sendMessage(
        chatId,
        `Subscribed to vault \`${address}\`.\n\nYou will receive notifications for executions, deposits, and withdrawals.`,
        { parse_mode: 'Markdown' },
      );
    } else {
      bot!.sendMessage(chatId, 'You are already subscribed to this vault.');
    }
  });

  bot.onText(/\/unsubscribe(?:\s+(.+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const address = match?.[1]?.trim();

    if (!address) {
      bot!.sendMessage(
        chatId,
        'Usage: /unsubscribe `<vault-address>`\n\nExample: /unsubscribe 0x1234...abcd',
        { parse_mode: 'Markdown' },
      );
      return;
    }

    if (!isAddress(address)) {
      bot!.sendMessage(chatId, 'Invalid Ethereum address.');
      return;
    }

    const removed = removeSubscription(chatId, address);
    if (removed) {
      bot!.sendMessage(chatId, `Unsubscribed from vault \`${address}\`.`, {
        parse_mode: 'Markdown',
      });
    } else {
      bot!.sendMessage(chatId, 'You were not subscribed to this vault.');
    }
  });

  bot.onText(/\/list/, (msg) => {
    const chatId = msg.chat.id;
    const subs = getSubscriptionsForChat(chatId);

    if (subs.length === 0) {
      bot!.sendMessage(
        chatId,
        'You have no active subscriptions.\n\nUse /subscribe `<vault-address>` to get started.',
        { parse_mode: 'Markdown' },
      );
      return;
    }

    const lines = subs.map(
      (s, i) => `${i + 1}. \`${s.vault_address}\`  _(since ${s.created_at})_`,
    );

    bot!.sendMessage(
      chatId,
      [`*Your subscriptions (${subs.length}):*`, '', ...lines].join('\n'),
      { parse_mode: 'Markdown' },
    );
  });

  console.log('[bot] Telegram bot started');
  return bot;
}

/**
 * Send a message to a specific chat. Used by the monitor to push notifications.
 */
export function sendNotification(chatId: number, message: string): void {
  if (!bot) {
    console.error('[bot] Bot not initialised — cannot send notification');
    return;
  }
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' }).catch((err) => {
    console.error(`[bot] Failed to send to chat ${chatId}:`, err.message);
  });
}

/**
 * Stop the bot polling loop.
 */
export function stopBot(): void {
  if (bot) {
    bot.stopPolling();
    bot = null;
  }
}
