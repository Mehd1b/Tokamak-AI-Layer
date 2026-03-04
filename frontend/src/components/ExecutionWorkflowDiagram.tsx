import React from 'react';

export default function ExecutionWorkflowDiagram() {
  return (
    <div className="bg-gray-900/60 rounded-2xl p-6 border border-gray-700/50 font-sans">
      {/* Title */}
      <div className="text-center mb-6">
        <h4 className="text-xl font-semibold text-white mb-2">
          Execution, Proof, and Settlement Workflow
        </h4>
        <p className="text-sm text-slate-400">End-to-end flow from user request to on-chain settlement</p>
      </div>

      {/* Main Workflow - Vertical Layout */}
      <div className="space-y-4">

        {/* Row 1: Off-Chain Execution */}
        <div className="bg-purple-900/20 rounded-xl p-4 border border-purple-700/50">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-3 py-1 bg-purple-900/50 text-purple-300 text-xs font-semibold rounded-full border border-purple-700">
              OFF-CHAIN EXECUTION
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Stage 1 */}
            <div className="bg-purple-900/40 rounded-lg p-4 border border-purple-600/50">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 bg-purple-500 text-white rounded-full flex items-center justify-center font-bold text-sm">
                  1
                </div>
                <h3 className="text-white font-semibold text-sm">User Request</h3>
              </div>
              <div className="text-slate-300 text-xs space-y-1">
                <div className="flex items-start gap-2">
                  <span className="text-purple-400">•</span>
                  <span>Agent ID (Image Hash)</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-purple-400">•</span>
                  <span>Input Data (plaintext MVP; encrypted future)</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-purple-400">•</span>
                  <span>Signed Authorization</span>
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-500">User Client → API</div>
            </div>

            {/* Stage 2 */}
            <div className="bg-violet-900/40 rounded-lg p-4 border border-violet-600/50">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 bg-violet-500 text-white rounded-full flex items-center justify-center font-bold text-sm">
                  2
                </div>
                <h3 className="text-white font-semibold text-sm">zkVM Execution</h3>
              </div>
              <div className="text-slate-300 text-xs space-y-1">
                <div className="flex items-start gap-2">
                  <span className="text-violet-400">•</span>
                  <span>Load Agent ELF Binary in RISC Zero R0VM</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-violet-400">•</span>
                  <span>Deterministic profile (no time/network/host nondeterminism)</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-violet-400">•</span>
                  <span>Canonical math primitives, constraint validation</span>
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-500">Executor Node</div>
            </div>
          </div>

          {/* Arrow down */}
          <div className="flex justify-center my-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 4 L12 18" stroke="#A855F7" strokeWidth="2" strokeLinecap="round"/>
              <path d="M6 14 L12 20 L18 14" stroke="#A855F7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>

        {/* Row 2: Proof Generation */}
        <div className="bg-violet-900/20 rounded-xl p-4 border border-violet-700/50">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-3 py-1 bg-violet-900/50 text-violet-300 text-xs font-semibold rounded-full border border-violet-700">
              PROOF GENERATION
            </span>
          </div>

          {/* Stage 3 */}
          <div className="bg-violet-900/40 rounded-lg p-4 border border-violet-600/50">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 bg-violet-500 text-white rounded-full flex items-center justify-center font-bold text-sm">
                3
              </div>
              <h3 className="text-white font-semibold text-sm">STARK → SNARK Proving</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="text-slate-300 text-xs space-y-1">
                <div className="text-violet-300 font-medium mb-1">STARK Proving:</div>
                <div className="flex items-start gap-2">
                  <span className="text-violet-400">•</span>
                  <span>Execution trace generation</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-violet-400">•</span>
                  <span>Segment proofs + recursive aggregation</span>
                </div>
              </div>
              <div className="text-slate-300 text-xs space-y-1">
                <div className="text-violet-300 font-medium mb-1">SNARK Compression:</div>
                <div className="flex items-start gap-2">
                  <span className="text-violet-400">•</span>
                  <span>STARK → Groth16 wrap</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-violet-400">•</span>
                  <span>Output: ~200 bytes proof</span>
                </div>
              </div>
            </div>
            <div className="mt-2 text-xs text-slate-500">Bonsai / GPU Prover</div>
          </div>

          {/* Arrow down */}
          <div className="flex justify-center my-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <defs>
                <linearGradient id="arrowGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#A855F7" />
                  <stop offset="100%" stopColor="#10B981" />
                </linearGradient>
              </defs>
              <path d="M12 4 L12 18" stroke="url(#arrowGrad)" strokeWidth="2" strokeLinecap="round"/>
              <path d="M6 14 L12 20 L18 14" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>

        {/* Row 3: On-Chain Settlement */}
        <div className="bg-emerald-900/20 rounded-xl p-4 border border-emerald-700/50">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-3 py-1 bg-emerald-900/50 text-emerald-300 text-xs font-semibold rounded-full border border-emerald-700">
              ON-CHAIN SETTLEMENT
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Stage 4 */}
            <div className="bg-teal-900/40 rounded-lg p-4 border border-teal-600/50">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 bg-teal-500 text-white rounded-full flex items-center justify-center font-bold text-sm">
                  4
                </div>
                <h3 className="text-white font-semibold text-sm">Proof Verification</h3>
              </div>
              <div className="text-slate-300 text-xs space-y-1">
                <div className="flex items-start gap-2">
                  <span className="text-teal-400">•</span>
                  <span><code className="text-teal-300">verify(seal, imageId, journal)</code></span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-teal-400">•</span>
                  <span>BN254 pairing check (~250k gas)</span>
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-500">Verifier Contract</div>
            </div>

            {/* Stage 5 */}
            <div className="bg-emerald-900/40 rounded-lg p-4 border border-emerald-600/50">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 bg-emerald-500 text-white rounded-full flex items-center justify-center font-bold text-sm">
                  5
                </div>
                <h3 className="text-white font-semibold text-sm">Settlement</h3>
              </div>
              <div className="text-slate-300 text-xs space-y-1">
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400">•</span>
                  <span>Execute proven action, update vault state</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400">•</span>
                  <span>Fee distribution (executor, developer, protocol)</span>
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-500">Ethereum / L2</div>
            </div>
          </div>
        </div>
      </div>

      {/* Journal Section */}
      <div className="mt-6 bg-slate-800/50 rounded-xl p-4 border border-amber-700/30">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-amber-300 font-semibold text-sm">Journal (Proven Public Output)</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="bg-slate-700/50 rounded p-2 border border-slate-600">
            <div className="text-slate-400 font-medium mb-1">Input Commitment</div>
            <div className="text-amber-300 font-mono text-xs">keccak256(input)</div>
          </div>
          <div className="bg-slate-700/50 rounded p-2 border border-slate-600">
            <div className="text-slate-400 font-medium mb-1">Agent ID</div>
            <div className="text-amber-300 font-mono text-xs">imageId (32B)</div>
          </div>
          <div className="bg-slate-700/50 rounded p-2 border border-slate-600">
            <div className="text-slate-400 font-medium mb-1">Output Action</div>
            <div className="text-amber-300 font-mono text-xs">AgentAction</div>
          </div>
          <div className="bg-slate-700/50 rounded p-2 border border-slate-600">
            <div className="text-slate-400 font-medium mb-1">Constraints</div>
            <div className="text-amber-300 font-mono text-xs">hash(constraints)</div>
          </div>
        </div>
      </div>

      {/* Bottom Stats & Legend */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
          <div className="text-xs text-slate-400 font-semibold mb-2">PERFORMANCE</div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Proof Size:</span>
              <span className="text-slate-300">~200 bytes</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Verify Gas:</span>
              <span className="text-slate-300">~250k gas</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Prove Time:</span>
              <span className="text-slate-300">sub-10s (MVP)</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
          <div className="text-xs text-slate-400 font-semibold mb-2">TRUST ASSUMPTIONS</div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Crypto:</span>
              <span className="text-slate-300">BN254 DLog</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Setup:</span>
              <span className="text-slate-300">Groth16 CRS</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Execution:</span>
              <span className="text-emerald-400">Trustless</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
          <div className="text-xs text-slate-400 font-semibold mb-2">BEST-FIT USE CASES</div>
          <div className="space-y-1 text-xs text-slate-300">
            <div className="flex items-center gap-1">
              <span className="text-emerald-400">✓</span>
              <span>Risk management & guardrails</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-emerald-400">✓</span>
              <span>Rebalancing & automation</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-emerald-400">✓</span>
              <span>Governance-triggered execution</span>
            </div>
          </div>
        </div>
      </div>

      {/* Separation of Concerns */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-purple-900/20 rounded-lg p-3 border border-purple-800/50">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
            <span className="text-purple-300 font-semibold text-xs">Execution</span>
          </div>
          <p className="text-xs text-slate-400">
            Deterministic zkVM computation. Agent code + model weights committed via Image ID.
          </p>
        </div>

        <div className="bg-violet-900/20 rounded-lg p-3 border border-violet-800/50">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span className="text-violet-300 font-semibold text-xs">Verification</span>
          </div>
          <p className="text-xs text-slate-400">
            On-chain Groth16 verification via precompiled pairing checks.
          </p>
        </div>

        <div className="bg-emerald-900/20 rounded-lg p-3 border border-emerald-800/50">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className="text-emerald-300 font-semibold text-xs">Settlement</span>
          </div>
          <p className="text-xs text-slate-400">
            Atomic state updates after successful verification. Trustless action execution.
          </p>
        </div>
      </div>
    </div>
  );
}
