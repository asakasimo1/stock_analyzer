/**
 * GitHub Gist 인스턴스 내 메모리 캐시
 * - Vercel은 함수 인스턴스를 재사용하므로 TTL 내 반복 호출 시 GitHub API 절감
 * - CDN s-maxage 캐시와 함께 사용하면 Rate Limit 위험 대폭 감소
 */
const TTL_MS = 30_000; // 30초

let _cache = null;
let _cacheAt = 0;

/**
 * Gist 전체를 가져오되, TTL 내라면 캐시된 응답을 반환
 */
export async function fetchGistCached(gistId, ghToken) {
  const now = Date.now();
  if (_cache && now - _cacheAt < TTL_MS) return _cache;

  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'stock-analyzer',
    ...(ghToken ? { Authorization: `Bearer ${ghToken}` } : {}),
  };
  const r = await fetch(`https://api.github.com/gists/${gistId}`, { headers });
  if (!r.ok) throw new Error(`GitHub API ${r.status}`);

  _cache = await r.json();
  _cacheAt = now;
  return _cache;
}

/**
 * 쓰기(POST/DELETE) 후 반드시 호출해 캐시 무효화
 */
export function invalidateGistCache() {
  _cache = null;
  _cacheAt = 0;
}
