export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`brand-logo ${className}`.trim()}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="EklosHub"
    >
      <g
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M73 16.8A41 41 0 1 0 86 36.5" />
        <path d="M24 58c9-11 18-12 26-8v18c-9-3-17-2-28 6" />
        <path d="M76 58c-9-11-18-12-26-8v18c9-3 17-2 28 6" />
        <path d="M22 70c10 16 19 21 28 21s18-5 28-21" />
        <path d="M34 72c5 8 10 11 16 11s11-3 16-11" />
        <path d="M28 54 50 48l22 6v16L50 64 28 70V54Z" />
        <path d="M50 48v16" />
        <path d="M36 58h8M36 63h8M56 56h8M56 61h8" />
        <path d="M43 49 50 38l7 11" />
        <path d="M46 49h8v8h-8z" />
        <path d="M50 32v8M46.5 35.5h7" />
      </g>
      <g fill="currentColor">
        <path d="M80 14.5 81.4 18l3.6.5-2.8 2.4.9 3.6L80 22.3l-3.1 2.2.9-3.6-2.8-2.4 3.6-.5z" />
        <path d="M90 24.5 91 27l2.6.4-2 1.8.6 2.6L90 30.2l-2.2 1.6.6-2.6-2-1.8 2.6-.4z" />
        <path d="M86 12.2 86.7 14.1 88.6 14.4 87.2 15.8 87.6 17.7 86 16.6 84.4 17.7 84.8 15.8 83.4 14.4 85.3 14.1z" />
        <circle cx="94" cy="34" r="1.15" />
        <circle cx="76" cy="24" r="0.9" />
      </g>
    </svg>
  );
}
