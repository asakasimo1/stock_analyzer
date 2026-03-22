/**
 * Vercel API — GitHub Gist에서 분석 결과 읽기
 * GET /api/data?type=briefing|picks|signals
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const gistId = process.env.GIST_ID;
  if (!gistId) {
    return res.status(500).json({ error: 'GIST_ID not configured' });
  }

  try {
    const r = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'stock-analyzer',
        ...(process.env.GH_TOKEN ? { Authorization: `Bearer ${process.env.GH_TOKEN}` } : {}),
      },
    });

    if (!r.ok) {
      return res.status(r.status).json({ error: `GitHub API error: ${r.status}` });
    }

    const gist = await r.json();
    const files = gist.files || {};

    const result = {
      briefing: [],
      picks:    [],
      signals:  [],
    };

    for (const [key, fileObj] of Object.entries(files)) {
      try {
        const data = JSON.parse(fileObj.content || '[]');
        if (key === 'briefing.json') result.briefing = data;
        if (key === 'picks.json')    result.picks    = data;
        if (key === 'signals.json')  result.signals  = data;
      } catch (_) {}
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(result);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
