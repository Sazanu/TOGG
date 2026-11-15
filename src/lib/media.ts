import { ref, uploadBytes } from 'firebase/storage';
import { storage } from './firebase';
import { useSettingsDoc } from './settings';

/**
 * Where voice notes and videos are kept.
 *  - 'cloudinary': FREE (Cloudinary free plan, ~25 GB/month, no card). Uploads go straight from the
 *    browser using an *unsigned upload preset*, so no server or Blaze plan is needed.
 *  - 'firebase':   Firebase Storage (needs the Blaze plan on projects created after Oct 2024).
 */
export interface MediaSettings { provider: 'firebase' | 'cloudinary'; cloudName: string; uploadPreset: string }
export const DEFAULT_MEDIA: MediaSettings = { provider: 'cloudinary', cloudName: '', uploadPreset: '' };
export const useMediaSettings = () => useSettingsDoc<MediaSettings>('media', DEFAULT_MEDIA);

export function mediaReady(s: MediaSettings): boolean {
  return s.provider === 'firebase' || (!!s.cloudName && !!s.uploadPreset);
}

export async function uploadPrayerMedia(requestId: string, blob: Blob, kind: 'audio' | 'video', s: MediaSettings): Promise<{ mediaPath: string; mediaUrl: string }> {
  const type = blob.type || (kind === 'audio' ? 'audio/webm' : 'video/mp4');
  if (s.provider === 'cloudinary') {
    if (!s.cloudName || !s.uploadPreset) throw new Error('Voice notes and videos are not set up yet. Please type your message instead.');
    const form = new FormData();
    form.append('file', blob, `${kind}-${requestId}`);
    form.append('upload_preset', s.uploadPreset);
    form.append('folder', 'togg-prayer');
    form.append('public_id', `${requestId}-${kind}-${crypto.getRandomValues(new Uint32Array(2)).join('')}`);
    // Cloudinary keeps audio under the "video" resource type.
    const res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(s.cloudName)}/video/upload`, { method: 'POST', body: form });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.secure_url) throw new Error(`Upload failed: ${json.error?.message ?? res.status}`);
    return { mediaPath: '', mediaUrl: String(json.secure_url) };
  }
  const ext = type.includes('mp4') ? 'mp4' : type.includes('ogg') ? 'ogg' : type.includes('quicktime') ? 'mov' : 'webm';
  const mediaPath = `prayer/${requestId}/${kind}.${ext}`;
  await uploadBytes(ref(storage, mediaPath), blob, { contentType: type });
  return { mediaPath, mediaUrl: '' };
}
