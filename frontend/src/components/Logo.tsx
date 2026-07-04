export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-label="Corpora logo"
      role="img"
    >
      <defs>
        <linearGradient id="corpora-g" x1="0" y1="0" x2="32" y2="32">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8.5" fill="url(#corpora-g)" />
      {/* open "C" ring — gap holds the citation dot */}
      <circle
        cx="16"
        cy="16"
        r="7"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="33 11"
        transform="rotate(45 16 16)"
      />
      <circle cx="24.2" cy="16" r="2.1" fill="#34d399" />
    </svg>
  );
}

export function LogoWordmark({ size = 26 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2">
      <LogoMark size={size} />
      <span className="text-[15px] font-semibold tracking-tight">Corpora</span>
    </span>
  );
}
