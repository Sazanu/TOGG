/** Throne of God's Grace Ministries emblem (globe + throne), on a white tile so it reads on any background. */
export function Crest({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-white p-1 shadow-sm ring-1 ring-black/5 ${className}`}>
      <img src="/logo-mark.png" alt="" className="h-full w-full object-contain" />
    </span>
  );
}

/** The full logo with the church name, as designed. Use on white/light backgrounds. */
export function FullLogo({ className = 'h-40' }: { className?: string }) {
  return <img src="/logo-full.png" alt="Throne of God's Grace Ministries" className={`w-auto object-contain ${className}`} />;
}

export function Logo({ light }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Crest className="h-11 w-11" />
      <div className="leading-tight">
        <div className={`font-display text-[15px] font-extrabold tracking-tight ${light ? 'text-white' : 'text-royal-950'}`}>Throne of God's Grace</div>
        <div className={`text-[10px] font-semibold uppercase tracking-[0.22em] ${light ? 'text-gold-300' : 'text-gold-600'}`}>Ministries · TOGG</div>
      </div>
    </div>
  );
}
