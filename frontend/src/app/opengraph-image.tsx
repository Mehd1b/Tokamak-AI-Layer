import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'Tokagent — Verifiable Agent Execution on Ethereum';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #0b0d10 0%, #15191e 50%, #0b0d10 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        {/* Grid overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(to right, rgba(196, 245, 71, 0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(196, 245, 71, 0.05) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />

        {/* Glow effect */}
        <div
          style={{
            position: 'absolute',
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(196, 245, 71, 0.15) 0%, transparent 70%)',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />

        {/* Logo / icon */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 80,
            height: 80,
            borderRadius: 20,
            border: '2px solid rgba(196, 245, 71, 0.4)',
            background: 'rgba(196, 245, 71, 0.1)',
            marginBottom: 32,
            fontSize: 40,
          }}
        >
          ⬡
        </div>

        <div
          style={{
            fontSize: 56,
            fontWeight: 700,
            color: '#ffffff',
            letterSpacing: '-1px',
            textAlign: 'center',
            lineHeight: 1.1,
          }}
        >
          Tokagent
        </div>

        <div
          style={{
            fontSize: 24,
            color: 'rgba(196, 245, 71, 0.9)',
            marginTop: 16,
            fontWeight: 500,
            letterSpacing: '2px',
            textTransform: 'uppercase' as const,
          }}
        >
          Verifiable Agent Execution
        </div>

        <div
          style={{
            fontSize: 20,
            color: 'rgba(255, 255, 255, 0.6)',
            marginTop: 24,
            maxWidth: 600,
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          Verifiable ML agent execution with RISC Zero zkVM on Ethereum
        </div>

        {/* Bottom border accent */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 4,
            background: 'linear-gradient(to right, #c4f547, #c4f547, #c4f547)',
          }}
        />
      </div>
    ),
    { ...size },
  );
}
