/**
 * ECHO mark — a surveyor's seal: the letter E whose middle arm extends
 * east like a compass needle, anchored by a position dot.
 * Inline SVG, currentColor, ink-friendly at any size.
 */
export function EchoLogo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className={className}
    >
      {/* seal ring */}
      <circle cx="16" cy="16" r="14.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="0.7" opacity="0.45" />
      {/* the E: three arms */}
      <path
        d="M11 9.5h9"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M11 16h7"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M11 22.5h9"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* spine */}
      <path
        d="M11 9.5V22.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* compass needle pointing east from the middle arm */}
      <path d="M19.4 16l4.4-2.6v5.2z" fill="currentColor" />
      {/* surveyor's mark */}
      <circle cx="16" cy="27.2" r="0.9" fill="currentColor" />
    </svg>
  );
}
