/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Evergreen design system. Colors reference CSS variables defined under
      // `.theme-evergreen` in index.css, so these utilities only take effect
      // inside a themed subtree — the rest of the app keeps Tailwind's defaults.
      colors: {
        ever: {
          bg: 'var(--ever-bg)',
          side: 'var(--ever-side)',
          card: 'var(--ever-card)',
          line: 'var(--ever-line)',
          ink: 'var(--ever-ink)',
          dim: 'var(--ever-dim)',
          faint: 'var(--ever-faint)',
          lime: 'var(--ever-lime)',
          'lime-ink': 'var(--ever-lime-ink)',
          violet: 'var(--ever-violet)',
          pos: 'var(--ever-pos)',
          neg: 'var(--ever-neg)',
          track: 'var(--ever-track)',
          teal: 'var(--ever-teal)',
          orange: 'var(--ever-orange)',
        },
      },
      borderRadius: {
        ever: '18px',
        pill: '999px',
      },
      fontFamily: {
        grotesk: ['Archivo', '"Helvetica Neue"', 'Helvetica', 'system-ui', '-apple-system', 'Arial', 'sans-serif'],
        mono: ['"Space Mono"', 'ui-monospace', '"SF Mono"', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
