import React from 'react';

export default function ProofGenerationPipeline() {
  return (
    <div className="bg-gray-900/60 rounded-2xl p-4 md:p-6 border border-gray-700/50 font-sans">
      {/* Title */}
      <div className="text-center mb-6">
        <h5 className="text-lg md:text-xl font-semibold text-white mb-2">
          Proof Generation Pipeline
        </h5>
        <p className="text-gray-400 text-xs md:text-sm">
          From private model weights to succinct on-chain verifiable proof
        </p>
      </div>

      {/* Main Diagram - Private Zone */}
      <div className="bg-slate-800/30 rounded-xl border-2 border-dashed border-purple-500/30 p-3 md:p-4 relative">
        {/* Zone Label */}
        <div className="absolute -top-3 left-4 px-2 md:px-3 py-1 bg-gray-900 rounded-full">
          <span className="text-purple-400 text-xs font-semibold flex items-center gap-1 md:gap-2">
            <svg className="w-3 h-3 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="hidden sm:inline">PRIVATE ZONE — Executor / Prover</span>
            <span className="sm:hidden">PRIVATE ZONE</span>
          </span>
        </div>

        <div className="mt-4 space-y-3">

          {/* Step 1: Model Weights */}
          <div className="bg-gradient-to-r from-red-900/40 to-red-800/20 rounded-lg p-3 border border-red-700/50">
            <div className="flex items-start gap-2 md:gap-3">
              <div className="flex-shrink-0">
                <div className="w-7 h-7 md:w-8 md:h-8 bg-red-600 rounded-lg flex items-center justify-center text-white font-bold text-xs md:text-sm">
                  1
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h6 className="text-white font-semibold text-sm mb-1">Private Model Weights</h6>
                <p className="text-red-300 text-xs mb-2">Loaded into prover memory — never transmitted</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-1 text-xs">
                  <div className="bg-slate-900/50 rounded p-1.5 text-center">
                    <div className="text-slate-500 text-xs">Layer 0</div>
                    <div className="text-red-300 font-mono text-xs">W₀</div>
                  </div>
                  <div className="bg-slate-900/50 rounded p-1.5 text-center">
                    <div className="text-slate-500 text-xs">Layer 1</div>
                    <div className="text-red-300 font-mono text-xs">W₁</div>
                  </div>
                  <div className="bg-slate-900/50 rounded p-1.5 text-center">
                    <div className="text-slate-500 text-xs">Layer 2</div>
                    <div className="text-red-300 font-mono text-xs">W₂</div>
                  </div>
                  <div className="bg-slate-900/50 rounded p-1.5 text-center">
                    <div className="text-slate-500 text-xs">Output</div>
                    <div className="text-red-300 font-mono text-xs">Wₒ</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
              <path d="M10 0 L10 10" stroke="#EF4444" strokeWidth="2"/>
              <path d="M6 8 L10 14 L14 8" fill="#EF4444"/>
            </svg>
          </div>

          {/* Step 2: zkVM Execution */}
          <div className="bg-gradient-to-r from-purple-900/40 to-purple-800/20 rounded-lg p-3 border border-purple-700/50">
            <div className="flex items-start gap-2 md:gap-3">
              <div className="flex-shrink-0">
                <div className="w-7 h-7 md:w-8 md:h-8 bg-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-xs md:text-sm">
                  2
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h6 className="text-white font-semibold text-sm mb-1">RISC Zero zkVM Execution</h6>
                <p className="text-purple-300 text-xs mb-2">Deterministic RISC-V emulation with execution trace</p>

                <div className="bg-slate-900/50 rounded-lg p-2 text-xs space-y-1.5 overflow-x-auto">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-slate-500 flex-shrink-0">1.</span>
                    <code className="text-purple-300">env::read()</code>
                    <span className="text-slate-500 hidden sm:inline">→ Load input</span>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-slate-500 flex-shrink-0">2.</span>
                    <code className="text-purple-300">inference(x, W)</code>
                    <span className="text-slate-500 hidden sm:inline">→ Forward pass</span>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-slate-500 flex-shrink-0">3.</span>
                    <code className="text-purple-300">validate()</code>
                    <span className="text-slate-500 hidden sm:inline">→ Check bounds</span>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-slate-500 flex-shrink-0">4.</span>
                    <code className="text-purple-300">commit(action)</code>
                    <span className="text-slate-500 hidden sm:inline">→ Journal</span>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  <div className="bg-purple-800/50 px-2 py-0.5 rounded text-purple-200">
                    ~10M cycles
                  </div>
                  <div className="bg-purple-800/50 px-2 py-0.5 rounded text-purple-200">
                    RV32IM
                  </div>
                  <div className="bg-purple-800/50 px-2 py-0.5 rounded text-purple-200">
                    BabyBear
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
              <path d="M10 0 L10 10" stroke="#A855F7" strokeWidth="2"/>
              <path d="M6 8 L10 14 L14 8" fill="#A855F7"/>
            </svg>
          </div>

          {/* Step 3: STARK Proving */}
          <div className="bg-gradient-to-r from-violet-900/40 to-violet-800/20 rounded-lg p-3 border border-violet-700/50">
            <div className="flex items-start gap-2 md:gap-3">
              <div className="flex-shrink-0">
                <div className="w-7 h-7 md:w-8 md:h-8 bg-violet-600 rounded-lg flex items-center justify-center text-white font-bold text-xs md:text-sm">
                  3
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h6 className="text-white font-semibold text-sm mb-1">STARK Proof Generation</h6>
                <p className="text-violet-300 text-xs mb-2">FRI-based polynomial commitment over execution trace</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="bg-slate-900/50 rounded-lg p-2">
                    <div className="text-violet-200 text-xs font-semibold mb-1">Continuation</div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="w-8 md:w-12 h-2 bg-violet-700 rounded-sm"></div>
                        <span className="text-xs text-slate-400">Seg₀</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-8 md:w-12 h-2 bg-violet-600 rounded-sm"></div>
                        <span className="text-xs text-slate-400">Seg₁ ...</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-900/50 rounded-lg p-2">
                    <div className="text-violet-200 text-xs font-semibold mb-1">FRI Params</div>
                    <div className="space-y-0.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Field:</span>
                        <span className="text-violet-300 font-mono">BabyBear</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Hash:</span>
                        <span className="text-violet-300 font-mono">Poseidon2</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  <div className="bg-violet-800/50 px-2 py-0.5 rounded text-violet-200">
                    GPU Accel
                  </div>
                  <div className="bg-violet-800/50 px-2 py-0.5 rounded text-violet-200">
                    ~100-bit security
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Arrow - STARK to SNARK transition */}
          <div className="flex justify-center items-center gap-2 py-1">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-500 to-transparent"></div>
            <div className="bg-amber-600 text-white text-xs px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">
              STARK → SNARK
            </div>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-500 to-transparent"></div>
          </div>

          {/* Step 4: Groth16 Compression */}
          <div className="bg-gradient-to-r from-amber-900/40 to-orange-800/20 rounded-lg p-3 border border-amber-700/50">
            <div className="flex items-start gap-2 md:gap-3">
              <div className="flex-shrink-0">
                <div className="w-7 h-7 md:w-8 md:h-8 bg-amber-600 rounded-lg flex items-center justify-center text-white font-bold text-xs md:text-sm">
                  4
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h6 className="text-white font-semibold text-sm mb-1">Groth16 SNARK Compression</h6>
                <p className="text-amber-300 text-xs mb-2">Verify STARK inside Groth16 → constant-size proof</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="bg-slate-900/50 rounded-lg p-2">
                    <div className="text-amber-200 text-xs font-semibold mb-1">Size Comparison</div>
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-1">
                        <span className="text-red-400">✗</span>
                        <span className="text-slate-300">STARK:</span>
                        <span className="text-red-300 font-mono">~500 KB</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-emerald-400">✓</span>
                        <span className="text-slate-300">Groth16:</span>
                        <span className="text-emerald-300 font-mono">~200 B</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-900/50 rounded-lg p-2">
                    <div className="text-amber-200 text-xs font-semibold mb-1">Process</div>
                    <div className="space-y-0.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Curve:</span>
                        <span className="text-amber-300 font-mono">BN254</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Verify:</span>
                        <span className="text-amber-300 font-mono">~250k gas</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  <div className="bg-amber-800/50 px-2 py-0.5 rounded text-amber-200">
                    sub-10s (MVP)
                  </div>
                  <div className="bg-amber-800/50 px-2 py-0.5 rounded text-amber-200">
                    EVM native
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Final Output */}
          <div className="bg-gradient-to-r from-emerald-900/40 to-emerald-800/20 rounded-lg p-3 border border-emerald-700/50">
            <div className="flex items-start gap-2 md:gap-3">
              <div className="flex-shrink-0">
                <div className="w-7 h-7 md:w-8 md:h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 md:w-5 md:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h6 className="text-white font-semibold text-sm mb-1">Final Output: Receipt</h6>
                <p className="text-emerald-300 text-xs mb-2">Ready for on-chain verification</p>

                <div className="grid grid-cols-3 gap-1.5 md:gap-2">
                  <div className="bg-slate-900/50 rounded-lg p-1.5 md:p-2 text-center">
                    <div className="text-emerald-300 font-mono text-sm mb-0.5">π</div>
                    <div className="text-xs text-slate-400 hidden sm:block">Groth16</div>
                    <div className="text-xs text-emerald-400 font-mono">~200B</div>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-1.5 md:p-2 text-center">
                    <div className="text-amber-300 font-mono text-sm mb-0.5">ID</div>
                    <div className="text-xs text-slate-400 hidden sm:block">Image ID</div>
                    <div className="text-xs text-amber-400 font-mono">32B</div>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-1.5 md:p-2 text-center">
                    <div className="text-purple-300 font-mono text-sm mb-0.5">J</div>
                    <div className="text-xs text-slate-400 hidden sm:block">Journal</div>
                    <div className="text-xs text-purple-400 font-mono">var</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Size Comparison */}
      <div className="mt-4 bg-slate-800/50 rounded-lg p-3 border border-slate-700">
        <div className="text-xs md:text-sm text-slate-400 font-semibold mb-2 text-center">
          Proof Size Reduction
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-xs">
          <div className="text-center">
            <div className="text-xs text-slate-500 mb-1">Trace</div>
            <div className="bg-red-600/30 rounded px-2 py-1">
              <span className="text-red-300 font-mono">~10 GB</span>
            </div>
          </div>
          <span className="text-slate-500 hidden sm:block">→</span>
          <span className="text-slate-500 sm:hidden">↓</span>
          <div className="text-center">
            <div className="text-xs text-slate-500 mb-1">STARK</div>
            <div className="bg-violet-600/30 rounded px-2 py-1">
              <span className="text-violet-300 font-mono">~500 KB</span>
            </div>
          </div>
          <span className="text-amber-500 hidden sm:block">→</span>
          <span className="text-amber-500 sm:hidden">↓</span>
          <div className="text-center">
            <div className="text-xs text-emerald-400 mb-1">Groth16</div>
            <div className="bg-emerald-600/30 rounded px-2 py-1">
              <span className="text-emerald-300 font-mono font-bold">~200 B</span>
            </div>
          </div>
        </div>
        <div className="text-center mt-2 text-xs text-slate-500">
          50M× compression
        </div>
      </div>
    </div>
  );
}
