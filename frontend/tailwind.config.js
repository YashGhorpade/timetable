/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["'DM Sans'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
        display: ["'Space Grotesk'", "sans-serif"],
      },
      colors: {
        brand: {
          50:  "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
          950: "#172554",
        },
        surface: {
          0:   "var(--surface-0)",
          1:   "var(--surface-1)",
          2:   "var(--surface-2)",
          3:   "var(--surface-3)",
        },
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(0,0,0,.08), 0 1px 2px -1px rgba(0,0,0,.06)",
        "card-lg": "0 4px 12px 0 rgba(0,0,0,.10)",
        "glow-blue": "0 0 0 3px rgba(59,130,246,.3)",
      },
      animation: {
        "slide-in-right": "slideInRight 0.2s ease-out",
        "fade-up":        "fadeUp 0.3s ease-out",
        "pulse-dot":      "pulseDot 2s infinite",
      },
      keyframes: {
        slideInRight: {
          "0%":   { transform: "translateX(100%)", opacity: "0" },
          "100%": { transform: "translateX(0)",    opacity: "1" },
        },
        fadeUp: {
          "0%":   { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)",   opacity: "1" },
        },
        pulseDot: {
          "0%,100%": { opacity: "1" },
          "50%":     { opacity: "0.4" },
        },
      },
    },
  },
  plugins: [],
};
