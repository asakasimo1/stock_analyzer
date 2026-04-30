/**
 * JSONBin.io 헬퍼 — 읽기/쓰기 + 인스턴스 내 캐시
 * 환경변수: JSONBIN_KEY, JSONBIN_BIN_ID
 */
const BASE = 'https://api.jsonbin.io/v3/b';
const TTL_MS = 300_000; // 5분

let _cache = null;
let _cacheAt = 0;

/**
 * @param {boolean} fresh - true이면 캐시 무시하고 강제로 JSONBin에서 읽기 (쓰기 직전에 사용)
 */
export async function readBin(binId, key, fresh = false) {
  const now = Date.now();
  if (!fresh && _cache && now - _cacheAt < TTL_MS) return _cache;

  const r = await fetch(`${BASE}/${binId}/latest`, {
    headers: { 'X-Master-Key': key },
  });
  if (!r.ok) throw new Error(`JSONBin read ${r.status}`);
  const { record } = await r.json();
  const data = record ?? {}; // null 방어
  _cache = data;
  _cacheAt = now;
  return data;
}

export async function writeBin(binId, key, data) {
  const r = await fetch(`${BASE}/${binId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Key': key,
    },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`JSONBin write ${r.status}`);
  _cache = null;
  _cacheAt = 0;
  return (await r.json()).record;
}
