export function Crest({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#2b1c4a" />
      <path d="M14 44 L12 22 L23 31 L32 16 L41 31 L52 22 L50 44 Z" fill="#dfb037" />
      <rect x="14" y="47" width="36" height="5" rx="2" fill="#dfb037" />
      <path d="M32 26 v12 M27 31 h10" stroke="#2b1c4a" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ light }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Crest />
      <div className="leading-tight">
        <div className={`font-display text-lg font-extrabold tracking-tight ${light ? 'text-white' : 'text-royal-950'}`}>TOGG</div>
        <div className={`text-[11px] font-medium uppercase tracking-[0.14em] ${light ? 'text-gold-300' : 'text-gold-600'}`}>
          Throne of God's Grace
        </div>
      </div>
    </div>
  );
}
