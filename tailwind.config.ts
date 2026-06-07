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

        // Brand: azul premium SaaS
        brand: {
          DEFAULT: "hsl(var(--brand))",
          foreground: "hsl(var(--brand-foreground))",
          soft: "hsl(var(--brand-soft))",
          "soft-foreground": "hsl(var(--brand-soft-foreground))",
          50: "hsl(214, 100%, 97%)",
          100: "hsl(214, 95%, 93%)",
          200: "hsl(213, 97%, 87%)",
          300: "hsl(212, 96%, 78%)",
          400: "hsl(213, 94%, 68%)",
          500: "hsl(217, 91%, 60%)",
          600: "hsl(221, 83%, 53%)",
          700: "hsl(224, 76%, 48%)",
          800: "hsl(226, 71%, 40%)",
          900: "hsl(224, 64%, 33%)",
        },

        // Acentos secundarios para charts/highlights
        indigo: {
          500: "hsl(238, 78%, 64%)",
          600: "hsl(243, 75%, 58%)",
        },
        violet: {
          500: "hsl(262, 83%, 65%)",
          600: "hsl(262, 83%, 58%)",
        },
        emerald: {
          500: "hsl(152, 65%, 45%)",
          600: "hsl(152, 70%, 38%)",
        },

        // Estados semánticos
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

        // ── Paleta LUXURY para la experiencia del cliente ──
        // Dorado elegante + cremas/beige. Usados sólo en superficies de cliente.
        gold: {
          DEFAULT: "hsl(var(--lx-gold, 36 42% 47%))",
          soft: "hsl(var(--lx-gold-soft, 40 56% 92%))",
          foreground: "hsl(var(--lx-gold-foreground, 40 50% 98%))",
          50: "hsl(43, 60%, 96%)",
          100: "hsl(42, 58%, 91%)",
          200: "hsl(40, 54%, 83%)",
          300: "hsl(38, 50%, 72%)",
          400: "hsl(37, 47%, 60%)",
          500: "hsl(36, 46%, 50%)",
          600: "hsl(34, 48%, 43%)",
          700: "hsl(32, 47%, 35%)",
          800: "hsl(30, 42%, 29%)",
          900: "hsl(28, 38%, 24%)",
        },
        cream: {
          DEFAULT: "hsl(40, 44%, 96%)",
          50: "hsl(40, 50%, 98%)",
          100: "hsl(40, 44%, 96%)",
          200: "hsl(38, 36%, 92%)",
          300: "hsl(36, 30%, 87%)",
        },
        ink: {
          DEFAULT: "hsl(30, 10%, 15%)",
          soft: "hsl(30, 8%, 32%)",
          muted: "hsl(30, 6%, 46%)",
        },
      },
      borderRadius: {
        sm: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        "2xl": "20px",
        "3xl": "28px",
        DEFAULT: "8px",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
        // Display = misma Inter, sólo cambia tracking via .font-display utility
        display: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "monospace"],
        // Serif premium (experiencia del cliente / luxury)
        serif: ["var(--font-serif)", "Playfair Display", "Georgia", "serif"],
        "serif-soft": [
          "var(--font-serif-soft)",
          "Cormorant Garamond",
          "Georgia",
          "serif",
        ],
      },
      fontSize: {
        "display-xl": ["3rem", { lineHeight: "1.1", letterSpacing: "-0.025em", fontWeight: "700" }],
        "display-lg": ["2.25rem", { lineHeight: "1.15", letterSpacing: "-0.02em", fontWeight: "700" }],
        "h1": ["1.75rem", { lineHeight: "1.25", letterSpacing: "-0.015em", fontWeight: "700" }],
        "h2": ["1.375rem", { lineHeight: "1.3", letterSpacing: "-0.01em", fontWeight: "600" }],
        "h3": ["1.125rem", { lineHeight: "1.35", fontWeight: "600" }],
        "h4": ["1rem", { lineHeight: "1.4", fontWeight: "600" }],
        "body": ["0.875rem", { lineHeight: "1.55" }],
        "body-sm": ["0.8125rem", { lineHeight: "1.5" }],
        "caption": ["0.75rem", { lineHeight: "1.4", letterSpacing: "0.005em" }],
        "overline": ["0.6875rem", { lineHeight: "1.3", letterSpacing: "0.1em" }],
      },
      boxShadow: {
        // Sombras minimales — el feel "Lumen" es plano, casi sin sombras
        xs: "0 1px 1px 0 rgba(15, 23, 42, .03)",
        sm: "0 1px 2px 0 rgba(15, 23, 42, .04)",
        md: "0 2px 4px -1px rgba(15, 23, 42, .06), 0 1px 2px -1px rgba(15, 23, 42, .04)",
        lg: "0 8px 16px -4px rgba(15, 23, 42, .08), 0 2px 4px -2px rgba(15, 23, 42, .04)",
        xl: "0 16px 32px -8px rgba(15, 23, 42, .12), 0 4px 8px -4px rgba(15, 23, 42, .06)",
        // Glow ahora azul muy ligero (no más violet pesado)
        glow: "0 0 0 1px hsla(217,91%,60%,.08), 0 4px 12px -2px hsla(217,91%,60%,.18)",
        "glow-lg": "0 0 0 1px hsla(217,91%,60%,.12), 0 12px 28px -6px hsla(217,91%,60%,.28)",
        "glow-success": "0 0 0 1px hsla(152,70%,38%,.10), 0 4px 12px -2px hsla(152,70%,38%,.20)",
        "glow-danger": "0 0 0 1px hsla(0,75%,55%,.10), 0 4px 12px -2px hsla(0,75%,55%,.20)",
        "inner-lift": "inset 0 1px 0 0 rgba(255,255,255,.06)",
        "ring-focus": "0 0 0 3px hsla(217,91%,60%,.16)",
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
          "0%, 100%": { boxShadow: "0 0 0 0 hsla(217,91%,60%,.3)" },
          "50%": { boxShadow: "0 0 0 6px hsla(217,91%,60%,0)" },
        },
        "gradient-shift": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(8px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "draw-line": {
          from: { strokeDashoffset: "1000" },
          to: { strokeDashoffset: "0" },
        },
        kenburns: {
          "0%": { transform: "scale(1) translateY(0)" },
          "100%": { transform: "scale(1.08) translateY(-1.5%)" },
        },
        "fade-in-down": {
          from: { opacity: "0", transform: "translateY(-10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "gold-shine": {
          "0%": { backgroundPosition: "200% center" },
          "100%": { backgroundPosition: "-200% center" },
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
        "draw-line": "draw-line 1.4s cubic-bezier(.4,0,.2,1) forwards",
        kenburns: "kenburns 18s ease-out forwards",
        "fade-in-down": "fade-in-down 320ms cubic-bezier(.34,1.56,.64,1)",
        "gold-shine": "gold-shine 6s linear infinite",
      },
      backgroundImage: {
        "aurora":
          "linear-gradient(135deg, hsl(217,91%,60%) 0%, hsl(240,80%,62%) 50%, hsl(262,83%,65%) 100%)",
        "aurora-soft":
          "linear-gradient(135deg, hsl(217,91%,60%,.08) 0%, hsl(240,80%,62%,.08) 50%, hsl(262,83%,65%,.08) 100%)",
        "aurora-radial":
          "radial-gradient(ellipse at top, hsl(217,91%,60%,.10), transparent 70%)",
        "shimmer":
          "linear-gradient(90deg, transparent 0%, hsla(0,0%,100%,.08) 50%, transparent 100%)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}

export default config
