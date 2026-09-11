/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: {
          bg: "#faf6ef",
          surface: "#f5efe3",
          line: "#e0d8c4",
          redline: "#e57373",
          ink: "#3d2f1f",
          ink2: "#7a6a54",
          accent: "#8b6f47",
        },
      },
      fontFamily: {
        hand: ['"Ma Shan Zheng"', '"KaiTi"', '"STKaiti"', "serif"],
      },
    },
  },
  plugins: [],
};
