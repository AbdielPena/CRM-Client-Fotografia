import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        "border-strong": "hsl(var(--border-strong))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        surface: "hsl(var(--surface))",
        elevated: "hsl(var(--elevated))",

        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },

        // Brand palette - Aurora (violet + indigo + fuchsia)
        brand: {
          DEFAULT: "hsl(var(--brand))",
          foreground: "hsl(var(--brand-foreground))",
          soft: "hsl(var(--brand-soft))",
          "soft-foreground": "hsl(var(--brand-soft-foreground))",
          50: "hsl(270, 100%, 98%)",
          100: "hsl(269, 100%, 95%)",
          200: "hsl(269, 100%, 92%)",
          300: "hsl(268, 100%, 86%)",
          400: "hsl(267, 84%, 75%)",
          500: "hsl(263, 83%, 66%)",
          600: "hsl(262, 83%, 58%)",
          700: "hsl(263, 70%, 50%)",
          800: "hsl(263, 69%, 42%)",
          900: "hsl(263, 67%, 35%)",
        },
        indigo: {
          500: "hsl(240, 84%, 64%)",
          600: "hsl(243, 75%, 59%)",
        },
        fuchsia: {
          500: "hsl(292, 84%, 60%)",
          600: "hsl(292, 71%, 52%)",
        },

        // Semantic state colors
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          soft: "hsl(var(--success-soft))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
          soft: "hsl(var(--warning-soft))",
        },
        danger: {
          DEFAULT: "hsl(var(--danger))",
          foreground: "hsl(var(--danger-foreground))",
          soft: "hsl(var(--danger-soft))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
          soft: "hsl(var(--info-soft))",
        },

        skeleton: "hsl(var(--skeleton))",
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "14px",
        xl: "20px",
        "2xl": "28px",
        "3xl": "36px",
        DEFAULT: "10px",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Geist", "Inter", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Instrument Serif", "Georgia", "serif"],
        mono: ["var(--font-mono)", "Geist Mono", "JetBrains Mono", "monospace"],
      },
      fontSize: {
        "display-xl": ["3.5rem", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
        "display-lg": ["2.5rem", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
        "h1": ["2rem", { lineHeight: "1.2", letterSpacing: "-0.015em" }],
        "h2": ["1.5rem", { lineHeight: "1.25", letterSpacing: "-0.01em" }],
        "h3": ["1.25rem", { lineHeight: "1.3" }],
        "h4": ["1rem", { lineHeight: "1.4" }],
        "body": ["0.875rem", { lineHeight: "1.55" }],
        "body-sm": ["0.8125rem", { lineHeight: "1.5" }],
        "caption": ["0.75rem", { lineHeight: "1.4", letterSpacing: "0.01em" }],
        "overline": ["0.6875rem", { lineHeight: "1.3", letterSpacing: "0.12em" }],
      },
      boxShadow: {
        xs: "0 1px 1px 0 rgba(16,24,40,.04)",
        sm: "0 1px 2px 0 rgba(16,24,40,.06), 0 1px 1px 0 rgba(16,24,40,.04)",
        md: "0 4px 12px -2px rgba(16,24,40,.08), 0 2px 4px -2px rgba(16,24,40,.04)",
        lg: "0 12px 32px -8px rgba(16,24,40,.12), 0 4px 8px -4px rgba(16,24,40,.06)",
        xl: "0 24px 48px -12px rgba(16,24,40,.18), 0 8px 16px -8px rgba(16,24,40,.08)",
        glow: "0 0 0 1px hsla(262,83%,58%,.12), 0 8px 24px -8px hsla(262,83%,58%,.35)",
        "glow-lg": "0 0 0 1px hsla(262,83%,58%,.15), 0 20px 48px -12px hsla(262,83%,58%,.45)",
        "glow-success": "0 0 0 1px hsla(152,60%,45%,.15), 0 8px 24px -8px hsla(152,60%,45%,.35)",
        "glow-danger": "0 0 0 1px hsla(0,75%,55%,.15), 0 8px 24px -8px hsla(0,75%,55%,.35)",
        "inner-lift": "inset 0 1px 0 0 rgba(255,255,255,.06)",
        "ring-focus": "0 0 0 4px hsla(262,83%,58%,.15)",
      },
      transitionTimingFunction: {
        standard: "cubic-bezier(.4, 0, .2, 1)",
        spring: "cubic-bezier(.34, 1.56, .64, 1)",
        smooth: "cubic-bezier(.32, .72, 0, 1)",
      },
      transitionDuration: {
        fast: "150ms",
        base: "220ms",
        slow: "320ms",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        ripple: {
          "0%, 100%": { transform: "translate(-50%, -50%) scale(1)" },
          "50%": { transform: "translate(-50%, -50%) scale(0.9)" },
        },
        orbit: {
          "0%": {
            transform:
              "rotate(calc(var(--angle) * 1deg)) translateY(calc(var(--radius) * 1px)) rotate(calc(var(--angle) * -1deg))",
          },
          "100%": {
            transform:
              "rotate(calc(var(--angle) * 1deg + 360deg)) translateY(calc(var(--radius) * 1px)) rotate(calc((var(--angle) * -1deg) - 360deg))",
          },
        },
        "border-beam": {
          "100%": { "offset-distance": "100%" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "shimmer": {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 0 0 hsla(262,83%,58%,.4)" },
          "50%": { boxShadow: "0 0 0 8px hsla(262,83%,58%,0)" },
        },
        "gradient-shift": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(8px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 220ms cubic-bezier(.32,.72,0,1)",
        "accordion-up": "accordion-up 220ms cubic-bezier(.32,.72,0,1)",
        ripple: "ripple var(--duration, 2s) ease calc(var(--i, 0) * 0.2s) infinite",
        orbit: "orbit calc(var(--duration) * 1s) linear infinite",
        "border-beam": "border-beam calc(var(--duration)*1s) infinite linear",
        "fade-in": "fade-in 220ms cubic-bezier(.4,0,.2,1)",
        "fade-in-up": "fade-in-up 320ms cubic-bezier(.34,1.56,.64,1)",
        "scale-in": "scale-in 220ms cubic-bezier(.34,1.56,.64,1)",
        shimmer: "shimmer 2.2s linear infinite",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "gradient-shift": "gradient-shift 8s ease infinite",
        "slide-in-right": "slide-in-right 220ms cubic-bezier(.34,1.56,.64,1)",
      },
      backgroundImage: {
        "aurora":
          "linear-gradient(135deg, hsl(240,84%,64%) 0%, hsl(262,83%,58%) 50%, hsl(292,84%,60%) 100%)",
        "aurora-soft":
          "linear-gradient(135deg, hsl(240,84%,64%,.08) 0%, hsl(262,83%,58%,.08) 50%, hsl(292,84%,60%,.08) 100%)",
        "aurora-radial":
          "radial-gradient(ellipse at top, hsl(262,83%,58%,.15), transparent 70%)",
        "shimmer":
          "linear-gradient(90deg, transparent 0%, hsla(0,0%,100%,.08) 50%, transparent 100%)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}

export default config
