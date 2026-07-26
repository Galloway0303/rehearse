/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './overlay.html', './region.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#07080c',
          900: '#0c0e14',
          800: '#12151e',
          700: '#1a1f2e',
          600: '#252b3d',
          500: '#3a4258',
        },
        amber: {
          glow: '#f5b942',
          soft: '#f0c14b',
          dim: '#c4922a',
        },
        mist: {
          100: '#f4f1ea',
          200: '#e8e2d6',
          300: '#c9c2b3',
          400: '#9a9284',
        },
      },
      fontFamily: {
        display: ['"Segoe UI Variable"', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['"Cascadia Code"', 'Consolas', 'monospace'],
      },
      boxShadow: {
        panel: '0 0 0 1px rgba(245,185,66,0.08), 0 20px 50px rgba(0,0,0,0.45)',
        glow: '0 0 24px rgba(245,185,66,0.25)',
      },
      animation: {
        'fade-in': 'fadeIn 0.25s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        ripple: 'ripple 0.5s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        ripple: {
          '0%': { transform: 'scale(0.8)', opacity: '0.8' },
          '100%': { transform: 'scale(1.4)', opacity: '0' },
        },
      },
    },
  },
  plugins: [],
}
