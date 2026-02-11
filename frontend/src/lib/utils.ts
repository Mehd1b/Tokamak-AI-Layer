import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function formatScore(score: number | null): string {
  if (score === null) return 'N/A';
  return score.toFixed(1);
}

export function formatBigInt(value: bigint, decimals = 18): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = value / divisor;
  const fraction = value % divisor;
  const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, 2);
  return `${whole.toLocaleString()}.${fractionStr}`;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function getValidationModelLabel(model: number): string {
  switch (model) {
    case 0: return 'Reputation Only';
    case 1: return 'Stake Secured';
    case 2: return 'TEE Attested';
    case 3: return 'Hybrid';
    default: return 'Unknown';
  }
}

export function getAgentStatusLabel(status: number): string {
  switch (status) {
    case 0: return 'Active';
    case 1: return 'Paused';
    case 2: return 'Deregistered';
    default: return 'Unknown';
  }
}

export function getAgentStatusColor(status: number): string {
  switch (status) {
    case 0: return 'badge-success';
    case 1: return 'badge-warning';
    case 2: return 'badge-error';
    default: return 'badge-info';
  }
}

export function getValidationModelColor(model: number): string {
  switch (model) {
    case 0: return 'badge-info';
    case 1: return 'badge-warning';
    case 2: return 'badge-success';
    case 3: return 'badge-error';
    default: return 'badge-info';
  }
}

export function getValidationStatusLabel(status: number): string {
  switch (status) {
    case 0: return 'Pending';
    case 1: return 'Completed';
    case 2: return 'Expired';
    case 3: return 'Disputed';
    default: return 'Unknown';
  }
}

export function getStatusColor(status: number): string {
  switch (status) {
    case 0: return 'badge-warning';
    case 1: return 'badge-success';
    case 2: return 'badge-error';
    case 3: return 'badge-error';
    default: return 'badge-info';
  }
}
