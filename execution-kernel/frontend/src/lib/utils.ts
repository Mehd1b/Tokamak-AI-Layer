export function truncateAddress(address: string, chars = 4): string {
  if (!address) return '';
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function truncateBytes32(hash: string, chars = 6): string {
  if (!hash) return '';
  return `${hash.slice(0, chars + 2)}...${hash.slice(-chars)}`;
}

export function formatBytes32(value: string): string {
  if (!value || value === '0x0000000000000000000000000000000000000000000000000000000000000000') {
    return '0x0...0';
  }
  return truncateBytes32(value, 8);
}

export function formatEther(value: bigint, decimals = 18): string {
  const str = value.toString();
  if (str.length <= decimals) {
    const padded = str.padStart(decimals + 1, '0');
    const whole = padded.slice(0, padded.length - decimals);
    const fraction = padded.slice(padded.length - decimals, padded.length - decimals + 4);
    return `${whole}.${fraction}`;
  }
  const whole = str.slice(0, str.length - decimals);
  const fraction = str.slice(str.length - decimals, str.length - decimals + 4);
  return `${whole}.${fraction}`;
}

export function isValidHex(value: string): boolean {
  return /^0x[0-9a-fA-F]*$/.test(value);
}

export function isValidBytes32(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

export function timestampToDate(timestamp: number | bigint): string {
  const ts = typeof timestamp === 'bigint' ? Number(timestamp) : timestamp;
  if (ts === 0) return 'Never';
  return new Date(ts * 1000).toLocaleString();
}
