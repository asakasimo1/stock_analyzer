// GET /api/coin-price?markets=KRW-BTC,KRW-SOL
// Upbit 현재가 프록시 (CORS 우회)
export default async function handler(req, res) {
  const { markets } = req.query;
  if (!markets) return res.status(400).json({ error: 'markets 파라미터 필요' });

  try {
    const r = await fetch(`https://api.upbit.com/v1/ticker?markets=${encodeURIComponent(markets)}`);
    if (!r.ok) return res.status(r.status).json({ error: 'Upbit API 오류' });
    const data = await r.json();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
