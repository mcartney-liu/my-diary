/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: {
          bg: "var(--paper-bg, #faf6ef)",
          surface: "var(--paper-surface, #fdfaf3)",
          card: "var(--paper-card, #ffffff)",
          line: "var(--paper-line, #e8e0cc)",
          redline: "#e57373",
          ink: "var(--paper-ink, #2d1f14)",
          ink2: "var(--paper-ink2, #7a6a54)",
          ink3: "var(--paper-ink3, #b0a28a)",
          accent: "var(--paper-accent, #8b6f47)",
          accent2: "var(--paper-accent2, #a68656)",
        },
        mood: {
          happy: "#ffd93d",
          calm: "#7bc47f",
          anxious: "#f0a04b",
          sad: "#6c8ebf",
          angry: "#d7263d",
        },
      },
        fontFamily: {
    hand: ['"Ma Shan Zheng"', '"Kalam"', '"KaiTi"', '"STKaiti"', '"楷体"', "system-ui", "sans-serif"],
    sans: ['"PingFang SC"', '"Microsoft YaHei"', '"Helvetica Neue"', 'system-ui', 'sans-serif'],
    kalam: ['"Kalam"', '"Ma Shan Zheng"', '"KaiTi"', '"STKaiti"', '"楷体"', "system-ui", "sans-serif"],
  
        },
        boxShadow: {
        card: "var(--shadow-card, 0 2px 12px -2px rgba(45,31,20,0.08))",
        cardHover: "var(--shadow-card-hover, 0 8px 24px -4px rgba(45,31,20,0.12))",
        soft: "var(--shadow-soft, 0 1px 3px rgba(45,31,20,0.06))",
        inset: "inset 0 1px 2px rgba(45,31,20,0.06)",
      },
      borderRadius: {
        card: "14px",
        chip: "999px",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.92)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.35s ease-out both",
        "fade-in": "fade-in 0.25s ease-out both",
        "scale-in": "scale-in 0.25s cubic-bezier(0.2,0.8,0.2,1) both",
      },
    },
  },
  plugins: [],
};
