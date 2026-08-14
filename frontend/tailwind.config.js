/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Every colour resolves to a CSS variable, so light / dark / high-contrast
        // is one class on <html> rather than three sets of utilities.
        canvas: 'var(--canvas)',
        paper: 'var(--paper)',
        mist: 'var(--mist)',
        ink: 'var(--ink)',
        slate: 'var(--slate)',
        line: 'var(--line)',
        cobalt: 'var(--cobalt)',
        azure: 'var(--azure)',
        received: 'var(--received)',
        pulling: 'var(--pulling)',
        packing: 'var(--packing)',
        shipped: 'var(--shipped)',
        alert: 'var(--alert)',
        reno: 'var(--reno)',
        columbus: 'var(--columbus)',
      },
      fontFamily: {
        display: ['Outfit', 'Poppins', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        sans: ['"Plus Jakarta Sans"', 'Poppins', 'Outfit', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      boxShadow: {
        hair: '0 0 0 1px var(--line)',
        soft: '0 1px 2px rgba(10, 23, 48, 0.04), 0 8px 24px -16px rgba(10, 23, 48, 0.28)',
        lift: '0 2px 4px rgba(10, 23, 48, 0.05), 0 18px 40px -22px rgba(10, 23, 48, 0.40)',
        glow: '0 12px 32px -16px var(--cobalt-glow)',
      },
      transitionTimingFunction: {
        // One curve for the whole product: fast out, long settle.
        ease: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        rise: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        fade: { from: { opacity: '0' }, to: { opacity: '1' } },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        sheet: {
          from: { opacity: '0', transform: 'translateY(24px) scale(0.985)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        halo: {
          '0%': { transform: 'scale(0.9)', opacity: '0.45' },
          '100%': { transform: 'scale(1.55)', opacity: '0' },
        },
        shimmer: { from: { backgroundPosition: '200% 0' }, to: { backgroundPosition: '-200% 0' } },
        // A light travels the pipeline whenever fresh numbers land.
        travel: {
          '0%': { transform: 'translateX(-30%)', opacity: '0' },
          '15%': { opacity: '1' },
          '85%': { opacity: '1' },
          '100%': { transform: 'translateX(430%)', opacity: '0' },
        },
      },
      animation: {
        rise: 'rise 480ms cubic-bezier(0.22, 1, 0.36, 1) both',
        fade: 'fade 320ms ease-out both',
        'scale-in': 'scaleIn 240ms cubic-bezier(0.22, 1, 0.36, 1) both',
        sheet: 'sheet 320ms cubic-bezier(0.22, 1, 0.36, 1) both',
        halo: 'halo 1.8s cubic-bezier(0.22, 1, 0.36, 1) infinite',
        shimmer: 'shimmer 1.6s linear infinite',
        travel: 'travel 1.5s cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
}
