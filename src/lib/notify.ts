/** A soft two-note chime made in the browser (no sound file needed), like a messaging app. */
let ctx: AudioContext | null = null;
export function unlockSound() {
  try { ctx = ctx ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); } catch { /* no audio */ }
}
export function playChime() {
  try {
    unlockSound();
    if (!ctx) return;
    const now = ctx.currentTime;
    [[880, 0], [1318.5, 0.12]].forEach(([f, d]) => {
      const o = ctx!.createOscillator(); const g = ctx!.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + d); g.gain.exponentialRampToValueAtTime(0.25, now + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, now + d + 0.35);
      o.connect(g).connect(ctx!.destination); o.start(now + d); o.stop(now + d + 0.4);
    });
  } catch { /* ignore */ }
}
export function canPopUp(): boolean { return typeof Notification !== 'undefined'; }
export async function askPopUps(): Promise<boolean> {
  if (!canPopUp()) return false;
  if (Notification.permission === 'granted') return true;
  return (await Notification.requestPermission()) === 'granted';
}
export function popUp(title: string, body: string, onClick?: () => void) {
  if (!canPopUp() || Notification.permission !== 'granted') return;
  try { const n = new Notification(title, { body, icon: '/icon-192.png', tag: title + body }); if (onClick) n.onclick = () => { window.focus(); onClick(); n.close(); }; } catch { /* ignore */ }
}
