/**
 * Oracle VM stock-data API 헬퍼
 * JSONBin 대체 — Oracle VM coin-runner :3000/api/stock-data
 *
 * 환경변수:
 *   ORACLE_DATA_URL  — http://158.180.84.109:3000/api/stock-data
 *   ORACLE_DATA_KEY  — X-Api-Key 인증 키
 */

const TTL_MS       = 300_000;  // 5분 fresh
const STALE_TTL_MS = 600_000;  // 10분 stale-while-revalidate

let _cache        = null;
let _cacheAt      = 0;
let _bgRefreshing = false;

function getConfig() {
  const url = process.env.ORACLE_DATA_URL;
  const key = process.env.ORACLE_DATA_KEY;
  if (!url || !key) throw new Error('ORACLE_DATA_URL / ORACLE_DATA_KEY 환경변수 미설정');
  return { url, key };
}

async function _doFetch(url, key) {
  const r = await fetch(url, {
    headers: { 'x-api-key': key, 'Cache-Control': 'no-store' },
  });
  if (!r.ok) throw new Error(`Oracle VM read ${r.status}`);
  const data = await r.json();
  _cache   = data;
  _cacheAt = Date.now();
  return _cache;
}

/**
 * @param {boolean} fresh - true이면 캐시 무시하고 강제로 읽기
 */
export async function readBin(_binId, _key, fresh = false) {
  const { url, key } = getConfig();
  if (fresh) return _doFetch(url, key);

  const now = Date.now();
  const age = now - _cacheAt;

  if (_cache && age < TTL_MS) return _cache;

  if (_cache && age < STALE_TTL_MS) {
    if (!_bgRefreshing) {
      _bgRefreshing = true;
      _doFetch(url, key).catch(() => {}).finally(() => { _bgRefreshing = false; });
    }
    return _cache;
  }

  return _doFetch(url, key);
}

/**
 * data 전체를 PUT으로 교체
 */
export async function writeBin(_binId, _key, data) {
  const { url, key } = getConfig();
  const r = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
    },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`Oracle VM write ${r.status}`);
  _cache   = null;
  _cacheAt = 0;
  return (await r.json());
}
