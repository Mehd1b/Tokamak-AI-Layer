import React from 'react';

export default function OperatingEnvelopeDiagram() {
  return (
    <div className="bg-gray-900/60 rounded-2xl p-6 border border-gray-700/50 font-sans">
      <div className="max-w-4xl mx-auto">
        {/* Title */}
        <div className="mb-6">
          <h5 className="text-xl font-semibold text-white mb-2">
            Execution Kernel Operating Envelope (MVP)
          </h5>
          <p className="text-gray-400 text-sm">
            Verifiable ML agents optimized for safety bounds, auditability, and policy-based execution
          </p>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Model Size */}
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
            <h6 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
              Model Size
            </h6>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Typical:</span>
                <span className="text-purple-300 font-mono">1–10M params</span>
              </div>
              <div className="text-slate-400">
                Examples: risk scorers, MLP policies
              </div>
              <div className="text-slate-500 text-xs mt-2 pt-2 border-t border-slate-700">
                Not intended: GPT-scale inference
              </div>
            </div>
          </div>

          {/* Card 2: Cycles & Latency */}
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
            <h6 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Cycles & Latency
            </h6>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Target:</span>
                <span className="text-violet-300 font-mono">10–20M cycles / run</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Target:</span>
                <span className="text-violet-300 font-mono">sub-10s end-to-end (MVP)</span>
              </div>
              <div className="text-slate-500 text-xs mt-2 pt-2 border-t border-slate-700">
                Use freshness bounds for state-sensitive actions
              </div>
            </div>
          </div>

          {/* Card 3: Best-Fit Use Cases */}
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
            <h6 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Best-Fit Use Cases
            </h6>
            <div className="space-y-2 text-sm text-slate-300">
              <div className="flex items-center gap-2">
                <span className="text-emerald-400">•</span>
                Risk management & guardrails
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-400">•</span>
                Rebalancing & automation
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-400">•</span>
                Governance-triggered execution
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
