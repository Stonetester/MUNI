import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // DM Sans — clean body text
        sans: ['var(--font-dm-sans)', 'system-ui', '-apple-system', 'sans-serif'],
        // DM Serif Display — hero numbers and KPIs
        display: ['var(--font-dm-serif)', 'Georgia', 'serif'],
        // JetBrains Mono — all financial amounts and tickers
        mono: ['var(--font-jetbrains)', 'ui-monospace', 'Menlo', 'monospace'],
      },
      colors: {
        // Skill-specified dark palette: richer, deeper
        background: '#0A0D14',
        surface: '#141824',
        'surface-2': '#1C2236',
        border: '#2a3347',
        // Jade green — from SKILL_1 (more vibrant than generic emerald)
        primary: '#14D49E',
        'primary-hover': '#0FB88A',
        secondary: '#14b8a6',
        muted: '#606880',
        'text-primary': '#F0F3FB',
        'text-secondary': '#B8C3DC',
        danger: '#F87171',
        warning: '#FFAC40',
        info: '#60a5fa',
        // Extended jade palette for opacity utilities
        jade: '#14D49E',
      },
      borderRadius: {
        'ios': '12px',
        'ios-lg': '18px',
        'ios-xl': '24px',
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.4)',
        'card-lg': '0 4px 20px rgba(0,0,0,0.5)',
        'icon': '0 2px 6px rgba(0,0,0,0.35)',
      },
      keyframes: {
        'slide-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95) translateY(-4px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.32s cubic-bezier(0.32, 0.72, 0, 1) forwards',
        'fade-in': 'fade-in 0.2s ease forwards',
        'scale-in': 'scale-in 0.18s ease forwards',
      },
    },
  },
  plugins: [],
}

export default config
