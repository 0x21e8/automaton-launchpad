export const themeTokens = {
  colors: {
    background: "#f0ece4",
    panel: "#f7f2ea",
    panelStrong: "#e9dfd0",
    ink: "#1a1a1a",
    line: "#211d1a",
    accent: "#e63312",
    accentSoft: "#f4d2ca",
    muted: "#8d857b",
    mutedStrong: "#5c564f",
    inverse: "#161311",
    drawerBackground: "#1a1a1a",
    drawerText: "#cccccc",
    drawerMuted: "#888888",
    drawerSubtle: "#555555",
    tierNormal: "#7a7",
    tierLow: "#b98",
    tierCritical: "#c87",
    gridNormal: "#1a1a1a",
    gridLow: "#1a3ce0",
    gridCritical: "#e63312",
    gridDot: "rgba(0, 0, 0, 0.018)"
  },
  typography: {
    display: '"Instrument Serif", serif',
    body: '"Azeret Mono", monospace'
  },
  spacing: {
    "2xs": "0.375rem",
    xs: "0.75rem",
    sm: "1rem",
    md: "1.5rem",
    lg: "2rem",
    xl: "3rem",
    "2xl": "4.5rem"
  },
  borderWidths: {
    hairline: "1px",
    strong: "2px"
  },
  motion: {
    fast: "160ms",
    base: "240ms"
  }
} as const;
