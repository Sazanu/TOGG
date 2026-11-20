import type { OnlinePurpose } from './types';

/** Paystack's popup checkout (https://paystack.com/docs/payments/accept-payments/#popup). */
interface PaystackHandler { openIframe(): void }
declare global {
  interface Window { PaystackPop?: { setup(o: Record<string, unknown>): PaystackHandler } }
}

export const PURPOSES: { value: OnlinePurpose; label: string }[] = [
  { value: 'tithe', label: 'Tithe' }, { value: 'offering', label: 'Offering' }, { value: 'thanksgiving', label: 'Thanksgiving' },
  { value: 'seed', label: 'Seed / first fruit' }, { value: 'project', label: 'Church project' }, { value: 'building', label: 'Building fund' },
  { value: 'missions', label: 'Missions' }, { value: 'welfare', label: 'Welfare dues' }, { value: 'charity', label: 'Charity foundation' },
];

export function loadPaystack(): Promise<void> {
  if (window.PaystackPop) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://js.paystack.co/v1/inline.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Paystack. Check your internet connection.'));
    document.head.appendChild(s);
  });
}

/** Unique payment reference, also used as the document id. */
export function newReference(): string {
  const r = crypto.getRandomValues(new Uint32Array(3));
  return `TOGG-${Date.now().toString(36).toUpperCase()}-${Array.from(r, (x) => x.toString(36)).join('').slice(0, 12).toUpperCase()}`;
}

/** Opens Paystack. Resolves 'paid' when Paystack reports success (the server still confirms it), 'closed' if the giver closes it. */
export function payWithPaystack(o: { key: string; email: string; amount: number; reference: string; name: string; phone: string; purposeLabel: string }): Promise<'paid' | 'closed'> {
  return new Promise((resolve) => {
    const handler = window.PaystackPop!.setup({
      key: o.key,
      email: o.email,
      amount: Math.round(o.amount * 100), // pesewas
      currency: 'GHS',
      ref: o.reference,
      channels: ['mobile_money', 'card'],
      metadata: { custom_fields: [
        { display_name: 'Name', variable_name: 'name', value: o.name },
        { display_name: 'Phone', variable_name: 'phone', value: o.phone },
        { display_name: 'For', variable_name: 'purpose', value: o.purposeLabel },
      ] },
      // Paystack requires plain functions here.
      callback: function () { resolve('paid'); },
      onClose: function () { resolve('closed'); },
    });
    handler.openIframe();
  });
}
