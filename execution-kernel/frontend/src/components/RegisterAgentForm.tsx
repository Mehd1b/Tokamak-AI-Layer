'use client';

import { useState } from 'react';
import { useRegisterAgent } from '@/hooks/useKernelAgent';
import { isValidBytes32 } from '@/lib/utils';

export function RegisterAgentForm() {
  const [salt, setSalt] = useState('');
  const [imageId, setImageId] = useState('');
  const [agentCodeHash, setAgentCodeHash] = useState('');
  const { register, isPending, isConfirming, isSuccess, error } = useRegisterAgent();

  const canSubmit = isValidBytes32(salt) && isValidBytes32(imageId) && isValidBytes32(agentCodeHash);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    register(
      salt as `0x${string}`,
      imageId as `0x${string}`,
      agentCodeHash as `0x${string}`,
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm text-gray-400 mb-1" style={{ fontFamily: 'var(--font-mono), monospace' }}>
          Salt (bytes32)
        </label>
        <input
          type="text"
          value={salt}
          onChange={(e) => setSalt(e.target.value)}
          placeholder="0x..."
          className="input-dark font-mono"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1" style={{ fontFamily: 'var(--font-mono), monospace' }}>
          Image ID (bytes32)
        </label>
        <input
          type="text"
          value={imageId}
          onChange={(e) => setImageId(e.target.value)}
          placeholder="0x..."
          className="input-dark font-mono"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1" style={{ fontFamily: 'var(--font-mono), monospace' }}>
          Agent Code Hash (bytes32)
        </label>
        <input
          type="text"
          value={agentCodeHash}
          onChange={(e) => setAgentCodeHash(e.target.value)}
          placeholder="0x..."
          className="input-dark font-mono"
        />
      </div>
      <button
        type="submit"
        disabled={!canSubmit || isPending || isConfirming}
        className="btn-primary w-full"
      >
        {isPending ? 'Signing...' : isConfirming ? 'Confirming...' : 'Register Agent'}
      </button>
      {isSuccess && (
        <p className="text-emerald-400 text-sm" style={{ fontFamily: 'var(--font-mono), monospace' }}>
          Agent registered successfully!
        </p>
      )}
      {error && (
        <p className="text-red-400 text-sm" style={{ fontFamily: 'var(--font-mono), monospace' }}>
          {error.message.slice(0, 100)}
        </p>
      )}
    </form>
  );
}
