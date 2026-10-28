/* サーバー（/api/…）との通信。失敗の理由を利用者に伝えられる形にそろえます。 */

export class ApiError extends Error {
  constructor(message, kind, status) { super(message); this.name = 'ApiError'; this.kind = kind; this.status = status; }
}

export async function api(path, { method, body, timeout = 15000, redirectOn401 = true } = {}) {
  if (location.protocol === 'file:') {
    throw new ApiError('HTMLファイルを直接開いているため、データを読み込めません。start-windows.bat（Macは start-mac.command）で起動し、表示されたURLを開いてください。', 'file');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(path, {
      method: method || (body ? 'POST' : 'GET'),
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      signal: controller.signal,
    });
    if (res.status === 401 && redirectOn401) {
      location.replace('/index.html?error=login_required');
      throw new ApiError('ログインの有効期限が切れました。ログイン画面へ移動します。', 'unauthorized', 401);
    }
    const type = res.headers.get('content-type') || '';
    if (!type.includes('application/json')) {
      throw new ApiError(`${path} がデータではなく別の応答を返しました（HTTP ${res.status}）。npm start で起動したアプリのURLを開いてください。`, 'wrong-server', res.status);
    }
    let data;
    try { data = await res.json(); } catch { throw new ApiError(`${path} の応答を読み取れませんでした。`, 'invalid-response', res.status); }
    if (!res.ok) throw new ApiError(data?.error || `通信に失敗しました（HTTP ${res.status}）。`, 'http', res.status);
    return data;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e.name === 'AbortError') throw new ApiError('サーバーの応答がありません。起動状態を確認して、もう一度お試しください。', 'timeout');
    throw new ApiError('サーバーにつながりませんでした。アプリのサーバーが起動しているか確認してください。', 'network');
  } finally {
    clearTimeout(timer);
  }
}

export const yen = (n) => `${Number(n || 0).toLocaleString('ja-JP')}円`;
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const when = (iso) => {
  if (!iso) return '';
  const d = new Date(String(iso).includes('T') ? iso : String(iso).replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return String(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'たった今';
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}日前`;
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' });
};
