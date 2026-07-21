// /api/consult — 보상 상담 신청서 서버 전송 (Vercel Serverless + Resend)
//
// [배포 준비]
// 1. Vercel 프로젝트 → Settings → Environment Variables 에 추가:
//    RESEND_API_KEY  = re_로 시작하는 Resend API 키
//    CONSULT_FROM    = 발신 주소 (Resend에서 인증한 도메인, 예: "도연 토지보상센터 <consult@bosang.center>")
//    CONSULT_TO      = 수신 주소 (기본값: lawpark2025@naver.com)
// 2. Resend 대시보드 → Domains 에서 bosang.center 인증 (DNS 레코드 추가)
// 3. 이 파일을 저장소 루트의 /api/consult.js 경로에 두고 배포하면 끝.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { district, address, targets, topics, name, phone, email, body } = req.body || {};

  // 필수값 검증 (프런트와 동일 기준)
  if (!name || !phone || (!district && !address)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // 간단한 남용 방지: 과도한 길이 차단
  const tooLong = [district, address, name, phone, email].some(
    (v) => typeof v === 'string' && v.length > 200
  );
  if (tooLong || (body && body.length > 5000)) {
    return res.status(400).json({ error: 'Payload too large' });
  }

  const subject =
    '[보상 상담 신청] ' +
    (district || address) +
    (Array.isArray(topics) && topics.length ? ' · ' + topics[0] : '');

  const esc = (v) =>
    String(v ?? '-').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const html = `
    <div style="font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; max-width: 560px; margin: 0 auto; border: 1px solid #E5DFD2; border-top: 3px solid #193666; border-radius: 12px; padding: 28px;">
      <h2 style="margin: 0 0 20px; font-size: 18px; color: #193666;">보상 상담 신청서</h2>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px; line-height: 1.7;">
        <tr><td style="width: 110px; color: #8A8A8A; padding: 6px 0;">사업지구</td><td>${esc(district)}</td></tr>
        <tr><td style="color: #8A8A8A; padding: 6px 0;">소재지(지번)</td><td>${esc(address)}</td></tr>
        <tr><td style="color: #8A8A8A; padding: 6px 0;">보상 대상</td><td>${esc(Array.isArray(targets) && targets.length ? targets.join(', ') : '-')}</td></tr>
        <tr><td style="color: #8A8A8A; padding: 6px 0;">문의사항</td><td>${esc(Array.isArray(topics) && topics.length ? topics.join(', ') : '-')}</td></tr>
        <tr><td colspan="2" style="border-top: 1px solid #EEE8DC; padding-top: 12px;"></td></tr>
        <tr><td style="color: #8A8A8A; padding: 6px 0;">성함</td><td><strong>${esc(name)}</strong></td></tr>
        <tr><td style="color: #8A8A8A; padding: 6px 0;">휴대전화</td><td><a href="tel:${esc(phone)}">${esc(phone)}</a></td></tr>
        <tr><td style="color: #8A8A8A; padding: 6px 0;">이메일</td><td>${esc(email)}</td></tr>
      </table>
      <p style="margin: 20px 0 0; font-size: 12px; color: #8A8A8A;">
        ※ 개인정보 수집·이용 동의함 · bosang.center 상담 신청서에서 전송된 메일입니다.
      </p>
    </div>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.CONSULT_FROM || '도연 토지보상센터 <onboarding@resend.dev>',
        to: [process.env.CONSULT_TO || 'lawpark2025@naver.com'],
        reply_to: email || undefined,
        subject,
        html,
        text: body || undefined,
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      console.error('Resend error:', detail);
      return res.status(502).json({ error: 'Mail send failed' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}
