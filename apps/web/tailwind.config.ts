import type { Config } from 'tailwindcss';

/**
 * Palette from the art direction (SPEC 5.1): wood, cream, beige, olive, warm
 * grey, with coffee as the single accent. No neon, no game-fantasy chrome.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        espresso: '#2b211c',
        roast: '#3d2f26',
        wood: '#8c6b4f',
        walnut: '#6b5340',
        caramel: '#c58b5a',
        cream: '#f5ece0',
        linen: '#e8dcca',
        beige: '#d8c7ad',
        olive: '#6b7355',
        sage: '#9aa57c',
        warmgrey: '#8a8178',
        charcoal: '#1d1815',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Inter', 'sans-serif'],
      },
      boxShadow: {
        panel: '0 12px 40px -18px rgba(28, 20, 16, 0.75)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 220ms ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
