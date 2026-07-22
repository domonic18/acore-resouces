interface LogoIconProps {
  className?: string;
  color?: string;
}

export function LogoIcon({ className, color }: LogoIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      style={color ? { color } : undefined}
    >
      <path
        d="M4 12h24v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V12z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M3 12l2.5-5h21L29 12H3z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="14" r="2.5" fill="currentColor" />
      <path
        d="M16 18l3 3-3 3-3-3 3-3z"
        fill="currentColor"
        opacity="0.85"
      />
    </svg>
  );
}
