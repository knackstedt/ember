/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/renderer/src/**/*.{js,ts,jsx,tsx}",
    "./src/renderer/index.html",
  ],
  theme: {
    extend: {
      colors: {
        accent: "var(--color-accent)",
        "accent-dim": "var(--color-accent-dim)",
        surface: "var(--color-surface)",
        "surface-raised": "var(--color-surface-raised)",
        "surface-overlay": "var(--color-surface-overlay)",
        text: "var(--color-text)",
        "text-dim": "var(--color-text-dim)",
        border: "var(--color-border)",
      },
      fontFamily: {
        sans: "var(--font-sans)",
        mono: "var(--font-mono)",
      },
      borderRadius: {
        card: "var(--radius-card)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        glow: "var(--shadow-glow)",
      },
      backdropBlur: {
        panel: "var(--blur-panel)",
      },
    },
  },
  plugins: [],
};
