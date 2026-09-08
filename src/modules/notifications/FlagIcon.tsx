import React from "react";

interface FlagIconProps {
  locale: string;
  size?: number;
}

const FLAG_IT = ({ size = 16 }: { size?: number }) => (
  <svg
    width={size}
    height={size * 0.72}
    viewBox="0 0 18 13"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ borderRadius: 2, flexShrink: 0 }}
  >
    <rect width="6" height="13" fill="#009246" />
    <rect x="6" width="6" height="13" fill="#FFFFFF" />
    <rect x="12" width="6" height="13" fill="#CE2B37" />
  </svg>
);

const FLAG_EN = ({ size = 16 }: { size?: number }) => (
  <svg
    width={size}
    height={size * 0.72}
    viewBox="0 0 18 13"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ borderRadius: 2, flexShrink: 0 }}
  >
    <rect width="18" height="13" fill="#012169" />
    <path d="M0 0L18 13M18 0L0 13" stroke="white" strokeWidth="2.5" />
    <path d="M0 0L18 13M18 0L0 13" stroke="#C8102E" strokeWidth="1.5" />
    <path d="M9 0V13M0 6.5H18" stroke="white" strokeWidth="3.5" />
    <path d="M9 0V13M0 6.5H18" stroke="#C8102E" strokeWidth="2" />
  </svg>
);

export default function FlagIcon({ locale, size = 16 }: FlagIconProps) {
  const normalizedLocale = locale.toLowerCase().startsWith("it")
    ? "it"
    : locale.toLowerCase().startsWith("en")
      ? "en"
      : null;

  if (normalizedLocale === "it") {
    return <FLAG_IT size={size} />;
  }

  if (normalizedLocale === "en") {
    return <FLAG_EN size={size} />;
  }

  // Fallback for unknown locales
  return <span style={{ fontSize: size * 0.8 }}>🌐</span>;
}
