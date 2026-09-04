import type { Config } from "tailwindcss";

/**
 * Design tokens for bord's web app, following the structural language of
 * Airbnb's Design Language System (DLS): a warm, confident accent against
 * near-white neutrals; generous rounding (12px cards, full-pill controls);
 * soft diffuse elevation instead of hard borders; a rounded humanist
 * typeface; an 8px spacing rhythm. See DESIGN-PRINCIPLES.md for how these
 * tokens map to specific bord screens and the Laws of UX each choice serves.
 *
 * This is bord's own palette inspired by that system, not Airbnb's brand
 * palette reused verbatim: bord is a compliance product, not a marketplace,
 * so the primary accent is a deep teal (trust, verification, "in good
 * standing") rather than Airbnb's coral, with a coral/rausch-family red
 * reserved here for what it should mean in a governance product: violation
 * severity, never a friendly brand color.
 */
const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Primary brand/accent -- trust teal, the "verified / in good standing" color
        brand: {
          50: "#EAF7F5",
          100: "#CDEEE8",
          300: "#5FC9BC",
          500: "#0F9A8C",
          600: "#0C8377",
          700: "#0A6B61",
          900: "#073F39",
        },
        // Reserved for real compliance violations only -- never decorative
        violation: {
          50: "#FDECEA",
          100: "#FBD4CF",
          500: "#C13515",
          600: "#A32C11",
        },
        // Forward warnings ("will become a violation"), distinct hue from violation
        warning: {
          50: "#FFF3E6",
          100: "#FFE1BF",
          500: "#B5680A",
          600: "#95560A",
        },
        // Governance-conflict-flag neutral register -- deliberately NOT the
        // violation red; see DESIGN-PRINCIPLES.md's Von Restorff entry on
        // mislabel_incident flags (findable, not alarming)
        flag: {
          50: "#F1EEFB",
          100: "#E0DAF6",
          500: "#6C4FCB",
          600: "#5A3FB0",
        },
        success: {
          50: "#EAF7EE",
          500: "#1E8E4F",
        },
        // Neutrals -- warm-tinted grays, near-black ink rather than pure black
        ink: {
          900: "#22201E",
          700: "#48443F",
          500: "#726C64",
          300: "#B3ACA2",
          200: "#DDD7CE",
          100: "#EEEAE3",
          50: "#F8F6F2",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          muted: "#F8F6F2",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "12px",
        control: "10px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(34,32,30,0.06), 0 8px 24px rgba(34,32,30,0.08)",
        "card-hover": "0 2px 4px rgba(34,32,30,0.08), 0 16px 32px rgba(34,32,30,0.12)",
        modal: "0 24px 48px rgba(34,32,30,0.24)",
      },
      spacing: {
        "4.5": "1.125rem",
      },
    },
  },
  plugins: [],
};

export default config;
