'use client';

import { useState } from 'react';
import { useExecute } from '@/hooks/useKernelVault';
import { isValidHex } from '@/lib/utils';
import { parseVaultError } from '@/lib/vaultErrors';

export function ExecutionSubmitForm({ vaultAddress }: { vaultAddress: `0x${string}` }) {
  const [journal, setJournal] = useState('');
  const [seal, setSeal] = useState('');
  const [agentOutput, setAgentOutput] = useState('');
  const { execute, isPending, isConfirming, isSuccess, error } = useExecute(vaultAddress);

  const canSubmit = isValidHex(journal) && isValidHex(seal) && isValidHex(agentOutput);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    execute(
      journal as `0x${string}`,
      seal as `0x${string}`,
      agentOutput as `0x${string}`,
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm text-gray-400 mb-1" style={{ fontFamily: 'var(--font-mono), monospace' }}>
          Journal (hex)
        </label>
        <textarea
          value={journal}
          onChange={(e) => setJournal(e.target.value)}
          placeholder="0x..."
          className="input-dark font-mono h-20 resize-none"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1" style={{ fontFamily: 'var(--font-mono), monospace' }}>
          Seal (hex)
        </label>
        <textarea
          value={seal}
          onChange={(e) => setSeal(e.target.value)}
          placeholder="0x..."
          className="input-dark font-mono h-20 resize-none"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1" style={{ fontFamily: 'var(--font-mono), monospace' }}>
          Agent Output (hex)
        </label>
        <textarea
          value={agentOutput}
          onChange={(e) => setAgentOutput(e.target.value)}
          placeholder="0x..."
          className="input-dark font-mono h-20 resize-none"
        />
      </div>
      <button
        type="submit"
        disabled={!canSubmit || isPending || isConfirming}
        className="btn-primary w-full"
      >
        {isPending ? 'Signing...' : isConfirming ? 'Verifying & Executing...' : 'Submit Execution'}
      </button>
      {isSuccess && (
        <p className="text-emerald-400 text-sm font-mono">Execution applied successfully!</p>
      )}
      {error && (
        <p className="text-red-400 text-sm font-mono">{parseVaultError(error)}</p>
      )}
    </form>
  );
}
