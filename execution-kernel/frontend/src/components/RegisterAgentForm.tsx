'use client';

import { useState } from 'react';
import { useRegisterAgent } from '@/hooks/useKernelAgent';
import { isValidBytes32 } from '@/lib/utils';

export function RegisterAgentForm() {
  const [codehash, setCodehash] = useState('');
  const [imageId, setImageId] = useState('');
  const [configHash, setConfigHash] = useState('');
  const [metadataURI, setMetadataURI] = useState('');
  const { register, isPending, isConfirming, isSuccess, error } = useRegisterAgent();

  const canSubmit = isValidBytes32(codehash) && isValidBytes32(imageId) && isValidBytes32(configHash) && metadataURI.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    register(
      codehash as `0x${string}`,
      imageId as `0x${string}`,
      configHash as `0x${string}`,
      metadataURI,
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm text-gray-400 mb-1" style={{ fontFamily: 'var(--font-mono), monospace' }}>
          Codehash (bytes32)
        </label>
        <input
          type="text"
          value={codehash}
          onChange={(e) => setCodehash(e.target.value)}
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
          Config Hash (bytes32)
        </label>
        <input
          type="text"
          value={configHash}
          onChange={(e) => setConfigHash(e.target.value)}
          placeholder="0x..."
          className="input-dark font-mono"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1" style={{ fontFamily: 'var(--font-mono), monospace' }}>
          Metadata URI
        </label>
        <input
          type="text"
          value={metadataURI}
          onChange={(e) => setMetadataURI(e.target.value)}
          placeholder="ipfs://... or https://..."
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
