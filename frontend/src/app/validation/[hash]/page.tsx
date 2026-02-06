'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle,
  Clock,
  AlertTriangle,
  Shield,
  Copy,
  CheckCircle as Check,
} from 'lucide-react';
import { useValidation, useIsDisputed } from '@/hooks/useValidation';
import {
  shortenAddress,
  getValidationModelLabel,
  getValidationStatusLabel,
  getStatusColor,
} from '@/lib/utils';
import { useState } from 'react';

export default function ValidationDetailPage() {
  const params = useParams();
  const hash = params?.hash as `0x${string}` | undefined;
  const { validation, isLoading } = useValidation(hash);
  const { isDisputed } = useIsDisputed(hash);
  const [copied, setCopied] = useState(false);

  const copyHash = () => {
    if (hash) {
      navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-gray-500">Loading validation details...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/validation"
        className="mb-6 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Validations
      </Link>

      {/* Header */}
      <div className="card mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Validation Request
            </h1>
            <div className="mt-2 flex items-center gap-2">
              <span className="font-mono text-sm text-gray-500">
                {hash ? shortenAddress(hash, 8) : 'Unknown'}
              </span>
              <button
                onClick={copyHash}
                className="text-gray-400 hover:text-gray-600"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
          {isDisputed && (
            <span className="badge-error flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Disputed
            </span>
          )}
        </div>
      </div>

      {!validation ? (
        <div className="card py-12 text-center">
          <Shield className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-semibold text-gray-900">
            Validation Not Found
          </h3>
          <p className="mt-2 text-sm text-gray-500">
            This validation request hash does not exist on-chain or has not been
            indexed yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Request Details */}
          <div className="card">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              Request Details
            </h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-gray-500">Request Hash</dt>
                <dd className="mt-1 truncate font-mono text-sm text-gray-900">
                  {hash}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Trust Model</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {getValidationModelLabel(0)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Status</dt>
                <dd className="mt-1">
                  <span className={getStatusColor(0)}>
                    {getValidationStatusLabel(0)}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Disputed</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {isDisputed ? 'Yes' : 'No'}
                </dd>
              </div>
            </dl>
          </div>

          {/* Validation Result */}
          <div className="card">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              Validation Result
            </h2>
            <div className="rounded-lg bg-gray-50 p-6 text-center">
              <Clock className="mx-auto h-8 w-8 text-gray-400" />
              <p className="mt-2 text-sm text-gray-500">
                Validation result details will be available once the subgraph
                indexer is deployed (Sprint 3).
              </p>
            </div>
          </div>

          {/* Timeline */}
          <div className="card md:col-span-2">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              Timeline
            </h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-green-100">
                  <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    Validation Requested
                  </p>
                  <p className="text-xs text-gray-500">
                    Request submitted on-chain
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-gray-100">
                  <Clock className="h-3.5 w-3.5 text-gray-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">
                    Awaiting Validator
                  </p>
                  <p className="text-xs text-gray-400">
                    DRB selects a validator via commit-reveal
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-gray-100">
                  <Shield className="h-3.5 w-3.5 text-gray-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">
                    Validation Complete
                  </p>
                  <p className="text-xs text-gray-400">
                    Result submitted and verified
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-6 flex gap-4">
        <button className="btn-secondary" disabled>
          Dispute Validation
        </button>
      </div>
    </div>
  );
}
