// Image asset upload client.
//
// Posts raw image bytes to the dev-server asset endpoint (see vite.config.js),
// which stores them on disk under data/assets/<hash>.<ext> and returns a short
// URL. Only that URL is ever embedded in notes markdown / persisted state — the
// bytes never live in state.json, which keeps persistence small and scalable.

const ENDPOINT = '/api/assets';

// Upload a Blob/File and resolve to its served URL (e.g. "/api/assets/ab12.png").
// Throws on failure so callers can surface an error.
export async function uploadImage(blob) {
  const type = (blob && blob.type) || 'application/octet-stream';
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': type },
    body: blob,
  });
  if (!res.ok) throw new Error('Upload failed: HTTP ' + res.status);
  const data = await res.json();
  if (!data || !data.url) throw new Error('Upload failed: no url in response');
  return data.url;
}
