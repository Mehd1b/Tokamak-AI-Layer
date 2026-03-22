'use client';

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'tokamak_onboarded';

export function VaultExplainer() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem(STORAGE_KEY)) {
      setShow(true);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="card max-w-lg mx-4 p-8 space-y-6">
        <h2 className="text-2xl font-serif font-bold text-white">Welcome to Tokamak Vaults</h2>
        <div className="space-y-4 text-sm text-white/70">
          <div>
            <h3 className="font-semibold text-white/90 mb-1">What are Vaults?</h3>
            <p>Vaults are smart contracts that hold your funds and execute strategies automatically using verifiable AI agents.</p>
          </div>
          <div>
            <h3 className="font-semibold text-white/90 mb-1">What are Agents?</h3>
            <p>Agents are programs that run inside a secure environment (zkVM). Their execution is mathematically proven — no one can tamper with the results.</p>
          </div>
          <div>
            <h3 className="font-semibold text-white/90 mb-1">How do Shares work?</h3>
            <p>When you deposit, you receive shares representing your proportional ownership. As the agent generates returns, your shares become worth more.</p>
          </div>
          <div>
            <h3 className="font-semibold text-white/90 mb-1">Can I withdraw anytime?</h3>
            <p>Yes — you can withdraw your shares at any time, unless the vault has an active strategy in progress (typically resolves within minutes).</p>
          </div>
        </div>
        <button onClick={dismiss} className="btn-primary w-full py-3 text-base">
          Got it — show me the vaults
        </button>
      </div>
    </div>
  );
}
