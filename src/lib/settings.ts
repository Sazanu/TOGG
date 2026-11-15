import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, firebaseConfig } from './firebase';
import type { PaymentSettings, WelfareSettings } from './types';

export const DEFAULT_PAYMENTS: PaymentSettings = {
  momoNumber: '', momoName: "Throne of God's Grace Ministries", momoNetwork: 'MTN MoMo', paymentLink: '', bankDetails: '', publicSiteUrl: '',
};

export const DEFAULT_WELFARE: WelfareSettings = {
  amount: 20,
  startMonth: `${new Date().getFullYear()}-01`,
  remindEnabled: false,
  remindDay: 5,
  template: 'Dear {firstName}, your TOGG welfare dues for {months} (GH₵{amount}) are outstanding. Kindly pay via {link}. God bless you.',
};

/** Live settings document (falls back to defaults if missing or unreadable). */
export function useSettingsDoc<T extends object>(id: string, defaults: T): T {
  const [v, setV] = useState<T>(defaults);
  useEffect(() => onSnapshot(doc(db, 'settings', id), (s) => setV({ ...defaults, ...(s.data() as Partial<T> | undefined) }), () => setV(defaults)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id]);
  return v;
}

export const usePayments = () => useSettingsDoc<PaymentSettings>('payments', DEFAULT_PAYMENTS);
export const useWelfareSettings = () => useSettingsDoc<WelfareSettings>('welfare', DEFAULT_WELFARE);

export const isLocalAddress = (origin: string) => /localhost|127\.0\.0\.1|192\.168\.|10\.\d+\./.test(origin);

/**
 * The address people outside should open (QR codes, SMS links, donation pages).
 * When the app is opened on a computer (localhost) a phone cannot reach it, so we use the
 * public address instead: the one saved in settings, or the free Firebase Hosting address.
 */
export function publicBase(p: PaymentSettings): string {
  if (p.publicSiteUrl) return p.publicSiteUrl.replace(/\/+$/, '');
  const origin = window.location.origin;
  return isLocalAddress(origin) ? `https://${firebaseConfig.projectId}.web.app` : origin;
}
