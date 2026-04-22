/**
 * Vercel API — GitHub Gist에서 account_balance.json만 읽기
 * GET /api/account → account_balance 객체
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const gistId  = process.env.GIST_ID;
  const ghToken = process.env.GH_TOKEN;

  if (!gistId) return res.status(500).json({ error: 'GIST_ID not configured' });

  try {
    const r = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'stock-analyzer',
        ...(ghToken ? { Authorization: `Bearer ${ghToken}` } : {}),
      },
    });
    if (!r.ok) return res.status(r.status).json({ error: `GitHub API error: ${r.status}` });

    const gist = await r.json();
    const file  = (gist.files || {})['account_balance.json'];
    const data  = file ? JSON.parse(file.content || 'null') : null;

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ account_balance: data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
