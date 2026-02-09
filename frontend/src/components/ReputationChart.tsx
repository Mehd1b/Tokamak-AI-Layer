'use client';

interface ReputationBarProps {
  label: string;
  value: number | null;
  maxValue?: number;
  color?: string;
}

export function ReputationBar({
  label,
  value,
  maxValue = 100,
  color = 'bg-[#38BDF8]',
}: ReputationBarProps) {
  const percent = value !== null ? Math.min((value / maxValue) * 100, 100) : 0;
  const displayValue = value !== null ? value.toFixed(1) : 'N/A';

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-300">{label}</span>
        <span className="text-sm font-bold text-white">{displayValue}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-white/10">
        <div
          className={`h-2 rounded-full ${color} transition-all duration-500`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

interface ReputationSummaryProps {
  standard: number | null;
  stakeWeighted: number | null;
  verified: number | null;
}

export function ReputationSummary({
  standard,
  stakeWeighted,
  verified,
}: ReputationSummaryProps) {
  return (
    <div className="space-y-4">
      <ReputationBar
        label="Standard Reputation"
        value={standard}
        color="bg-[#38BDF8]"
      />
      <ReputationBar
        label="Stake-Weighted"
        value={stakeWeighted}
        color="bg-blue-500"
      />
      <ReputationBar
        label="Verified Only"
        value={verified}
        color="bg-purple-500"
      />
    </div>
  );
}
