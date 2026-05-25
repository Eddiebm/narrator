import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0c0c0f',
          card: '#131318',
          border: '#25252f',
          hover: '#1a1a22',
        },
        accent: {
          DEFAULT: '#7c3aed',
          light: '#a78bfa',
          dim: '#2d1b69',
        },
        ink: {
          DEFAULT: '#e4e4f0',
          muted: '#71717a',
          dim: '#3f3f4a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [
    function ({ addUtilities }: { addUtilities: (u: Record<string, Record<string, string>>) => void }) {
      addUtilities({ '.scrollbar-none': { '-ms-overflow-style': 'none', 'scrollbar-width': 'none' }, '.scrollbar-none::-webkit-scrollbar': { display: 'none' } });
    },
  ],
};

export default config;
