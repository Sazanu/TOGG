import { Copy, CreditCard, Landmark, Smartphone } from 'lucide-react';
import { Button } from './ui';
import type { PaymentSettings } from '../lib/types';

/** The church's payment details, for public pages. */
export function HowToPay({ p, reference }: { p: PaymentSettings; reference?: string }) {
  const none = !p.momoNumber && !p.paymentLink && !p.bankDetails;
  return (
    <div className="space-y-3">
      {none && <p className="text-sm text-stone-500">Payment details have not been set yet. Please give at church or contact the church office.</p>}
      {p.paymentLink && (
        <a href={p.paymentLink} target="_blank" rel="noreferrer" className="block">
          <Button variant="gold" className="w-full !py-3 text-base"><CreditCard className="h-5 w-5" /> Pay online (MoMo or card)</Button>
        </a>
      )}
      {p.momoNumber && (
        <div className="flex items-center gap-3 rounded-xl border border-stone-200 p-3">
          <Smartphone className="h-5 w-5 text-royal-600" />
          <div className="flex-1">
            <div className="text-xs text-stone-500">{p.momoNetwork || 'Mobile Money'}</div>
            <div className="font-mono text-lg font-semibold text-royal-950">{p.momoNumber}</div>
            <div className="text-xs text-stone-500">{p.momoName}</div>
          </div>
          <button onClick={() => navigator.clipboard.writeText(p.momoNumber)} className="rounded-lg p-2 text-stone-400 hover:bg-stone-100" aria-label="Copy number"><Copy className="h-4 w-4" /></button>
        </div>
      )}
      {p.bankDetails && (
        <div className="flex gap-3 rounded-xl border border-stone-200 p-3">
          <Landmark className="h-5 w-5 shrink-0 text-royal-600" />
          <p className="whitespace-pre-line text-sm text-stone-700">{p.bankDetails}</p>
        </div>
      )}
      {reference && !none && <p className="text-xs text-stone-500">Use the reference <b>{reference}</b> with your name so it is recorded correctly.</p>}
    </div>
  );
}
