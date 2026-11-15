import { useSearchParams } from 'react-router-dom';
import { HowToPay } from '../components/HowToPay';
import { FullLogo } from '../components/Logo';
import { Card } from '../components/ui';
import { usePayments } from '../lib/settings';

const PURPOSE: Record<string, string> = { welfare: 'Welfare dues', tithe: 'Tithe', offering: 'Offering', project: 'Church project', charity: 'Charity foundation' };

export default function PublicPay() {
  const [params] = useSearchParams();
  const p = usePayments();
  const purpose = PURPOSE[params.get('for') ?? ''] ?? 'Tithes & offerings';
  return (
    <div className="min-h-screen bg-gradient-to-b from-royal-950 via-royal-900 via-[14rem] to-cream to-[26rem] px-4 py-10">
      <div className="mx-auto max-w-md">
        <div className="mb-6 text-center text-white">
          <div className="mx-auto mb-4 inline-block rounded-3xl bg-white p-3 shadow-xl"><FullLogo className="h-24" /></div>
          <h1 className="font-display text-3xl font-extrabold">{purpose}</h1>
          <p className="mt-2 text-sm text-royal-200">“God loves a cheerful giver.” — 2 Corinthians 9:7</p>
        </div>
        <Card className="p-6"><HowToPay p={p} reference={purpose} /></Card>
      </div>
    </div>
  );
}
