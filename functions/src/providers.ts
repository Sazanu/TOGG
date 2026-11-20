/** SMS gateways used in Ghana. Each returns how many messages were accepted. */
export interface SendResult { sent: number; failed: number; error?: string; response?: string }
/** Words in a Gonlinesites reply that mean the SMS was NOT sent. */
export const GONLINE_ERROR = /error|invalid|insufficient|fail|denied|wrong|incorrect|not ?allowed|unauthori[sz]ed|low balance/i;
export interface Provider { name: string; send(to: string[], text: string): Promise<SendResult> }

export interface ProviderConfig { provider: string; senderId: string; apiKey: string }

/** For tests and dry runs: records messages instead of sending them. */
export const sentLog: { to: string[]; text: string }[] = [];

async function post(url: string, body: unknown, headers: Record<string, string> = {}): Promise<{ ok: boolean; status: number; json: any; text: string }> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers }, body: JSON.stringify(body) });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { ok: res.ok, status: res.status, json, text };
}

export function makeProvider(cfg: ProviderConfig): Provider {
  const sender = (cfg.senderId || 'TOGG').slice(0, 11);
  switch (cfg.provider) {
    case 'arkesel':
      return {
        name: 'arkesel',
        async send(to, text) {
          const r = await post('https://sms.arkesel.com/api/v2/sms/send', { sender, message: text, recipients: to }, { 'api-key': cfg.apiKey });
          if (r.ok && r.json?.status === 'success') return { sent: to.length, failed: 0 };
          return { sent: 0, failed: to.length, error: `Arkesel ${r.status}: ${r.json?.message ?? r.text.slice(0, 200)}` };
        },
      };
    case 'mnotify':
      return {
        name: 'mnotify',
        async send(to, text) {
          const r = await post(`https://api.mnotify.com/api/sms/quick?key=${encodeURIComponent(cfg.apiKey)}`, {
            recipient: to, sender, message: text, is_schedule: false, schedule_date: '',
          });
          if (r.ok && (r.json?.status === 'success' || String(r.json?.code) === '2000')) return { sent: to.length, failed: 0 };
          return { sent: 0, failed: to.length, error: `mNotify ${r.status}: ${r.json?.message ?? r.text.slice(0, 200)}` };
        },
      };
    case 'gonlinesites':
      return {
        name: 'gonlinesites',
        async send(to, text) {
          const q = `action=send-sms&api_key=${encodeURIComponent(cfg.apiKey)}&to=${encodeURIComponent(to.join(','))}&from=${encodeURIComponent(sender)}&sms=${encodeURIComponent(text)}`;
          let res: Response;
          try { res = await fetch(`https://sms.gonlinesites.com/app/sms/api?${q}`); } catch { res = await fetch(`http://sms.gonlinesites.com/app/sms/api?${q}`); }
          const body = await res.text();
          if (res.ok && !GONLINE_ERROR.test(body)) return { sent: to.length, failed: 0, response: body.slice(0, 300) };
          return { sent: 0, failed: to.length, error: `Gonlinesites ${res.status}: ${body.slice(0, 200)}` };
        },
      };
    case 'hubtel': {
      // API key is stored as "clientId:clientSecret"
      const [clientId, clientSecret] = cfg.apiKey.split(':');
      return {
        name: 'hubtel',
        async send(to, text) {
          let sent = 0; let failed = 0; let error: string | undefined;
          for (const n of to) {
            const url = `https://smsc.hubtel.com/v1/messages/send?clientid=${encodeURIComponent(clientId)}&clientsecret=${encodeURIComponent(clientSecret ?? '')}&from=${encodeURIComponent(sender)}&to=${n}&content=${encodeURIComponent(text)}`;
            const res = await fetch(url);
            if (res.ok) sent++; else { failed++; error = `Hubtel ${res.status}: ${(await res.text()).slice(0, 200)}`; }
          }
          return { sent, failed, error };
        },
      };
    }
    case 'log':
    default:
      return {
        name: 'log',
        async send(to, text) {
          sentLog.push({ to: [...to], text });
          console.log(`[sms:dry-run] to ${to.length}: ${text}`);
          return { sent: to.length, failed: 0 };
        },
      };
  }
}
