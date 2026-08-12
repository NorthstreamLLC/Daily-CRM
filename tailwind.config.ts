import type { Config } from "tailwindcss";

/**
 * DESIGN TOKENS.
 *
 * Every colour is a CSS variable defined in globals.css, with a light and a
 * dark value. Components only ever reference the token name, so dark mode is
 * a root-class flip - no per-component dark: variants, and no way for one
 * screen to drift out of theme.
 *
 * The shell (sidebar) palette is deliberately static: it is dark in both
 * themes, which is what keeps the frame recognisable when the content flips.
 */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: v("canvas"),
        surface: v("surface"),
        sunken: v("sunken"),

        line: v("line"),
        "line-strong": v("line-strong"),

        ink: v("ink"),
        "ink-muted": v("ink-muted"),
        "ink-subtle": v("ink-subtle"),

        accent: v("accent"),
        "accent-hover": v("accent-hover"),
        "accent-soft": v("accent-soft"),

        success: v("success"),
        "success-soft": v("success-soft"),
        warning: v("warning"),
        "warning-soft": v("warning-soft"),
        danger: v("danger"),
        "danger-soft": v("danger-soft"),

        // The application frame - constant across both themes.
        shell: "#131C2E",
        "shell-raised": "#1B2740",
        "shell-line": "#26334D",
        "shell-ink": "#E8ECF3",
        "shell-ink-muted": "#93A0B7",
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
        control: "8px",
        card: "12px",
        panel: "16px",
      },

      boxShadow: {
        card: "0 1px 2px rgba(10, 14, 20, 0.05)",
        raised: "0 2px 8px rgba(10, 14, 20, 0.07), 0 1px 2px rgba(10, 14, 20, 0.05)",
        overlay: "0 16px 48px rgba(10, 14, 20, 0.28)",
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
