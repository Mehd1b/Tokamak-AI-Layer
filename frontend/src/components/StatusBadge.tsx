import { CheckCircle, Clock, XCircle, AlertTriangle } from 'lucide-react';
import {
  getValidationStatusLabel,
  getValidationModelLabel,
  getStatusColor,
} from '@/lib/utils';

interface StatusBadgeProps {
  status: number;
}

const statusIcons: Record<number, React.ElementType> = {
  0: Clock,
  1: CheckCircle,
  2: XCircle,
  3: AlertTriangle,
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const Icon = statusIcons[status] ?? Clock;
  const colorClass = getStatusColor(status);
  const label = getValidationStatusLabel(status);

  return (
    <span className={`${colorClass} flex items-center gap-1`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

interface ModelBadgeProps {
  model: number;
}

export function ModelBadge({ model }: ModelBadgeProps) {
  const colors: Record<number, string> = {
    0: 'badge-success',
    1: 'badge-info',
    2: 'badge bg-purple-100 text-purple-800',
    3: 'badge-warning',
  };

  return (
    <span className={colors[model] ?? 'badge-info'}>
      {getValidationModelLabel(model)}
    </span>
  );
}
