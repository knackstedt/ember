/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/renderer/src/**/*.{js,ts,jsx,tsx}",
    "./src/renderer/index.html",
  ],
  theme: {
    extend: {
      colors: {
        accent: "var(--accent)",
        "accent-dim": "var(--accent-muted)",
        surface: "var(--surface-0)",
        "surface-raised": "var(--surface-1)",
        "surface-overlay": "var(--surface-2)",
        text: "var(--text-primary)",
        "text-dim": "var(--text-secondary)",
        border: "var(--border-default)",
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
