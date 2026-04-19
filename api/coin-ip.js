/**
 * Vercel 아웃바운드 IP 확인용 엔드포인트
 * 업비트 API 키에 등록할 IP 주소를 확인할 때 사용
 *
 * GET /api/coin-ip  → Vercel 서버가 외부로 요청할 때 사용하는 IP 반환
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    // 외부 IP 확인 서비스를 통해 Vercel 아웃바운드 IP 조회
    const r = await fetch('https://api.ipify.org?format=json');
    const d = await r.json();
    return res.status(200).json({
      ip: d.ip,
      message: '이 IP 주소를 업비트 API 키에 등록하세요',
      guide: '업비트 → 마이페이지 → Open API 관리 → API 키 생성 → IP 주소 입력란에 위 IP 입력',
    });
  } catch (e) {
    return res.status(500).json({ error: 'IP 조회 실패', detail: e.message });
  }
}
