/**
 * BrandHeader.tsx
 * Cabeçalho com identidade visual Leone Berto Consultoria.
 * Cores conforme Brand Book oficial v2:
 *   Azul Marinho Profundo  #1B2F4A
 *   Dourado Elegante       #C8A15E
 *   Branco Puro            #FFFFFF
 */

import React from "react";

interface BrandHeaderProps {
  variant?: "dark" | "light";
  compact?: boolean;
  showTagline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

function LBLogoSVG({ variant = "dark", size = 44 }: { variant?: "dark" | "light"; size?: number }) {
  const primaryColor = variant === "dark" ? "#FFFFFF" : "#1B2F4A";
  const gold  = "#C8A15E";

  return (
    <svg
      width={size * 3.2}
      height={size}
      viewBox="0 0 160 50"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Leone Berto Consultoria"
    >
      {/* Monograma L */}
      <text
        x="2" y="38"
        fontFamily="'Cinzel', 'Cormorant Garamond', Georgia, serif"
        fontSize="38"
        fontWeight="700"
        fill={primaryColor}
      >L</text>

      {/* Monograma B (dourado) */}
      <text
        x="22" y="38"
        fontFamily="'Cinzel', 'Cormorant Garamond', Georgia, serif"
        fontSize="32"
        fontWeight="700"
        fill={gold}
      >B</text>

      {/* Seta ascendente dourada */}
      <line x1="28" y1="36" x2="38" y2="26" stroke={gold} strokeWidth="1.8" strokeLinecap="round"/>
      <polygon points="38,26 33,28 36,33" fill={gold}/>

      {/* Separador vertical */}
      <line x1="56" y1="6" x2="56" y2="44" stroke={primaryColor} strokeWidth="1" opacity="0.5"/>

      {/* LEONE BERTO */}
      <text
        x="64" y="28"
        fontFamily="'Cinzel', 'Cormorant Garamond', Georgia, serif"
        fontSize="15"
        fontWeight="600"
        fill={primaryColor}
        letterSpacing="1.2"
      >LEONE BERTO</text>

      {/* Linha + CONSULTORIA */}
      <line x1="64" y1="33" x2="78" y2="33" stroke={gold} strokeWidth="0.7"/>
      <text
        x="80" y="37"
        fontFamily="'Open Sans', 'Lato', Arial, sans-serif"
        fontSize="5.5"
        fontWeight="500"
        fill={gold}
        letterSpacing="2.5"
      >CONSULTORIA</text>
      <line x1="144" y1="33" x2="158" y2="33" stroke={gold} strokeWidth="0.7"/>
    </svg>
  );
}

export function BrandHeader({
  variant = "dark",
  compact = false,
  showTagline = true,
  className = "",
  children,
}: BrandHeaderProps) {
  const isDark = variant === "dark";

  const containerStyle: React.CSSProperties = {
    background:     isDark ? "#1B2F4A" : "#FFFFFF",
    borderBottom:   `2px solid #C8A15E`,
    padding:        compact ? "0.6rem 1.25rem" : "0.85rem 1.75rem",
    display:        "flex",
    alignItems:     "center",
    justifyContent: "space-between",
    gap:            "1rem",
  };

  const taglineStyle: React.CSSProperties = {
    fontFamily:    "'Open Sans', 'Lato', sans-serif",
    fontSize:      compact ? "0.55rem" : "0.6rem",
    letterSpacing: "0.22em",
    textTransform: "uppercase" as const,
    color:         isDark ? "rgba(255,255,255,0.6)" : "rgba(27,47,74,0.55)",
    marginTop:     "0.25rem",
    whiteSpace:    "nowrap" as const,
  };

  return (
    <header style={containerStyle} className={className}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <LBLogoSVG variant={isDark ? "dark" : "light"} size={compact ? 34 : 44} />
        {showTagline && !compact && (
          <p style={taglineStyle}>Estratégia de Carreira e Posicionamento Profissional</p>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        {children}
      </div>
    </header>
  );
}

export default BrandHeader;
