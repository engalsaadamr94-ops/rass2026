import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE, userFromToken } from '@/lib/auth';
import { row } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const n = await row('select count(*)::int as n from users').catch(() => null);
  if (n && n.n === 0) redirect('/setup');
  const u = await userFromToken((await cookies()).get(COOKIE)?.value);
  if (!u) redirect('/login');
  if (u.must_change) redirect('/change-password');
  return (
    <>
      <header className="top">
        <div className="brand"><img id="brandImg" alt="" src="/logo.png" /><div><b>عروض وعقود رسس</b><small id="saveState">جارٍ التحميل…</small></div></div>
        <nav className="tabs" id="tabs"></nav>
        <div className="tools" id="tools"></div>
      </header>
      <main id="main"><div className="empty">جارٍ تحميل البيانات…</div></main>
      <div id="printArea" className="doc-root"></div>
      <div id="toast" className="toast" hidden></div>
      <div id="modal" className="modal" hidden></div>
      <datalist id="grpList"></datalist>
      <datalist id="custList"></datalist>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js" defer></script>
      <script src="/doc.js" defer></script>
      <script src="/vendor/qr.js" defer></script>
      <script src="/app.js" defer></script>
      <script src="/fin.js" defer></script>
      <script src="/speed.js" defer></script>
      <script src="/mem.js" defer></script>
      <script src="/sub.js" defer></script>
      <script src="/fup.js" defer></script>
    </>
  );
}
