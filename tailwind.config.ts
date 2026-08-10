import type { Config } from "tailwindcss";

/**
 * DESIGN TOKENS.
 *
 * One palette, one type scale, one radius scale. Every screen pulls from here,
 * so the app cannot drift into looking like three different products.
 *
 * The accent is used sparingly - primary buttons, active nav, focus rings and
 * nothing else. Status colour is carried by semantic tokens so red always means
 * the same thing wherever it appears.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F6F7F9",          // page background
        surface: "#FFFFFF",         // cards, rows, inputs
        sunken: "#F1F3F6",          // table headers, inset panels

        line: "#E4E7EC",            // default border
        "line-strong": "#CFD5DE",   // input borders, dividers that must read

        ink: "#151A22",             // primary text
        "ink-muted": "#5A6472",     // secondary text
        "ink-subtle": "#8B95A3",    // captions, placeholders

        accent: "#1F3864",          // brand navy, carried over from the sheets
        "accent-hover": "#2B4A7D",
        "accent-soft": "#EDF1F8",

        success: "#0E7A4D",
        "success-soft": "#E7F4ED",
        warning: "#8A5A00",
        "warning-soft": "#FCF3E3",
        danger: "#B42318",
        "danger-soft": "#FDECEA",
      },

      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },

      fontSize: {
        caption: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.01em" }],
        label: ["0.75rem", { lineHeight: "1.125rem", letterSpacing: "0.01em" }],
        small: ["0.8125rem", { lineHeight: "1.25rem" }],
        body: ["0.875rem", { lineHeight: "1.375rem" }],
        h3: ["1rem", { lineHeight: "1.5rem", letterSpacing: "-0.006em" }],
        h2: ["1.25rem", { lineHeight: "1.75rem", letterSpacing: "-0.012em" }],
        h1: ["1.5rem", { lineHeight: "2rem", letterSpacing: "-0.018em" }],
        display: ["2rem", { lineHeight: "2.375rem", letterSpacing: "-0.022em" }],
        metric: ["1.75rem", { lineHeight: "2rem", letterSpacing: "-0.02em" }],
      },

      borderRadius: {
        control: "8px",   // buttons, inputs, selects
        card: "12px",     // cards, table shells
        panel: "16px",    // drawers, modals
      },

      boxShadow: {
        // Subtle by design. Elevation is communicated by borders first.
        card: "0 1px 2px rgba(21, 26, 34, 0.04)",
        raised: "0 2px 8px rgba(21, 26, 34, 0.06), 0 1px 2px rgba(21, 26, 34, 0.04)",
        overlay: "0 16px 48px rgba(21, 26, 34, 0.16)",
      },

      transitionDuration: {
        fast: "120ms",
        base: "180ms",
      },
    },
  },
  plugins: [],
};

export default config;
