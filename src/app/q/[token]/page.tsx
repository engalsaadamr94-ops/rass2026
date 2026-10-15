export const dynamic = 'force-dynamic';

export default async function PublicQuote({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="pq" data-token={token}>
      <div className="pq-top"><img src="/logo.png" alt="رسس" /><div id="pq-title">عرض السعر</div></div>
      <div id="pq-body"><div className="empty">جارٍ تحميل العرض…</div></div>
      <script src="/doc.js" defer></script>
      <script src="/q.js" defer></script>
    </div>
  );
}
