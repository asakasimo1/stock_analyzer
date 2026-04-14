/**
 * JSONBin.io 헬퍼 — 읽기/쓰기 + 30초 인스턴스 내 캐시
 * 환경변수: JSONBIN_KEY, JSONBIN_BIN_ID
 */
const BASE = 'https://api.jsonbin.io/v3/b';
const TTL_MS = 30_000;

let _cache = null;
let _cacheAt = 0;

export async function readBin(binId, key) {
  const now = Date.now();
  if (_cache && now - _cacheAt < TTL_MS) return _cache;

  const r = await fetch(`${BASE}/${binId}/latest`, {
    headers: { 'X-Master-Key': key },
  });
  if (!r.ok) throw new Error(`JSONBin read ${r.status}`);
  const { record } = await r.json();
  _cache = record;
  _cacheAt = now;
  return record;
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
