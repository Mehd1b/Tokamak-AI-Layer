'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';

interface AgentCustomUIProps {
  html: string;
  cdnLinks?: string[];
  agentId: string;
  agentName: string;
  walletAddress?: string;
  chainId?: number;
  minHeight?: number;
  onTaskSubmit: (input: string) => void;
  taskResult?: { output: string; status: string; taskId: string } | null;
  feePerTask?: bigint;
}

function buildSrcdoc({
  html,
  cdnLinks = [],
  agentId,
  agentName,
  walletAddress,
  chainId,
}: Pick<AgentCustomUIProps, 'html' | 'cdnLinks' | 'agentId' | 'agentName' | 'walletAddress' | 'chainId'>): string {
  const cdnTags = cdnLinks
    .map((link) => {
      const trimmed = link.trim();
      if (trimmed.endsWith('.css')) {
        return `<link rel="stylesheet" href="${trimmed}">`;
      }
      return `<script src="${trimmed}"><\/script>`;
    })
    .join('\n  ');

  // Escape values injected into the bridge script to prevent XSS
  const safeAgentId = agentId.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const safeAgentName = agentName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const safeWallet = (walletAddress || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const safeChainId = Number(chainId) || 1;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${cdnTags}
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; padding: 16px; background: transparent; color: #e4e4e7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; line-height: 1.5; }
    button { cursor: pointer; }
    input, textarea, select { color: #e4e4e7; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 8px 12px; font-size: 14px; width: 100%; }
    input:focus, textarea:focus { outline: none; border-color: #38BDF8; box-shadow: 0 0 0 1px rgba(56,189,248,0.5); }
    button.primary { background: #38BDF8; color: #000; border: none; border-radius: 8px; padding: 8px 16px; font-weight: 500; }
    button.primary:hover { background: #7dd3fc; }
    button.primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .loading { display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #38BDF8; border-radius: 50%; animation: spin 0.6s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <script>
    // TAL Embed Bridge v1
    window.TAL = {
      agentId: '${safeAgentId}',
      agentName: '${safeAgentName}',
      wallet: { address: '${safeWallet}', chainId: ${safeChainId} },
      _resultCallbacks: [],
      _errorCallbacks: [],
      submitTask: function(input) {
        window.parent.postMessage({ type: 'tal:submit', input: typeof input === 'string' ? input : JSON.stringify(input) }, '*');
      },
      requestDownload: function(data) {
        window.parent.postMessage({ type: 'tal:download', data: data }, '*');
      },
      onResult: function(cb) { this._resultCallbacks.push(cb); },
      onError: function(cb) { this._errorCallbacks.push(cb); },
      resize: function(height) {
        window.parent.postMessage({ type: 'tal:resize', height: height }, '*');
      }
    };
    window.addEventListener('message', function(e) {
      if (e.data && e.data.type === 'tal:result') {
        TAL._resultCallbacks.forEach(function(cb) { cb(e.data.result); });
      }
      if (e.data && e.data.type === 'tal:error') {
        TAL._errorCallbacks.forEach(function(cb) { cb(e.data.error); });
      }
    });
    // Auto-resize observer
    var _resizeObserver = new ResizeObserver(function() {
      var h = document.body.scrollHeight;
      window.parent.postMessage({ type: 'tal:resize', height: h }, '*');
    });
    _resizeObserver.observe(document.body);
  <\/script>
  ${html}
</body>
</html>`;
}

export function AgentCustomUI({
  html,
  cdnLinks,
  agentId,
  agentName,
  walletAddress,
  chainId,
  minHeight = 400,
  onTaskSubmit,
  taskResult,
}: AgentCustomUIProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(minHeight);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const srcdoc = buildSrcdoc({ html, cdnLinks, agentId, agentName, walletAddress, chainId });

  // Listen for postMessage events from the iframe
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      // Only handle messages from our iframe
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) {
        return;
      }

      const data = event.data;
      if (!data || typeof data !== 'object' || typeof data.type !== 'string') {
        return;
      }

      switch (data.type) {
        case 'tal:submit': {
          if (typeof data.input === 'string' && data.input.trim()) {
            onTaskSubmit(data.input);
          }
          break;
        }
        case 'tal:resize': {
          const height = Number(data.height);
          if (height > 0) {
            setIframeHeight(Math.max(height, minHeight));
          }
          break;
        }
        case 'tal:download': {
          try {
            const content = typeof data.data === 'string' ? data.data : JSON.stringify(data.data, null, 2);
            const blob = new Blob([content], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${agentName.replace(/\s+/g, '-').toLowerCase()}-output.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          } catch {
            // Download failed silently
          }
          break;
        }
      }
    },
    [onTaskSubmit, minHeight, agentName],
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Post results into the iframe when taskResult changes
  useEffect(() => {
    if (taskResult && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { type: 'tal:result', result: taskResult },
        '*',
      );
    }
  }, [taskResult]);

  const handleLoad = () => {
    setIsLoading(false);
  };

  const handleError = () => {
    setIsLoading(false);
    setError('The custom interface could not be rendered.');
  };

  return (
    <div className="relative">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/5 rounded-lg z-10">
          <div className="flex items-center gap-2 text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading custom interface...</span>
          </div>
        </div>
      )}
      {error ? (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          Custom interface failed to load. {error}
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          srcDoc={srcdoc}
          sandbox="allow-scripts allow-forms"
          style={{
            width: '100%',
            height: `${iframeHeight}px`,
            border: 'none',
            borderRadius: '8px',
            background: 'rgba(255,255,255,0.02)',
          }}
          title={`${agentName} Custom Interface`}
          referrerPolicy="no-referrer"
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
    </div>
  );
}
