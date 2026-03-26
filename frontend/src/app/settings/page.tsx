'use client';

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'TokagentBot';

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight text-white">
        Notifications
      </h1>
      <p className="mt-2 text-gray-400">
        Get real-time Telegram alerts when your vaults have activity.
      </p>

      {/* Telegram linking */}
      <div className="mt-10 rounded-xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
            <TelegramIcon />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-white">Telegram Bot</h2>
            <p className="text-sm text-gray-400">
              @{BOT_USERNAME}
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <Step number={1}>
            Open Telegram and search for{' '}
            <a
              href={`https://t.me/${BOT_USERNAME}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-sky-400 hover:text-sky-300 transition-colors"
            >
              @{BOT_USERNAME}
            </a>
          </Step>

          <Step number={2}>
            Send <Code>/start</Code> to begin
          </Step>

          <Step number={3}>
            Subscribe to a vault by sending:
            <div className="mt-2">
              <Code>/subscribe 0xYourVaultAddress</Code>
            </div>
          </Step>
        </div>

        <a
          href={`https://t.me/${BOT_USERNAME}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sky-500"
        >
          <TelegramIcon />
          Open in Telegram
        </a>
      </div>

      {/* Notification types */}
      <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="text-lg font-semibold text-white">What you will receive</h2>
        <ul className="mt-4 space-y-3 text-sm text-gray-300">
          <NotificationType
            title="Execution Applied"
            description="When an agent executes a trade on your vault, including the PPS change"
          />
          <NotificationType
            title="PPS Alerts"
            description="When price-per-share changes more than 1% after an execution"
          />
          <NotificationType
            title="Deposits & Withdrawals"
            description="When deposits or withdrawals occur on a vault you are tracking"
          />
        </ul>
      </div>

      {/* Bot commands reference */}
      <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="text-lg font-semibold text-white">Bot commands</h2>
        <div className="mt-4 overflow-hidden rounded-lg border border-white/5">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-white/5">
              <CommandRow command="/subscribe <address>" description="Subscribe to vault events" />
              <CommandRow command="/unsubscribe <address>" description="Remove a subscription" />
              <CommandRow command="/list" description="Show your subscriptions" />
              <CommandRow command="/help" description="Show available commands" />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function Step({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-medium text-white">
        {number}
      </span>
      <p className="text-sm text-gray-300">{children}</p>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs text-sky-300">
      {children}
    </code>
  );
}

function NotificationType({ title, description }: { title: string; description: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
      <div>
        <span className="font-medium text-white">{title}</span>
        <span className="text-gray-400"> — {description}</span>
      </div>
    </li>
  );
}

function CommandRow({ command, description }: { command: string; description: string }) {
  return (
    <tr>
      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-sky-300">
        {command}
      </td>
      <td className="px-4 py-2.5 text-gray-400">{description}</td>
    </tr>
  );
}

function TelegramIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}
