interface LogoIconProps {
  className?: string;
}

export function LogoIcon({ className }: LogoIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="resWood" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#a0522d" />
          <stop offset="100%" stopColor="#5c2e0d" />
        </linearGradient>
        <linearGradient id="resGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffd700" />
          <stop offset="50%" stopColor="#daa520" />
          <stop offset="100%" stopColor="#8b6914" />
        </linearGradient>
        <linearGradient id="resGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fff8dc" />
          <stop offset="100%" stopColor="#ffd700" />
        </linearGradient>
      </defs>

      <rect
        x="4"
        y="14"
        width="24"
        height="12"
        rx="1.5"
        fill="url(#resWood)"
        stroke="#3d1f08"
        strokeWidth="1"
      />
      <path
        d="M3 14l3.5-7h19l3.5 7H3z"
        fill="url(#resWood)"
        stroke="#3d1f08"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <rect x="7" y="14" width="2" height="12" fill="url(#resGold)" />
      <rect x="23" y="14" width="2" height="12" fill="url(#resGold)" />
      <rect x="4" y="14" width="24" height="2.5" fill="url(#resGold)" />
      <circle
        cx="16"
        cy="17"
        r="3"
        fill="url(#resGold)"
        stroke="#6b4e0a"
        strokeWidth="0.5"
      />
      <rect x="15" y="16" width="2" height="2.5" rx="0.3" fill="#3d1f08" />
      <path
        d="M16 19l2.5 2.5-2.5 2.5-2.5-2.5 2.5-2.5z"
        fill="url(#resGlow)"
        opacity="0.95"
      />
      <path
        d="M10 11l1-2M22 11l-1-2M16 9v-2"
        stroke="url(#resGlow)"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}
