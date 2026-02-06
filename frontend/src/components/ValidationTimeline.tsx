import { CheckCircle, Clock, Shield, AlertTriangle } from 'lucide-react';

interface TimelineStep {
  label: string;
  description: string;
  status: 'completed' | 'active' | 'pending';
}

interface ValidationTimelineProps {
  validationStatus: number; // 0=Pending, 1=Completed, 2=Expired, 3=Disputed
}

function getSteps(status: number): TimelineStep[] {
  const steps: TimelineStep[] = [
    {
      label: 'Validation Requested',
      description: 'Request submitted on-chain',
      status: 'completed',
    },
    {
      label: 'Validator Selected',
      description: 'DRB commit-reveal selects validator',
      status: status >= 1 ? 'completed' : 'active',
    },
    {
      label: 'Validation Complete',
      description: 'Result submitted and verified',
      status: status === 1 ? 'completed' : 'pending',
    },
  ];

  if (status === 2) {
    steps[2] = {
      label: 'Expired',
      description: 'Validation timed out',
      status: 'completed',
    };
  }

  if (status === 3) {
    steps.push({
      label: 'Disputed',
      description: 'Dispute raised and under review',
      status: 'active',
    });
  }

  return steps;
}

const stepIcons = {
  completed: { Icon: CheckCircle, bg: 'bg-green-100', color: 'text-green-600' },
  active: { Icon: Clock, bg: 'bg-tokamak-100', color: 'text-tokamak-600' },
  pending: { Icon: Shield, bg: 'bg-gray-100', color: 'text-gray-400' },
};

export function ValidationTimeline({ validationStatus }: ValidationTimelineProps) {
  const steps = getSteps(validationStatus);

  return (
    <div className="space-y-4">
      {steps.map((step, i) => {
        const { Icon, bg, color } = stepIcons[step.status];
        const textColor =
          step.status === 'pending' ? 'text-gray-500' : 'text-gray-900';
        const descColor =
          step.status === 'pending' ? 'text-gray-400' : 'text-gray-500';

        return (
          <div key={i} className="flex items-start gap-3">
            <div
              className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full ${bg}`}
            >
              <Icon className={`h-3.5 w-3.5 ${color}`} />
            </div>
            <div>
              <p className={`text-sm font-medium ${textColor}`}>{step.label}</p>
              <p className={`text-xs ${descColor}`}>{step.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
