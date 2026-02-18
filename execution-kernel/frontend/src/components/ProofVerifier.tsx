'use client';

import { useState } from 'react';
import { useParseJournal } from '@/hooks/useVerifier';
import { isValidHex, formatBytes32 } from '@/lib/utils';
import { ProofBadge } from './ProofBadge';

export function ProofVerifier() {
  const [journal, setJournal] = useState('');
  const [seal, setSeal] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const journalHex = isValidHex(journal) ? (journal as `0x${string}`) : undefined;
  const { data: parsed, isLoading, error } = useParseJournal(submitted ? journalHex : undefined);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1" style={{ fontFamily: 'var(--font-mono), monospace' }}>
            Journal (hex)
          </label>
          <textarea
            value={journal}
            onChange={(e) => { setJournal(e.target.value); setSubmitted(false); }}
            placeholder="0x..."
            className="input-dark font-mono h-24 resize-none"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1" style={{ fontFamily: 'var(--font-mono), monospace' }}>
            Seal (hex) - for on-chain verification
          </label>
          <textarea
            value={seal}
            onChange={(e) => setSeal(e.target.value)}
            placeholder="0x..."
            className="input-dark font-mono h-24 resize-none"
          />
        </div>
        <button
          type="submit"
          disabled={!isValidHex(journal) || isLoading}
          className="btn-primary w-full"
        >
          {isLoading ? 'Parsing...' : 'Parse & Verify'}
        </button>
      </form>

      {submitted && parsed && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-white" style={{ fontFamily: 'var(--font-serif), serif' }}>
              Parsed Journal Fields
            </h3>
            <ProofBadge verified={!error} />
          </div>
          <div className="space-y-3 text-sm" style={{ fontFamily: 'var(--font-mono), monospace' }}>
            {[
              ['Agent ID', parsed.agentId],
              ['Agent Code Hash', parsed.agentCodeHash],
              ['Constraint Set Hash', parsed.constraintSetHash],
              ['Input Root', parsed.inputRoot],
              ['Execution Nonce', parsed.executionNonce?.toString()],
              ['Input Commitment', parsed.inputCommitment],
              ['Action Commitment', parsed.actionCommitment],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-gray-500">{label}</span>
                <span className="text-gray-300">{typeof value === 'string' && value.startsWith('0x') ? formatBytes32(value) : (value ?? '-')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {submitted && error && (
        <div className="card border-red-500/20">
          <div className="flex items-center gap-2 mb-2">
            <ProofBadge verified={false} />
            <span className="text-red-400 font-medium">Verification Failed</span>
          </div>
          <p className="text-sm text-red-400/70 font-mono">{error.message.slice(0, 200)}</p>
        </div>
      )}
    </div>
  );
}
