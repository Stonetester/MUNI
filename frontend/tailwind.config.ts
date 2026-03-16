import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
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
      }
    }
  },
  plugins: []
}

export default config
