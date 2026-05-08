/**
 * JSONBin.io 헬퍼 — 읽기/쓰기 + 인스턴스 내 캐시 (stale-while-revalidate)
 * 환경변수: JSONBIN_KEY, JSONBIN_BIN_ID
 */
const BASE = 'https://api.jsonbin.io/v3/b';
const TTL_MS       = 300_000;  // 5분 (fresh 범위)
const STALE_TTL_MS = 600_000;  // 10분 (stale-while-revalidate 허용 범위)

let _cache        = null;
let _cacheAt      = 0;
let _bgRefreshing = false;

async function _doFetch(binId, key) {
  const r = await fetch(`${BASE}/${binId}/latest`, {
    headers: { 'X-Master-Key': key },
  });
  if (!r.ok) throw new Error(`JSONBin read ${r.status}`);
  const { record } = await r.json();
  _cache   = record ?? {};
  _cacheAt = Date.now();
  return _cache;
}

/**
 * @param {boolean} fresh - true이면 캐시 무시하고 강제로 JSONBin에서 읽기 (쓰기 직전에 사용)
 */
export async function readBin(binId, key, fresh = false) {
  if (fresh) return _doFetch(binId, key);

  const now = Date.now();
  const age = now - _cacheAt;

  // 캐시 유효 (5분 이내)
  if (_cache && age < TTL_MS) return _cache;

  // stale (5~10분): 즉시 반환 + 백그라운드 갱신
  if (_cache && age < STALE_TTL_MS) {
    if (!_bgRefreshing) {
      _bgRefreshing = true;
      _doFetch(binId, key).catch(() => {}).finally(() => { _bgRefreshing = false; });
    }
    return _cache;
  }

  // 캐시 없거나 만료(10분 초과): 대기 후 반환
  return _doFetch(binId, key);
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
  _cache   = null;
  _cacheAt = 0;
  return (await r.json()).record;
}
