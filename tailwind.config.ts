import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#1F3864",   // carried over from the spreadsheet headers
      },
    },
  },
  plugins: [],
};
export default config;
