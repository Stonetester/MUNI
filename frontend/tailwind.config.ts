import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-dm-sans)', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['var(--font-dm-serif)', 'Georgia', 'serif'],
        mono: ['var(--font-jetbrains)', 'ui-monospace', 'monospace'],
      },
      colors: {
        background: '#0f1117',
        surface: '#1a1f2e',
        'surface-2': '#242938',
        border: '#2d3748',
        primary: '#10B981',
        'primary-hover': '#059669',
        secondary: '#14b8a6',
        muted: '#6b7280',
        'text-primary': '#f1f5f9',
        'text-secondary': '#94a3b8',
        danger: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6',
      },
      borderRadius: {
        'ios': '13px',
        'ios-lg': '20px',
        'ios-xl': '28px',
      },
      backdropBlur: {
        'ios': '20px',
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
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
        'fade-in': 'fade-in 0.2s ease',
        'scale-in': 'scale-in 0.2s ease',
      },
    },
  },
  plugins: [],
}

export default config
