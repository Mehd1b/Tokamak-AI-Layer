import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        background: {
          primary: '#0a0a0f',
          secondary: '#111118',
          tertiary: '#1a1a24',
        },
        accent: {
          primary: '#A855F7',
          secondary: '#7C3AED',
        },
        primary: {
          DEFAULT: '#A855F7',
          light: '#C084FC',
          dark: '#7C3AED',
          glow: 'rgba(168, 85, 247, 0.3)',
        },
        fuchsia: {
          accent: '#D946EF',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'SF Mono', 'Consolas', 'Monaco', 'monospace'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        jetbrains: ['var(--font-mono)', 'monospace'],
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(90deg, #7C3AED, #A855F7, #D946EF)',
        'gradient-radial': 'radial-gradient(circle, rgba(168, 85, 247, 0.25) 0%, rgba(168, 85, 247, 0.08) 50%, transparent 70%)',
      },
      animation: {
        'aurora-shift': 'aurora-shift 20s ease-in-out infinite',
        'float-up': 'float-up 4s ease-out infinite',
        'morph-blob': 'morph-blob 12s ease-in-out infinite',
        'text-shimmer': 'text-shimmer 3s linear infinite',
        'slide-in-left': 'slide-in-left 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-in-right': 'slide-in-right 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
        'orbit': 'orbit 20s linear infinite',
        'ripple': 'ripple 2s ease-out infinite',
        'grid-flow': 'grid-flow 30s linear infinite',
      },
      keyframes: {
        'aurora-shift': {
          '0%': { backgroundPosition: '0% 50%' },
          '25%': { backgroundPosition: '50% 100%' },
          '50%': { backgroundPosition: '100% 50%' },
          '75%': { backgroundPosition: '50% 0%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        'float-up': {
          '0%': { transform: 'translateY(0)', opacity: '0.8' },
          '50%': { opacity: '1' },
          '100%': { transform: 'translateY(-30px)', opacity: '0' },
        },
        'morph-blob': {
          '0%, 100%': { borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%' },
          '25%': { borderRadius: '30% 60% 70% 40% / 50% 60% 30% 60%' },
          '50%': { borderRadius: '50% 60% 30% 60% / 30% 60% 70% 40%' },
          '75%': { borderRadius: '60% 30% 60% 40% / 70% 40% 50% 60%' },
        },
        'text-shimmer': {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        'slide-in-left': {
          '0%': { transform: 'translateX(-40px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(40px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 15px rgba(168, 85, 247, 0.2), 0 0 30px rgba(168, 85, 247, 0.1)' },
          '50%': { boxShadow: '0 0 25px rgba(168, 85, 247, 0.4), 0 0 50px rgba(168, 85, 247, 0.2)' },
        },
        'orbit': {
          '0%': { transform: 'rotate(0deg) translateX(60px) rotate(0deg)' },
          '100%': { transform: 'rotate(360deg) translateX(60px) rotate(-360deg)' },
        },
        'ripple': {
          '0%': { transform: 'scale(0.8)', opacity: '0.6', borderWidth: '2px' },
          '100%': { transform: 'scale(2.5)', opacity: '0', borderWidth: '0px' },
        },
        'grid-flow': {
          '0%': { backgroundPosition: '0px 0px' },
          '100%': { backgroundPosition: '100px 200px' },
        },
      },
      boxShadow: {
        'glow': '0 0 20px rgba(168, 85, 247, 0.3), 0 0 40px rgba(168, 85, 247, 0.1)',
        'glow-lg': '0 0 30px rgba(168, 85, 247, 0.5)',
        'card': '0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -1px rgba(0, 0, 0, 0.3)',
      },
    },
  },
  plugins: [],
};

export default config;
