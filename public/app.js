(()=>{
'use strict';
const R=window.RASS;
const {esc,n0,r2,fmt,qtyF,norm,fmtDate,today,ORD,sarWords,groupLines,lineTot,calc,pctSum,payRows}=R;
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const LT='rass-theme';
const uid=()=>{const a=new Uint8Array(9);crypto.getRandomValues(a);return Array.from(a,b=>'abcdefghijklmnopqrstuvwxyz0123456789'[b%36]).join('')};
const ROLE_LBL={admin:'مدير',accountant:'محاسب',sales:'مبيعات',viewer:'مشاهد'};
let S=null,ME=null;
const P=()=>ME.perms;

/* ---------- API ---------- */
async function api(method,path,data){
  const r=await fetch('/api'+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-Requested-With':'rass'},body:data?JSON.stringify(data):undefined});
  let j={};try{j=await r.json()}catch(e){}
  if(r.status===401){location.href='/login';throw Object.assign(new Error('انتهت الجلسة'),{status:401})}
  if(r.status===403&&j.code==='must_change'){location.href='/change-password';throw Object.assign(new Error(j.error),{status:403})}
  if(!r.ok){throw Object.assign(new Error(j.error||'تعذر تنفيذ الطلب'),{status:r.status,code:j.code})}
  return j}
function toast(m){const t=$('#toast');t.textContent=m;t.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>t.hidden=true,3200)}
function toastUndo(m,fn){const t=$('#toast');t.innerHTML='';t.append(m+' ');const b=document.createElement('button');b.type='button';b.className='btn sm';b.textContent='تراجع';b.onclick=()=>{t.hidden=true;fn()};t.append(b);t.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>t.hidden=true,6000)}
const fail=e=>{if(e&&e.status!==401)toast(e.message||'تعذر تنفيذ الطلب')};

/* ---------- autosave: diff the state against the last server snapshot and send only what changed ---------- */
const SNAP={settings:'',items:{},customers:{},quotes:{}};
const ser=e=>JSON.stringify(e,(k,v)=>k[0]==='_'?undefined:v);
const serS=e=>JSON.stringify(e,(k,v)=>k[0]==='_'||k==='nextSeq'||k==='rcNext'||k==='invNext'||k==='agNext'?undefined:v);
function snapshot(){SNAP.settings=serS(S.settings);['items','customers','quotes'].forEach(k=>{SNAP[k]={};S[k].forEach(e=>SNAP[k][e.id]=ser(e))})}
const withV=(e,f=ser)=>{const o=JSON.parse(f(e));o._v=e._v;return o};
function diff(){
  const b={},sent={settings:null,items:{},customers:{},quotes:{},del:{items:[],customers:[],quotes:[]}};let any=false;
  const sj=serS(S.settings);
  if(P().settingsWrite&&sj!==SNAP.settings){b.settings=withV(S.settings,serS);sent.settings=sj;any=true}
  [['items',P().itemsWrite],['customers',P().customersWrite],['quotes',P().quotesWrite!=='none']].forEach(([k,ok])=>{
    if(!ok)return;const put=[],del=[];
    S[k].forEach(e=>{const j=ser(e);if(SNAP[k][e.id]!==j){put.push(withV(e));sent[k][e.id]=j}});
    Object.keys(SNAP[k]).forEach(id=>{if(!S[k].some(e=>e.id===id)){del.push(id);sent.del[k].push(id)}});
    if(put.length||del.length){b[k]={put,del};any=true}});
  return any?{payload:b,sent}:null}
let saving=false,again=false,saveT=null,failTimer=null,lastSync=Date.now();
function setState(t,bad){const el=$('#saveState');if(el){el.textContent=t;el.style.color=bad?'var(--bad)':''}}
function save(){clearTimeout(saveT);if(!S)return;setState('جارٍ الحفظ…');saveT=setTimeout(flush,500)}
async function flush(){
  if(saving){again=true;return}
  const d=diff();if(!d){setState('محفوظ على الخادم');return}
  saving=true;
  try{const res=await api('POST','/sync',d.payload);applySync(d.sent,res);lastSync=Date.now();setState('محفوظ على الخادم')}
  catch(e){if(e.status===401)return;setState('تعذر الحفظ، سنعيد المحاولة…',true);clearTimeout(failTimer);failTimer=setTimeout(flush,5000)}
  saving=false;if(again){again=false;flush()}}
function applySync(sent,res){
  const V=res.versions||{};
  if(sent.settings!=null){SNAP.settings=sent.settings;if(V.settings)S.settings._v=V.settings}
  ['items','customers','quotes'].forEach(k=>{
    Object.keys(sent[k]).forEach(id=>{SNAP[k][id]=sent[k][id];const e=S[k].find(x=>x.id===id);if(e&&V[k]&&V[k][id])e._v=V[k][id]});
    sent.del[k].forEach(id=>delete SNAP[k][id])});
  Object.entries(res.quotes||{}).forEach(([id,sf])=>{const q=S.quotes.find(x=>x.id===id);if(q){Object.assign(q,{status:sf.status,no:sf.no,_approval:sf._approval,_v:sf._v});SNAP.quotes[id]=ser(q)}});
  let rerender=false;
  (res.rejected||[]).forEach(x=>{
    const kk={quote:'quotes',customer:'customers',item:'items',settings:'settings'}[x.kind];toast(x.reason);rerender=true;
    if(kk==='settings'){if(x.current){S.settings=x.current;SNAP.settings=serS(x.current)}return}
    const i=S[kk].findIndex(e=>e.id===x.id);
    if(x.current){if(i>=0)S[kk][i]=x.current;else S[kk].push(x.current);SNAP[kk][x.id]=ser(x.current)}
    else if(i>=0){S[kk].splice(i,1);delete SNAP[kk][x.id]}});
  (res.warnings||[]).forEach(w=>{toast(w.text);rerender=true});
  if(rerender){if(!S.quotes.some(q=>q.id===S.ui.qid))S.ui.qid=(S.quotes[0]||{}).id;render()}
  else if(S.ui.view==='quote'||S.ui.view==='contract'){const q=curQ();if(q){const st=$('[data-f=status]');if(st&&st.value!==q.status)st.value=q.status;S.ui.view==='quote'?refreshQ():refreshC()}}}
window.addEventListener('beforeunload',e=>{if(saving||saveT&&diff()){e.preventDefault();e.returnValue=''}});
async function counters(){try{const r=await api('PUT','/counters',{nextSeq:S.settings.nextSeq,rcNext:S.settings.rcNext,invNext:S.settings.invNext,agNext:S.settings.agNext});Object.assign(S.settings,{nextSeq:r.nextSeq,rcNext:r.rcNext,invNext:r.invNext,agNext:r.agNext})}catch(e){fail(e)}}
let cntT;const cntSave=()=>{clearTimeout(cntT);cntT=setTimeout(counters,700)};

/* ---------- permissions (the server enforces the same rules) ---------- */
const isOwner=q=>q._owner===ME.id;
function qMode(q){const p=P();if(p.quotesWrite==='all')return 'full';if(p.quotesWrite==='due')return 'due';if(p.quotesWrite==='own'&&isOwner(q))return q.status==='won'?'contract':'full';return null}
const canQ=q=>!!q&&qMode(q)==='full';
const canC=q=>!!q&&['full','contract'].includes(qMode(q));
const canCreateQ=()=>['all','own'].includes(P().quotesWrite);
const LR=()=>S.receipts.filter(r=>!r.void);

const curQ=()=>S.quotes.find(q=>q.id===S.ui.qid);
const cTotal=q=>R.cTotal(q);
function ensureContract(q){
  if(!q.contract){if(!canC(q))return null;const s=S.settings;q.contract={date:today(),party2:q.client,duration:30,override:'',items:true,stamp:true,intro:s.cintro,terms:s.cterms,paynote:s.cpaynote,close:s.cclose,payments:s.pay.map(p=>({id:uid(),label:p.label,pct:p.pct,due:''}))};save()}
  return q.contract}

/* ---------- documents (shared builders) ---------- */
const wrap=(inner,t)=>R.wrap(S.settings,inner,t);
const itemsTable=R.itemsTable,summaryTable=R.summaryTable;
const stampImg=(cls,t)=>R.stampImg(S.settings,cls,t);
const quoteDoc=(q,t)=>R.quoteDoc(S.settings,q,t);
const contractDoc=(q,t)=>q.contract?R.contractDoc(S.settings,q,t):'';
/* the company's own uploaded fonts are injected once per page (not inside every document) */
function syncFonts(){let st=document.getElementById('rassFonts');if(!st){st=document.createElement('style');st.id='rassFonts';document.head.appendChild(st)}const c=R.fontCss(S.settings);if(st.textContent!==c)st.textContent=c}

/* ---------- views ---------- */
const main=$('#main');
function go(view,qid){if(!canView(view))view=defView();if(S.ui.view==='takeoff'&&view!=='takeoff'&&window.TKU&&window.TKU.st.tk)window.TKU.save();S.ui.view=view;if(qid)S.ui.qid=qid;render();window.scrollTo(0,0)}
const TABS=[['dash','اللوحة'],['archive','العروض'],['quote','عرض السعر'],['contract','العقد'],['customers','العملاء'],['payments','الدفعات'],['cycle','دورة العقد'],['rfq','طلبات الأسعار'],['takeoff','حصر الكميات'],['agreements','الاتفاقيات'],['invoices','الفواتير'],['library','المكتبة'],['reports','التقارير'],['templates','القوالب'],['settings','الإعدادات'],['users','المستخدمون'],['audit','السجل']];
function renderTabs(){
  const has=!!curQ(),v=S.ui.view,cur={customer:'customers',receipt:'payments'}[v]||v,pn=pendingN();
  $('#tabs').innerHTML=TABS.filter(x=>canView(x[0])).map(x=>`<button type="button" class="tab" data-act="nav" data-v="${x[0]}" ${cur===x[0]?'aria-current="page"':''} ${(x[0]==='quote'||x[0]==='contract')&&!has?'disabled':''}>${x[1]}${x[0]==='dash'&&pn?`<span class="pending-dot">${pn}</span>`:''}</button>`).join('');
  const bi=$('#brandImg');if(S.settings.stamp)bi.src=S.settings.stamp;else bi.src='/logo.png';
  $('#custList').innerHTML=S.customers.map(c=>`<option value="${esc(c.name)}">`).join('');
  $('#grpList').innerHTML=[...new Set([...S.items.map(i=>i.cat),...S.quotes.flatMap(q=>q.lines.map(l=>l.group))])].filter(Boolean).map(g=>`<option value="${esc(g)}">`).join('');
}
const STATUS={draft:['مسودة',''],sent:['مرسل للعميل','warn'],won:['معتمد','ok'],lost:['ملغي','bad'],superseded:['مستبدل','']};
function render(){if(!canView(S.ui.view))S.ui.view=defView();syncFonts();renderTabs();({templates:vTemplates,invoices:()=>window.FIN.mountInvoices(),agreements:vAgreements,cycle:vCycle,rfq:vRfq,dash:vDash,archive:vArchive,quote:vQuote,contract:vContract,customers:vCustomers,customer:vCustomer,payments:vPayments,receipt:vReceipt,library:vLibrary,takeoff:vTakeoff,settings:vSettings,reports:vReports,users:vUsers,audit:vAudit}[S.ui.view]||vDash)();window.FUP&&window.FUP.after(S.ui.view);applyAccess()}

function vArchive(){
  const list=S.quotes.map(q=>({q,c:calc(q)}));
  const total=r2(list.reduce((a,x)=>a+x.c.total,0));
  main.innerHTML=`<div class="title-row"><h1>العروض والعقود</h1><div class="sp"></div><button class="btn pri" type="button" data-act="new-quote">عرض سعر جديد</button></div>
  <div class="stats" style="margin-bottom:14px"><span>العروض: <b>${S.quotes.length}</b></span><span>العقود: <b>${S.quotes.filter(q=>q.contract).length}</b></span><span>مجموع العروض: <b>${fmt(total)}</b> ر.س</span><span>العملاء: <b>${S.customers.length}</b></span><span class="rc-col">المقبوض: <b>${fmt(sumR(LR()))}</b> ر.س</span></div>
  <div class="card"><div class="row" style="margin-bottom:12px"><input id="aq" placeholder="ابحث برقم العرض أو العميل أو المشروع" style="max-width:380px"></div>
  <div class="tablewrap"><table class="t"><thead><tr><th>الرقم</th><th>التاريخ</th><th>العميل</th><th>المشروع</th>${P().ownOnly?'':'<th>المسؤول</th>'}<th class="num">الإجمالي ر.س</th><th>الحالة</th><th></th></tr></thead><tbody id="arows"></tbody></table></div></div>`;
  const draw=()=>{const f=norm($('#aq').value);const rows=list.filter(x=>!f||norm(x.q.no+' '+x.q.client+' '+x.q.project).includes(f));
    $('#arows').innerHTML=rows.length?rows.map(({q,c})=>`<tr data-id="${q.id}"><td><b>${esc(q.no)}</b></td><td>${fmtDate(q.date)}</td><td>${esc(q.client)}</td><td>${esc(q.project)}</td>${P().ownOnly?'':`<td>${esc(q._ownerName||'')}</td>`}<td class="num">${fmt(c.total)}</td>
    <td>${qChips(q)}</td>
    <td><div class="row" style="justify-content:flex-end;flex-wrap:nowrap"><button class="btn sm" type="button" data-act="open">فتح</button>${q.contract||canQ(q)?`<button class="btn sm" type="button" data-act="open-c">${q.contract?'العقد':'إنشاء عقد'}</button>`:''}<button class="btn sm" type="button" data-act="dup">نسخ</button>${canDelQ(q)?'<button class="btn sm danger" type="button" data-act="del-q">حذف</button>':''}</div></td></tr>`).join(''):`<tr><td colspan="8" class="empty">لا توجد نتائج. ابدأ بعرض سعر جديد.</td></tr>`};
  draw();$('#aq').addEventListener('input',draw);
}

function vQuote(){
  const q=curQ();if(!q)return go('archive');
  const stOpts=Object.entries(STATUS).map(([k,v])=>`<option value="${k}" ${q.status===k?'selected':''}>${v[0]}</option>`).join('');
  main.innerHTML=`<div class="split"><section>
  <div class="title-row"><h1>عرض سعر <bdi dir="ltr">${esc(q.no)}</bdi></h1><div class="sp"></div><span class="chip" id="qchip"></span></div>
  <div class="card"><h3>بيانات العرض</h3><div class="grid">
    <label class="fld"><span>رقم العرض</span><input data-f="no" value="${esc(q.no)}" class="ltr"></label>
    <label class="fld"><span>التاريخ</span><input data-f="date" type="date" value="${esc(q.date)}"></label>
    <label class="fld"><span>مدة العرض (يوم)</span><input data-f="validity" type="number" min="0" value="${esc(q.validity)}"></label>
    <label class="fld"><span>الحالة</span><select data-f="status">${stOpts}</select></label>
    <label class="fld" id="lostBox" ${q.status==='lost'?'':'hidden'}><span>سبب الإلغاء / الخسارة</span><select data-f="lostReason"><option value="">— اختر —</option>${Object.entries(window.MEM?MEM.REASONS:{}).map(([k,v])=>`<option value="${k}" ${q.lostReason===k?'selected':''}>${v}</option>`).join('')}</select></label>
    <label class="fld"><span>قالب الطباعة</span><select data-f="tpl">${tplOpts(q.tpl,'quote')}</select></label></div>
    <div class="grid g2" style="margin-top:12px">
    <label class="fld"><span>العميل</span><input data-f="client" list="custList" autocomplete="off" value="${esc(q.client)}"><small class="muted" id="cl-hint" style="font-size:11px"></small></label>
    <label class="fld"><span>المشروع</span><input data-f="project" value="${esc(q.project)}"></label>
    <label class="fld"><span>الموقع</span><input data-f="location" value="${esc(q.location)}"></label>
    <label class="fld"><span>إعداد العرض</span><input data-f="preparedBy" value="${esc(q.preparedBy)}"></label></div></div>
  <div class="card"><h3>الأصناف <span class="muted" style="font-weight:400;font-size:12px">ابحث في المكتبة ثم Enter للإضافة</span></h3>
    <div class="srch"><input id="srch" placeholder="ابحث بالوصف أو النوع أو القسم، مثل: كاشف دخان" autocomplete="off"><div id="res" class="res" hidden></div></div>
    <div class="row" style="margin-top:10px"><button class="btn sm" type="button" data-act="add-line">إضافة سطر مخصص</button><span class="muted" style="font-size:12px" id="lcount"></span></div>
    <div class="row" id="qtools" style="margin-top:8px"></div>
    <div id="lines"></div></div>
  <div class="card"><h3>الإجماليات</h3><div class="tot" id="tot"></div></div>
  <div id="fincard"></div>
  <div class="card"><h3>الشروط والملاحظات <span class="muted" style="font-weight:400;font-size:12px">سطر لكل ملاحظة، ويمكن استخدام {BANK} و{IBAN}</span></h3><textarea data-f="notes" rows="7">${esc(q.notes)}</textarea></div>
  <div class="card" id="vers" hidden></div><div id="qextra"></div><div id="sharebox"></div>
  <div class="sticky-act"><button class="btn pri" type="button" data-act="print-q">طباعة / حفظ PDF</button><button class="btn red" type="button" data-act="to-contract">${q.contract?'فتح العقد':'تحويل إلى عقد'}</button><button class="btn" type="button" data-act="share-q">واتساب</button><button class="btn" type="button" data-act="new-rev">إصدار جديد</button><button class="btn" type="button" data-act="nav" data-v="archive">العروض</button></div>
  </section>
  <aside class="pv"><div class="bar"><b>معاينة Letter</b><span>تتحدث فوراً مع كل تعديل</span></div><div class="pv-wrap"><div class="sheet" id="sheet"></div></div></aside></div>`;
  buildTot();renderLines();refreshQ();clHint();fitPreview();window.SPD&&window.SPD.tools();
}
function buildTot(){const q=curQ();$('#tot').innerHTML=`<div id="tgroups" class="tot"></div>
  <div class="r"><span>الإجمالي قبل الضريبة</span><span class="v" id="t-sub"></span></div>
  <div class="r"><span>القيمة المضافة <span class="inl"><input data-f="vatRate" type="number" min="0" step="any" value="${esc(q.vatRate)}" aria-label="نسبة الضريبة"> %</span></span><span class="v" id="t-vat"></span></div>
  <div class="r"><span>الإجمالي شامل الضريبة</span><span class="v" id="t-gross"></span></div>
  <div class="r"><span>خصم خاص للعميل</span><span class="inl"><select id="d-mode" aria-label="نوع الخصم" style="width:auto"><option value="pct" ${q.discMode==='pct'?'selected':''}>نسبة %</option><option value="amt" ${q.discMode==='amt'?'selected':''}>مبلغ ر.س</option></select><input id="d-val" type="number" min="0" step="any" value="${esc(q.discMode==='amt'?q.discAmt:q.discPct)}" aria-label="قيمة الخصم"></span></div>
  <div class="r" style="margin-top:-2px"><span></span><span class="muted" id="d-eq" style="font-size:12px"></span></div>
  <div class="r big"><span>الصافي النهائي بعد الخصم</span><span class="v" id="t-total"></span></div>`}
function renderLines(focusId){
  const q=curQ(),g=groupLines(q.lines);
  $('#lines').innerHTML=q.lines.length?g.map((gr,gi)=>`<div class="grp"><b>${ORD[gi]||''}:</b><input data-gold="${esc(gr.name)}" value="${esc(gr.name)}" list="grpList" aria-label="اسم القسم"><span class="gs" data-gs="${esc(gr.name)}"></span></div>`+gr.lines.map(l=>`<div class="ln${l.est?' est':''}" data-lid="${l.id}">
    <textarea data-l="desc" rows="2" aria-label="الوصف">${esc(l.desc)}</textarea>
    <div class="ln-r"><label class="fld"><span>النوع</span><input data-l="brand" value="${esc(l.brand)}"></label>
    <label class="fld"><span>الوحدة</span><input data-l="unit" value="${esc(l.unit)}"></label>
    <label class="fld"><span>العدد</span><input data-l="qty" type="text" inputmode="decimal" autocomplete="off" title="يمكنك كتابة معادلة مثل 12*3+2" value="${esc(l.qty)}"></label>
    <label class="fld"><span>السعر${l.est?' <i class="estb">تقريبي</i>':''}<i class="dev" data-dev></i><i class="dev pm" data-pm></i></span><input data-l="price" type="number" min="0" step="any" value="${esc(l.price)}"></label>${P().seeCost?`<label class="fld"><span>التكلفة <i class="dev" data-mg></i></span><input data-l="cost" type="number" min="0" step="any" value="${esc(l.cost||'')}" placeholder="—"></label>`:''}
    <label class="fld"><span>القسم</span><input data-l="group" list="grpList" value="${esc(l.group)}"></label>
    <div class="fld"><span>الإجمالي</span><div class="ln-tot" data-lt></div></div>
    <div class="ln-act"><button class="ib" type="button" data-act="ln-up" title="للأعلى" aria-label="للأعلى">▲</button><button class="ib" type="button" data-act="ln-dn" title="للأسفل" aria-label="للأسفل">▼</button><button class="ib" type="button" data-act="ln-dup" title="تكرار السطر" aria-label="تكرار السطر">⧉</button>${l.lib?'':'<button class="ib" type="button" data-act="ln-lib" title="حفظ في المكتبة" aria-label="حفظ في المكتبة">＋</button>'}<button class="ib" type="button" data-act="ln-rm" title="حذف" aria-label="حذف">✕</button></div></div></div>`).join('')).join(''):`<div class="empty">لم تُضف أصناف بعد. استخدم البحث أعلاه لإضافة صنف من المكتبة.</div>`;
  if(focusId){const el=$(`.ln[data-lid="${focusId}"]`);if(el){el.classList.add('flash');const i=$('[data-l=qty]',el);i.focus();i.select();el.scrollIntoView({block:'nearest'})}}
  refreshQ();
}
function refreshQ(){
  const q=curQ();if(!q||S.ui.view!=='quote')return;const c=calc(q);
  q.lines.forEach(l=>{const el=$(`.ln[data-lid="${l.id}"] [data-lt]`);if(el)el.textContent=fmt(lineTot(l));const dv=$(`.ln[data-lid="${l.id}"] [data-dev]`);const mg=$(`.ln[data-lid="${l.id}"] [data-mg]`);if(mg){const cs=n0(l.cost),pr=n0(l.price);if(cs>0&&pr>0){const m=(pr-cs)/pr*100;mg.textContent='هامش '+Math.round(m*10)/10+'%';mg.className='dev '+(m<n0(S.settings.minMarginPct)?'up':'dn')}else{mg.textContent='';mg.className='dev'}}if(dv){const it=l.lib&&S.items.find(i=>i.id===l.lib);const d=it&&n0(it.price)>0?(n0(l.price)-n0(it.price))/n0(it.price)*100:0;if(Math.abs(d)>=1){dv.textContent=(d>0?'+':'')+Math.round(d*10)/10+'% عن المكتبة';dv.className='dev '+(d<0?'dn':'up')}else{dv.textContent='';dv.className='dev'}}});
  c.groups.forEach(g=>{const el=$$('[data-gs]').find(e=>e.dataset.gs===g.name);if(el)el.textContent=fmt(g.sub)+' ر.س'});
  $('#tgroups').innerHTML=c.groups.map(g=>`<div class="r"><span class="muted">${esc(g.name.replace(/^توريد وتركيب /,''))}</span><span class="v">${fmt(g.sub)}</span></div>`).join('');
  $('#t-sub').textContent=fmt(c.sub);$('#t-vat').textContent=fmt(c.vat);$('#t-gross').textContent=fmt(c.gross);$('#t-total').textContent=fmt(c.total);
  $('#d-eq').textContent=c.disc>0?(q.discMode==='amt'?`يعادل ${r2(c.pct)}% من الإجمالي شامل الضريبة`:`يعادل ${fmt(c.disc)} ر.س`):'';
  $('#lcount').textContent=q.lines.length?`${q.lines.length} بند`:'';
  const st=STATUS[q.status];const ch=$('#qchip');ch.textContent=st[0];ch.className='chip '+st[1];
  $('#sheet').innerHTML=quoteDoc(q);drawVers(q);drawExtra(q);fitPreview();window.FIN&&window.FIN.card();window.MEM&&window.MEM.paint(q);window.SUB&&window.SUB.injectQuote();
}
function fitPreview(){const sh=$('#sheet'),w=$('.pv-wrap');if(!sh||!w)return;const z=Math.min(1,(w.clientWidth-24)/816);sh.style.zoom=z}
window.addEventListener('resize',fitPreview);

function tplOpts(cur,kind){const def=(S.settings.tplDef||{})[kind]||'',nm=id=>id?((S.settings.templates||[]).find(t=>t.id===id)||{}).name||'':'القالب الأصلي';
  return `<option value="">الافتراضي (${esc(nm(def))})</option><option value="classic" ${cur==='classic'?'selected':''}>القالب الأصلي</option>`+(S.settings.templates||[]).map(t=>`<option value="${t.id}" ${cur===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}
function vContract(){
  const q=curQ();if(!q)return go('archive');const k=ensureContract(q);if(!k){toast('لا يوجد عقد لهذا العرض');return go('archive')}
  main.innerHTML=`<div class="split"><section>
  <div class="title-row"><h1>عقد <bdi dir="ltr">${esc(q.no)}</bdi></h1><div class="sp"></div><span class="chip" id="cchip"></span></div>
  <div class="card"><h3>أطراف العقد</h3><div class="grid g2">
    <label class="fld"><span>الطرف الأول</span><input value="${esc(S.settings.nameAr)}" disabled></label>
    <label class="fld"><span>الطرف الثاني</span><input data-c="party2" value="${esc(k.party2)}"></label>
    <label class="fld"><span>تاريخ العقد</span><input data-c="date" type="date" value="${esc(k.date)}"></label>
    <label class="fld"><span>مدة التنفيذ (يوم)</span><input data-c="duration" type="number" min="0" value="${esc(k.duration)}"></label>
    <label class="fld"><span>قالب الطباعة</span><select data-c="tpl">${tplOpts(k.tpl,'contract')}</select></label>
    <label class="fld"><span>نسبة الاحتجاز % (ضمان حسن التنفيذ)</span><input data-c="retention" type="number" min="0" max="30" step="any" value="${esc(k.retention||0)}"></label>
    <label class="fld" style="grid-column:1/-1"><span>شرط الإفراج عن الاحتجاز</span><input data-c="retentionNote" value="${esc(k.retentionNote||'')}" placeholder="مثال: يُفرج عنه بعد 90 يوماً من الاستلام النهائي"></label></div>
    <div class="row" style="margin-top:12px"><label class="row"><input type="checkbox" data-cb="items" ${k.items?'checked':''} style="width:auto"> إدراج جدول الأصناف في العقد</label>
    <label class="row"><input type="checkbox" data-cb="stamp" ${k.stamp?'checked':''} style="width:auto"> إظهار الختم</label></div></div>
  <div class="card"><h3>قيمة العقد</h3><div id="cval"></div>
    <label class="fld" style="margin-top:10px"><span>مبلغ متفق عليه شامل الضريبة (اختياري، يترك فارغاً لاستخدام إجمالي العرض)</span><input data-c="override" type="number" min="0" step="any" value="${esc(k.override)}"></label></div>
  <div class="card"><h3>جدول الدفعات <span class="chip" id="psum"></span></h3><div class="tablewrap"><table class="t" style="min-width:860px"><thead><tr><th>موعد الدفعة</th><th style="width:80px">النسبة %</th><th style="width:150px">الاستحقاق</th><th class="num" style="width:110px">المبلغ ر.س</th><th class="num rc-col" style="width:100px">المسدد</th><th class="rc-col" style="width:90px">الحالة</th><th style="width:120px"></th></tr></thead><tbody id="prows"></tbody></table></div>
    <div class="row" style="margin-top:10px"><button class="btn sm" type="button" data-act="pay-add">إضافة دفعة</button></div></div>
  <div class="card"><h3>نصوص العقد</h3>
    <label class="fld"><span>التمهيد</span><textarea data-c="intro" rows="3">${esc(k.intro)}</textarea></label>
    <label class="fld" style="margin-top:10px"><span>ملاحظة الدفعات</span><textarea data-c="paynote" rows="2">${esc(k.paynote)}</textarea></label>
    <label class="fld" style="margin-top:10px"><span>الشروط العامة (سطر لكل بند)</span><textarea data-c="terms" rows="10">${esc(k.terms)}</textarea></label>
    <label class="fld" style="margin-top:10px"><span>الخاتمة</span><textarea data-c="close" rows="2">${esc(k.close)}</textarea></label></div>
  <div class="sticky-act"><button class="btn pri" type="button" data-act="print-c">طباعة / حفظ PDF</button><button class="btn" type="button" data-act="nav" data-v="quote">العودة للعرض</button></div>
  </section><aside class="pv"><div class="bar"><b>معاينة Letter</b><span>تتحدث فوراً مع كل تعديل</span></div><div class="pv-wrap"><div class="sheet" id="sheet"></div></div></aside></div>`;
  drawPay();refreshC();fitPreview();
}
function drawPay(){const q=curQ(),ins=instRows(q);
  $('#prows').innerHTML=ins.map((p,i)=>`<tr data-pi="${i}"><td><input data-p="label" value="${esc(p.label)}"></td><td><input data-p="pct" type="number" min="0" step="any" value="${esc(p.pct)}"></td><td><input data-p="due" type="date" value="${esc(p.due||'')}"></td><td class="num" data-pa>${fmt(p.amt)}</td><td class="num rc-col" data-pd>${fmt(p.paid)}</td><td class="rc-col" data-ps><span class="chip ${p.overdue?'bad':ST_LBL[p.st][1]}">${p.overdue?'متأخرة':ST_LBL[p.st][0]}</span></td><td><div class="row" style="flex-wrap:nowrap"><button class="btn sm" type="button" data-act="rc-from-pay">استلام</button><button class="ib" type="button" data-act="pay-rm" aria-label="حذف الدفعة">✕</button></div></td></tr>`).join('');applyAccess()}
function refreshC(){
  const q=curQ();if(!q||S.ui.view!=='contract')return;const k=q.contract,c=calc(q),total=cTotal(q),rows=payRows(k,total);
  instRows(q).forEach((p,i)=>{const tr=$(`tr[data-pi="${i}"]`);if(!tr)return;$('[data-pa]',tr).textContent=fmt(p.amt);$('[data-pd]',tr).textContent=fmt(p.paid);$('[data-ps]',tr).innerHTML=`<span class="chip ${p.overdue?'bad':ST_LBL[p.st][1]}">${p.overdue?'متأخرة':ST_LBL[p.st][0]}</span>`});
  const ps=pctSum(k),pc=$('#psum');pc.textContent=`المجموع ${r2(ps)}%`;pc.className='chip '+(ps===100?'ok':'bad');
  const diff=r2(total-c.total);
  $('#cval').innerHTML=`<div class="tot"><div class="r"><span>الصافي النهائي للعرض</span><span class="v">${fmt(c.total)} ر.س</span></div><div class="r big"><span>قيمة العقد المعتمدة</span><span class="v">${fmt(total)} ر.س</span></div></div>`+(diff!==0?`<div class="note" style="margin-top:10px">قيمة العقد تختلف عن إجمالي العرض بمقدار ${fmt(Math.abs(diff))} ر.س.</div>`:'')+(ps!==100?`<div class="note bad" style="margin-top:10px">مجموع نسب الدفعات لا يساوي 100%.</div>`:'');
  const ch=$('#cchip');ch.textContent=q.contract?'عقد قيد الإعداد':'';ch.className='chip';
  $('#sheet').innerHTML=contractDoc(q);fitPreview();
}

function vLibrary(){
  main.innerHTML=`<div class="title-row"><h1>مكتبة الأصناف</h1><span class="chip" id="lcnt"></span><div class="sp"></div>
  <button class="btn sm" type="button" data-act="lib-std">إضافة الأصناف الشائعة (أسعار تقريبية)</button><button class="btn sm" type="button" data-act="lib-export">تصدير CSV</button><button class="btn sm" type="button" data-fin="priceimp">تحديث الأسعار من ملف مورد</button><label class="btn sm" style="cursor:pointer">استيراد CSV<input id="libfile" type="file" accept=".csv,text/csv" hidden></label></div>
  <div class="card"><h3>إضافة صنف</h3><form id="addf" class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
    <label class="fld"><span>القسم</span><input id="n-cat" list="grpList" required></label>
    <label class="fld" style="grid-column:span 2"><span>الوصف</span><input id="n-desc" required></label>
    <label class="fld"><span>النوع / الماركة</span><input id="n-brand"></label>
    <label class="fld"><span>الوحدة</span><input id="n-unit" value="NO"></label>
    <label class="fld"><span>السعر</span><input id="n-price" type="number" min="0" step="any" required></label>
    <div class="fld"><span>&nbsp;</span><button class="btn pri" type="submit">إضافة للمكتبة</button></div></form></div>
  <div class="card"><div class="row" style="margin-bottom:12px"><input id="lq" placeholder="بحث في المكتبة" style="max-width:380px"><label class="chk"><input id="lest" type="checkbox"> الأسعار التقريبية فقط</label><span class="estb" id="lestn"></span><button class="btn sm" type="button" data-act="lib-ok-all" hidden id="lokall">اعتماد كل الأسعار الظاهرة</button></div>
  <div class="tablewrap"><table class="t" style="min-width:860px"><thead><tr><th style="width:190px">القسم</th><th>الوصف</th><th style="width:110px">النوع</th><th style="width:70px">الوحدة</th><th style="width:110px">السعر</th>${P().seeCost?'<th style="width:110px">التكلفة</th><th style="width:70px">الهامش</th>':''}<th style="width:44px"></th></tr></thead><tbody id="lrows"></tbody></table></div>
  <p class="muted" style="font-size:12px;margin:10px 0 0">أعمدة ملف CSV بالترتيب: القسم، الوصف، النوع، الوحدة، السعر. يمكن حفظ ملف Excel بصيغة CSV UTF-8 ثم استيراده.</p></div>`;
  const draw=()=>{const f=norm($('#lq').value),eo=$('#lest').checked;const rows=S.items.filter(i=>(!eo||i.est)&&(!f||norm(i.cat+' '+i.desc+' '+i.brand).includes(f)));$('#lcnt').textContent=`${S.items.length} صنف`;const en=S.items.filter(i=>i.est).length;$('#lestn').textContent=en?`${en} سعر تقريبي بحاجة لمراجعة`:'';$('#lestn').hidden=!en;$('#lokall').hidden=!(eo&&rows.length);
    $('#lrows').innerHTML=rows.length?rows.map(i=>`<tr data-id="${i.id}" class="${i.est?'est':''}"><td><input data-i="cat" list="grpList" value="${esc(i.cat)}"></td><td><input data-i="desc" value="${esc(i.desc)}"></td><td><input data-i="brand" value="${esc(i.brand)}"></td><td><input data-i="unit" value="${esc(i.unit)}"></td><td><input data-i="price" type="number" min="0" step="any" value="${esc(i.price)}" class="ltr">${i.est?'<span class="estb">تقريبي</span>':''}</td>${P().seeCost?`<td><input data-i="cost" type="number" min="0" step="any" value="${esc(i.cost||'')}" class="ltr" placeholder="—"></td><td class="muted" data-lm>${i.cost>0&&i.price>0?Math.round((i.price-i.cost)/i.price*1000)/10+'%':''}</td>`:''}<td>${i.est?'<button class="ib" type="button" data-act="lib-ok" title="اعتماد السعر" aria-label="اعتماد السعر">✓</button>':''}<button class="ib" type="button" data-act="lib-del" aria-label="حذف الصنف">✕</button></td></tr>`).join(''):`<tr><td colspan="6" class="empty">لا توجد أصناف مطابقة.</td></tr>`};
  draw();$('#lq').addEventListener('input',draw);$('#lest').addEventListener('change',draw);window._libDraw=draw;window.SUB&&window.SUB.injectLib();
  $('#addf').addEventListener('submit',e=>{e.preventDefault();S.items.unshift({id:uid(),cat:$('#n-cat').value.trim(),desc:$('#n-desc').value.trim(),brand:$('#n-brand').value.trim(),unit:$('#n-unit').value.trim()||'NO',price:n0($('#n-price').value)});['n-desc','n-brand','n-price'].forEach(i=>$('#'+i).value='');$('#n-desc').focus();save();draw();renderTabs();toast('أُضيف الصنف إلى المكتبة')});
  $('#libfile').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;const rows=parseCSV(await f.text());let n=0;rows.forEach((r,i)=>{if(r.length<5)return;const p=n0(r[4].replace(/,/g,''));if(i===0&&!isFinite(parseFloat(r[4])))return;if(!r[1].trim())return;{const it={id:uid(),cat:r[0].trim(),desc:r[1].trim(),brand:r[2].trim(),unit:r[3].trim()||'NO',price:p};const cs=P().seeCost&&r[5]?n0(String(r[5]).replace(/,/g,'')):0;if(cs>0)it.cost=cs;S.items.push(it)}n++});save();draw();renderTabs();toast(`تم استيراد ${n} صنف`)});
}
function parseCSV(t){const rows=[];let row=[],c='',q=false;t=t.replace(/^﻿/,'');for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++}else q=false}else c+=ch}else if(ch==='"')q=true;else if(ch===','||ch==='\t'){row.push(c);c=''}else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&t[i+1]==='\n')i++;row.push(c);c='';if(row.some(x=>x.trim()))rows.push(row);row=[]}else c+=ch}row.push(c);if(row.some(x=>x.trim()))rows.push(row);return rows}
function download(name,text,type){try{const b=new Blob([text],{type});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}catch(e){toast('تعذر التنزيل في هذا المتصفح')}}

function vSettings(){
  const s=S.settings;const F=(k,l,ex='')=>`<label class="fld"><span>${l}</span><input data-s="${k}" value="${esc(s[k])}" ${ex}></label>`;
  main.innerHTML=`<div class="title-row"><h1>الإعدادات</h1></div>
  <div class="card"><h3>بيانات الشركة</h3><div class="grid g2">${F('nameAr','اسم الشركة بالعربية')}${F('nameEn','اسم الشركة بالإنجليزية','class="ltr"')}${F('brandEn','العنوان العريض في المستند','class="ltr"')}${F('cr','السجل التجاري','class="ltr"')}${F('vat','الرقم الضريبي','class="ltr"')}${F('phone1','الجوال 1','class="ltr"')}${F('phone2','الجوال 2','class="ltr"')}${F('email','البريد','class="ltr"')}${F('web','الموقع','class="ltr"')}${F('bankName','البنك')}${F('iban','IBAN','class="ltr"')}${F('preparedBy','معد العروض الافتراضي')}</div>
  <label class="fld" style="margin-top:12px"><span>عبارة الشكر أسفل العنوان</span><textarea data-s="thanks" rows="2">${esc(s.thanks)}</textarea></label></div>
  <div class="card"><h3>الشعار والختم</h3><div class="grid g2">
    <div class="fld"><span>الشعار (يظهر في رأس كل صفحة)</span><div class="row"><img id="pLogo" alt="" style="height:54px;max-width:200px;object-fit:contain;background:#fff;border:1px solid var(--line);border-radius:8px;padding:4px" ${s.logo?`src="${s.logo}"`:'hidden'}>${s.logo?'':'<span class="muted">لا يوجد شعار، يُعرض اسم RASS كنص مؤقتاً</span>'}</div><div class="row"><label class="btn sm" style="cursor:pointer">رفع الشعار<input type="file" accept="image/*" data-up="logo" hidden></label>${s.logo?'<button class="btn sm" type="button" data-act="up-clear" data-k="logo">إزالة</button>':''}</div></div>
    <div class="fld"><span>الختم</span><div class="row"><img alt="" src="${s.stamp||''}" style="height:84px;background:#fff;border:1px solid var(--line);border-radius:8px;padding:4px" ${s.stamp?'':'hidden'}></div><div class="row"><label class="btn sm" style="cursor:pointer">رفع ختم جديد<input type="file" accept="image/*" data-up="stamp" hidden></label>${s.stamp?'<button class="btn sm" type="button" data-act="up-clear" data-k="stamp">إزالة</button>':''}</div></div></div>
  <p class="muted" style="font-size:12px;margin:10px 0 0">الشعار الموجود في ملف PDF المرفق مقصوص من اليمين، لذلك ارفع ملف الشعار الكامل (PNG بخلفية شفافة يعطي أفضل نتيجة).</p></div>
  <div class="card"><h3>الترقيم والقيم الافتراضية</h3><div class="grid">
    <label class="fld"><span>بادئة الرقم (السنة)</span><input data-s="prefix" value="${esc(s.prefix)}" class="ltr"></label>
    <label class="fld"><span>الرقم التالي</span><input data-s="nextSeq" type="number" min="1" value="${esc(s.nextSeq)}"></label>
    <label class="fld"><span>نسبة الضريبة %</span><input data-s="vatRate" type="number" min="0" step="any" value="${esc(s.vatRate)}"></label>
    <label class="fld"><span>مدة العرض (يوم)</span><input data-s="validity" type="number" min="0" value="${esc(s.validity)}"></label>
    <label class="fld"><span>بادئة سندات القبض</span><input data-s="rcPrefix" value="${esc(s.rcPrefix)}" class="ltr"></label>
    <label class="fld"><span>رقم السند التالي</span><input data-s="rcNext" type="number" min="1" value="${esc(s.rcNext)}"></label></div></div>
  <div class="card"><h3>التسعير والفواتير والاتفاقيات</h3><div class="grid">
    <label class="fld"><span>الحد الأدنى لهامش الربح % (0 = بلا حد)</span><input data-s="minMarginPct" type="number" min="0" step="any" value="${esc(s.minMarginPct||0)}"></label>
    <label class="fld"><span>هامش الربح المستهدف %</span><input data-s="targetMarginPct" type="number" min="0" step="any" value="${esc(s.targetMarginPct??25)}"></label>
    <label class="fld"><span>بادئة الفواتير</span><input data-s="invPrefix" value="${esc(s.invPrefix||'INV-26')}" class="ltr"></label>
    <label class="fld"><span>رقم الفاتورة التالي</span><input data-s="invNext" type="number" min="1" value="${esc(s.invNext||1)}"></label>
    <label class="fld"><span>بادئة الاتفاقيات</span><input data-s="agPrefix" value="${esc(s.agPrefix||'AG-26')}" class="ltr"></label>
    <label class="fld"><span>رقم الاتفاقية التالي</span><input data-s="agNext" type="number" min="1" value="${esc(s.agNext||1)}"></label></div>
  <label class="fld" style="margin-top:12px"><span>عنوان الشركة (يظهر في الفاتورة الضريبية كعنوان البائع)</span><input data-s="address" value="${esc(s.address||'')}" placeholder="مثال: حي الملقا، الرياض، المملكة العربية السعودية"></label>
  <label class="row" style="margin-top:12px"><input type="checkbox" data-s="portalOn" ${s.portalOn?'checked':''} style="width:auto"> إظهار حالة العقد والمدفوعات للعميل في رابط الاعتماد بعد الاعتماد (أوامر التغيير والمستخلصات وسندات القبض)</label>
  <label class="fld" style="margin-top:10px"><span>ملاحظات الفاتورة الافتراضية (يمكن استخدام {BANK} و{IBAN})</span><textarea data-s="invNote" rows="2">${esc(s.invNote||'')}</textarea></label>
  <p class="muted" style="font-size:12px;margin:10px 0 0">إذا انخفض هامش عرض عن الحد الأدنى لا يستطيع مسؤول المبيعات إرساله أو مشاركته مع العميل حتى يراجعه المدير. تتطلب الفاتورة الضريبية رقماً ضريبياً صحيحاً من 15 رقماً في بيانات الشركة.</p></div>
  <div class="card"><h3>الخصومات والاعتماد</h3><div class="grid">
    <label class="fld"><span>الخصم الذي يحتاج اعتماد المدير (%)</span><input data-s="discApprovalPct" type="number" min="0" step="any" value="${esc(s.discApprovalPct)}"></label>
    <label class="fld"><span>أقصى خصم لمسؤول المبيعات (%)</span><input data-s="salesMaxDiscPct" type="number" min="0" step="any" value="${esc(s.salesMaxDiscPct)}"></label>
    <label class="fld"><span>صلاحية رابط اعتماد العميل (يوم)</span><input data-s="shareDays" type="number" min="1" value="${esc(s.shareDays)}"></label></div>
  <p class="muted" style="font-size:12px;margin:10px 0 0">إذا تجاوز خصم عرض من غير المدير النسبة الأولى، يُحجز العرض حتى يعتمده المدير ولا يمكن إرساله أو تحويله إلى عقد. ولا يستطيع مسؤول المبيعات تجاوز النسبة الثانية إطلاقاً (0 تعني بلا حد).</p></div>
  <div class="card"><h3>نصوص افتراضية للعروض والعقود الجديدة</h3>
    <label class="fld"><span>ملاحظات العرض</span><textarea data-s="notes" rows="6">${esc(s.notes)}</textarea></label>
    <label class="fld" style="margin-top:10px"><span>الشروط العامة للعقد</span><textarea data-s="cterms" rows="9">${esc(s.cterms)}</textarea></label>
    <label class="fld" style="margin-top:10px"><span>التمهيد</span><textarea data-s="cintro" rows="3">${esc(s.cintro)}</textarea></label></div>
  <div class="card"><h3>النسخ الاحتياطي</h3><p class="muted" style="margin-top:0">تُحفظ البيانات على الخادم (قاعدة Neon) وتُنشأ نسخة احتياطية تلقائية كل يوم وتُحتفظ آخر 30 نسخة. يمكنك أيضاً تنزيل نسخة كاملة أو استيراد نسخة قديمة (ومنها نسخة النسخة المحلية السابقة للبرنامج).</p>
    <div class="row"><button class="btn" type="button" data-act="bk-create">إنشاء نسخة الآن</button><button class="btn" type="button" data-act="bk-export">تنزيل نسخة كاملة</button><button class="btn" type="button" data-act="xl-export">تصدير كل البيانات إلى Excel</button><label class="btn" style="cursor:pointer">استيراد نسخة<input id="restore" type="file" accept=".json,application/json" hidden></label></div>
    <div id="bk-list" style="margin-top:12px"></div></div>`;
  $('#restore').addEventListener('change',e=>{const f=e.target.files[0];if(f)doImport(f);e.target.value=''});loadBackups();
}
function readImg(file,max,cb){const r=new FileReader();r.onload=()=>{const im=new Image();im.onload=()=>{const k=Math.min(1,max/Math.max(im.width,im.height));const c=document.createElement('canvas');c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);c.getContext('2d').drawImage(im,0,0,c.width,c.height);cb(c.toDataURL('image/png'))};im.src=r.result};r.readAsDataURL(file)}

/* ---------- printing ---------- */
function printDoc(html,title){const pa=$('#printArea');pa.innerHTML=html;const m=/data-page="([^"]*)"/.exec(html);let ps=document.getElementById('pgStyle');if(!ps){ps=document.createElement('style');ps.id='pgStyle';document.head.appendChild(ps)}ps.textContent=m?m[1].replace(/&amp;/g,'&').replace(/&quot;/g,'"'):'';const old=document.title;document.title=title;const back=()=>{document.title=old;window.removeEventListener('afterprint',back)};window.addEventListener('afterprint',back);Promise.race([document.fonts?document.fonts.ready:0,new Promise(r=>setTimeout(r,1500))]).then(()=>setTimeout(()=>window.print(),60))}

/* ---------- search ---------- */
let hits=[],hi=0;
function search(){const q=curQ(),v=norm($('#srch').value).split(/\s+/).filter(Boolean),box=$('#res');
  if(!v.length){box.hidden=true;return}
  hits=S.items.filter(i=>{const t=norm(i.cat+' '+i.desc+' '+i.brand+' '+i.unit);return v.every(w=>t.includes(w))}).slice(0,12);hi=0;
  box.hidden=false;
  box.innerHTML=hits.length?hits.map((i,n)=>`<button type="button" class="res-i ${n===0?'on':''}" data-act="pick" data-id="${i.id}"><span class="d">${esc(i.desc)}<small>${esc(i.cat)}${i.brand?' · '+esc(i.brand):''}${q.lines.some(l=>l.lib===i.id)?' · مضاف، سيزيد العدد':''}</small></span><span class="p">${fmt(i.price)}</span></button>`).join(''):`<div class="empty" style="padding:14px">لا توجد نتيجة. أضف سطراً مخصصاً أو أضف الصنف في المكتبة.</div>`}
function pick(id){const q=curQ(),it=S.items.find(i=>i.id===id);if(!it)return;let l=q.lines.find(x=>x.lib===id);
  if(l){l.qty=n0(l.qty)+1}else{l={id:uid(),lib:id,group:it.cat,desc:it.desc,brand:it.brand,unit:it.unit,qty:1,price:it.price};if(it.est)l.est=true;if(it.cost>0)l.cost=it.cost;
    // keep a new line inside its group (after the last line of that group)
    let idx=-1;q.lines.forEach((x,i)=>{if(x.group===l.group)idx=i});if(idx>=0)q.lines.splice(idx+1,0,l);else q.lines.push(l)}
  $('#srch').value='';$('#res').hidden=true;save();renderLines(l.id);$('#srch').focus&&0}

/* ---------- events ---------- */
document.addEventListener('input',e=>{
  const t=e.target,q=curQ();
  if(t.id==='srch'){search();return}
  if(t.dataset.f&&q){const k=t.dataset.f;q[k]=t.type==='number'?(t.value===''?0:n0(t.value)):t.value;save();if(k==='no'){$('h1').innerHTML='عرض سعر <bdi dir="ltr">'+esc(q.no)+'</bdi>'}refreshQ();return}
  if(t.id==='d-val'&&q){if(q.discMode==='amt')q.discAmt=n0(t.value);else q.discPct=n0(t.value);save();refreshQ();return}
  if(t.dataset.l&&q){const k=t.dataset.l;if(k==='group')return;const l=q.lines.find(x=>x.id===t.closest('.ln').dataset.lid);if(!l)return;l[k]=(k==='qty'||k==='price'||k==='cost')?n0(t.value):t.value;if(k==='cost'&&!l.cost)delete l.cost;if(k==='price'&&l.est){delete l.est;const ln=t.closest('.ln');ln.classList.remove('est');$$('.estb',ln).forEach(x=>x.remove())}save();refreshQ();return}
  if(t.dataset.c&&q){q.contract[t.dataset.c]=t.value;save();(t.dataset.c==='override')&&drawPayVals();refreshC();return}
  if(t.dataset.p&&q){const i=+t.closest('tr').dataset.pi,k=t.dataset.p;q.contract.payments[i][k]=k==='pct'?n0(t.value):t.value;save();refreshC();return}
  if(t.dataset.s){const k=t.dataset.s;S.settings[k]=t.type==='checkbox'?t.checked:t.type==='number'?n0(t.value):t.value;if(k==='nextSeq'||k==='rcNext'||k==='invNext'||k==='agNext')cntSave();else save();return}
  if(t.dataset.i){const id=t.closest('tr').dataset.id,it=S.items.find(i=>i.id===id);if(it){it[t.dataset.i]=(t.dataset.i==='price'||t.dataset.i==='cost')?n0(t.value):t.value;if(t.dataset.i==='cost'&&!it.cost)delete it.cost;{const lm=t.closest('tr')&&t.closest('tr').querySelector('[data-lm]');if(lm)lm.textContent=it.cost>0&&it.price>0?Math.round((it.price-it.cost)/it.price*1000)/10+'%':''}if(t.dataset.i==='price'&&it.est){delete it.est;const tr=t.closest('tr');tr.classList.remove('est');$$('.estb,[data-act=lib-ok]',tr).forEach(x=>x.remove())}save()}return}
});
function drawPayVals(){}
document.addEventListener('change',e=>{
  const t=e.target,q=curQ();
  if(t.dataset.gold&&q){const nw=t.value.trim()||'بنود أخرى';q.lines.forEach(l=>{if(l.group===t.dataset.gold)l.group=nw});save();renderLines();renderTabs();return}
  if(t.dataset.l==='qty'&&q){const v=R.calcExpr?R.calcExpr(t.value):null;const l=q.lines.find(x=>x.id===t.closest('.ln').dataset.lid);if(l){if(v==null){t.value=l.qty;toast('معادلة غير صالحة')}else{l.qty=Math.max(0,v);t.value=l.qty;save();refreshQ()}}return}
  if(t.dataset.l==='group'&&q){const l=q.lines.find(x=>x.id===t.closest('.ln').dataset.lid);if(l){l.group=t.value.trim()||'بنود أخرى';save();renderLines(l.id)}return}
  if(t.id==='d-mode'&&q){const c=calc(q);if(t.value==='amt')q.discAmt=c.disc;else q.discPct=c.pct;q.discMode=t.value;$('#d-val').value=t.value==='amt'?q.discAmt:Math.round(q.discPct*10000)/10000;save();refreshQ();return}
  if(t.dataset.cb&&q){q.contract[t.dataset.cb]=t.checked;save();refreshC();return}
  if(t.dataset.f==='status'){refreshQ();renderTabs()}
  if(t.dataset.up){const k=t.dataset.up;if(t.files[0])readImg(t.files[0],k==='logo'?700:560,u=>{S.settings[k]=u;save();render();toast('تم رفع الصورة')})}
});
document.addEventListener('keydown',e=>{
  if(e.target.id==='srch'){const items=$$('#res .res-i');
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!items.length)return;hi=(hi+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;items.forEach((x,i)=>x.classList.toggle('on',i===hi));items[hi].scrollIntoView({block:'nearest'})}
    else if(e.key==='Enter'){e.preventDefault();if(hits[hi])pick(hits[hi].id)}
    else if(e.key==='Escape'){$('#res').hidden=true}}
});
document.addEventListener('click',e=>{
  if(!e.target.closest('.srch')){const r=$('#res');if(r)r.hidden=true}
  const b=e.target.closest('[data-act]');if(!b)return;const a=b.dataset.act,q=curQ();
  if(act3(a,b,q)||act2(a,b,q))return;
  switch(a){
    case 'nav':go(b.dataset.v);break;
    case 'theme':{const cur=document.documentElement.dataset.theme||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');const nx=cur==='dark'?'light':'dark';document.documentElement.dataset.theme=nx;try{localStorage.setItem(LT,nx)}catch(x){}break}
    case 'open':go('quote',b.closest('tr').dataset.id);break;
    case 'open-c':{const id=b.closest('tr').dataset.id;S.ui.qid=id;ensureContract(curQ());go('contract',id);break}
    case 'del-q':{if(!b.classList.contains('armed')){b.classList.add('armed');b.textContent='تأكيد الحذف';setTimeout(()=>{if(b.isConnected){b.classList.remove('armed');b.textContent='حذف'}},3000);break}S.quotes=S.quotes.filter(x=>x.id!==b.closest('tr').dataset.id);save();render();break}
    case 'pick':pick(b.dataset.id);break;
    case 'add-line':{const last=q.lines[q.lines.length-1];const l={id:uid(),lib:'',group:last?last.group:'بنود الأعمال',desc:'',brand:'',unit:'NO',qty:1,price:0};q.lines.push(l);save();renderLines(l.id);$(`.ln[data-lid="${l.id}"] [data-l=desc]`).focus();break}
    case 'ln-rm':{const id=b.closest('.ln').dataset.lid,ix=q.lines.findIndex(l=>l.id===id),gone=q.lines[ix];q.lines=q.lines.filter(l=>l.id!==id);save();renderLines();toastUndo('حُذف السطر',()=>{const qq=curQ();if(!qq||qq.id!==q.id)return;qq.lines.splice(Math.min(ix,qq.lines.length),0,gone);save();if(S.ui.view==='quote')renderLines(gone.id)});break}
    case 'ln-dup':{const id=b.closest('.ln').dataset.lid,ix=q.lines.findIndex(l=>l.id===id),c=JSON.parse(JSON.stringify(q.lines[ix]));c.id=uid();q.lines.splice(ix+1,0,c);save();renderLines(c.id);break}
    case 'ln-up':case 'ln-dn':{const id=b.closest('.ln').dataset.lid,i=q.lines.findIndex(l=>l.id===id),g=q.lines[i].group,step=a==='ln-up'?-1:1;let j=i+step;while(j>=0&&j<q.lines.length&&q.lines[j].group!==g)j+=step;if(j>=0&&j<q.lines.length){[q.lines[i],q.lines[j]]=[q.lines[j],q.lines[i]];save();renderLines(id)}break}
    case 'ln-lib':{const l=q.lines.find(x=>x.id===b.closest('.ln').dataset.lid);if(!l.desc.trim()){toast('اكتب الوصف أولاً');break}const it={id:uid(),cat:l.group,desc:l.desc,brand:l.brand,unit:l.unit,price:n0(l.price)};S.items.push(it);l.lib=it.id;save();renderLines();toast('حُفظ الصنف في المكتبة');break}
    case 'to-contract':ensureContract(q);go('contract');break;
    case 'print-q':printDoc(quoteDoc(q),`عرض سعر ${q.no} - ${q.client}`);break;
    case 'print-c':printDoc(contractDoc(q),`عقد ${q.no} - ${q.contract.party2}`);break;
    case 'pay-add':q.contract.payments.push({label:'دفعة جديدة',pct:0});save();drawPay();refreshC();break;
    case 'pay-rm':q.contract.payments.splice(+b.closest('tr').dataset.pi,1);save();drawPay();refreshC();break;
    case 'lib-del':{if(!b.classList.contains('armed')){b.classList.add('armed');b.textContent='؟';setTimeout(()=>{if(b.isConnected){b.classList.remove('armed');b.textContent='✕'}},2500);break}S.items=S.items.filter(i=>i.id!==b.closest('tr').dataset.id);save();vLibrary();break}
    case 'lib-std':{b.disabled=true;api('POST','/items/std',{}).then(r=>{S.items=r.items;snapshot();vLibrary();renderTabs();toast(r.added?`أُضيف ${r.added} صنف بأسعار تقريبية، راجع الأسعار المظللة`:'جميع الأصناف الشائعة موجودة مسبقاً')}).catch(fail).finally(()=>{b.disabled=false});break}
    case 'lib-ok':{const it=S.items.find(i=>i.id===b.closest('tr').dataset.id);if(it){delete it.est;save();window._libDraw&&window._libDraw()}break}
    case 'lib-ok-all':{const f=norm($('#lq').value);S.items.forEach(i=>{if(i.est&&(!f||norm(i.cat+' '+i.desc+' '+i.brand).includes(f)))delete i.est});save();window._libDraw&&window._libDraw();break}
    case 'lib-export':{const sc=P().seeCost;const rows=[['القسم','الوصف','النوع','الوحدة','السعر',...(sc?['التكلفة']:[])],...S.items.map(i=>[i.cat,i.desc,i.brand,i.unit,i.price,...(sc?[i.cost||'']:[])])];download('مكتبة-الاصناف.csv','﻿'+rows.map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(',')).join('\r\n'),'text/csv;charset=utf-8');break}
    
    case 'up-clear':S.settings[b.dataset.k]='';save();render();break;
  }
});

/* ===== العملاء وسندات القبض واللوحة والإصدارات ===== */
const METHODS=['تحويل بنكي','نقدي','شيك','مدى / بطاقة','حوالة'];
const newCust=name=>({id:uid(),name:name||'',contact:'',phone:'',email:'',city:'',vat:'',cr:'',address:'',notes:''});
const byName=(a,b)=>String(a.name).localeCompare(String(b.name),'ar');
const custById=id=>S.customers.find(x=>x.id===id);
const custName=id=>{const c=custById(id);return c?c.name:''};
const daysDiff=(a,b)=>Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/864e5);
const addDays=(iso,n)=>new Date(Date.parse(iso+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
const expiry=q=>/^\d{4}-\d{2}-\d{2}$/.test(q.date||'')?addDays(q.date,n0(q.validity)):'';
const sumR=a=>r2(a.reduce((t,r)=>t+n0(r.amount),0));
const ST_LBL={paid:['مسددة','ok'],part:['جزئية','warn'],none:['غير مسددة','']};
const custPhone=q=>{const c=custById(q.custId);return c?c.phone:''};
const qOwner=q=>custName(q.custId)||q.client;

const canDelQ=q=>P().quotesWrite==='all'||(P().quotesWrite==='own'&&isOwner(q)&&q.status==='draft'&&!q.contract);
/* ---- accounts ---- */
function instRows(q,exclude){
  const k=q.contract;if(!k)return [];
  const rows=payRows(k,cTotal(q)),td=today();
  return rows.map(p=>{
    const paid=sumR(LR().filter(r=>r.qid===q.id&&r.payId===p.id&&r.id!==exclude));
    const rem=r2(p.amt-paid),st=rem<=0.004?'paid':paid>0?'part':'none';
    return {...p,paid,rem:rem>0?rem:0,st,overdue:st!=='paid'&&!!p.due&&p.due<td}})}
function contractAcct(q,exclude){const total=cTotal(q);const paid=sumR(LR().filter(r=>r.qid===q.id&&r.id!==exclude));return {total,paid,rem:r2(total-paid)}}
function custAcct(cid){
  const cons=S.quotes.filter(q=>q.custId===cid&&q.contract&&q.status!=='lost');
  const total=r2(cons.reduce((a,q)=>a+cTotal(q),0));
  const paid=sumR(LR().filter(r=>r.custId===cid));
  return {cons,total,paid,bal:r2(total-paid)}}
function qChips(q){
  const st=STATUS[q.status]||['',''];let h=`<span class="chip ${st[1]}">${st[0]}</span>`;
  if(q.rev>1)h+=` <span class="chip">إصدار ${q.rev}</span>`;
  if(q._approval&&q._approval.state==='pending')h+=' <span class="chip warn">بانتظار اعتماد الخصم</span>';
  if(q._decision&&q._decision.action==='approve')h+=' <span class="chip ok">اعتمده العميل</span>';
  if(q.status==='sent'&&q._views&&q._views.n>0)h+=` <span class="chip" title="آخر فتح: ${esc(String(q._views.last||'').slice(0,16).replace('T',' '))}">فُتح ${q._views.n}×</span>`;
  if(q.contract){if(P().receipts){const a=contractAcct(q);const p=a.total?Math.round(a.paid/a.total*100):0;h+=` <span class="chip ok">عقد ${p}%</span>`}else h+=' <span class="chip ok">عقد</span>'}
  else if((q.status==='sent'||q.status==='draft')&&expiry(q)&&expiry(q)<today())h+=' <span class="chip bad">انتهى سريانه</span>';
  return h}

/* ---- whatsapp ---- */
function waPhone(p){let d=String(p||'').replace(/\D/g,'');if(!d)return '';if(d.startsWith('00'))d=d.slice(2);if(d.startsWith('966'))return d;if(d.startsWith('0'))d=d.slice(1);if(d.length===9&&d[0]==='5')return '966'+d;return d}
const waLink=(p,t)=>`https://wa.me/${waPhone(p)}?text=${encodeURIComponent(t)}`;
function openShare(text,phone,note){
  const box=$('#sharebox');if(!box)return;box.dataset.phone=phone||'';
  box.innerHTML=`<div class="card"><h3>مشاركة عبر واتساب</h3><label class="fld"><span>نص الرسالة (يمكن تعديله)</span><textarea id="sh-t" rows="7">${esc(text)}</textarea></label>
  <p class="muted" style="font-size:12px;margin:8px 0">${esc(note||'')}</p>
  <div class="row"><a id="sh-a" class="btn pri" target="_blank" rel="noopener" href="${esc(waLink(phone,text))}">فتح واتساب</a><button class="btn" type="button" data-act="sh-copy">نسخ النص</button>
  <span class="muted" style="font-size:12px">${phone?'الرقم: <bdi dir="ltr">'+esc(phone)+'</bdi>':'لا يوجد جوال محفوظ للعميل، ستختار المحادثة داخل واتساب'}</span></div></div>`;
  box.scrollIntoView({block:'nearest'})}
const sig=()=>`\n${S.settings.nameAr}\n${S.settings.phone1}`;
const hello=name=>`السلام عليكم ورحمة الله وبركاته\nالأستاذ/ ${name||''} المحترم\n`;
function quoteMsg(q){const c=calc(q);return hello(qOwner(q))+`نرفق لكم عرض السعر رقم ${q.no} بتاريخ ${fmtDate(q.date)}${q.project?' لمشروع '+q.project:''}.\nالإجمالي شامل الضريبة: ${fmt(c.total)} ريال\nمدة سريان العرض: ${q.validity} يوم${sig()}`}
function receiptMsg(r){
  const q=r.qid?S.quotes.find(x=>x.id===r.qid):null;let t=hello(custName(r.custId))+`تم استلام مبلغ ${fmt(r.amount)} ريال بموجب سند القبض رقم ${r.no} بتاريخ ${fmtDate(r.date)}، شاكرين لكم.`;
  if(q&&q.contract){const a=contractAcct(q);t+=`\nالمتبقي من عقد ${q.no}: ${fmt(Math.max(0,a.rem))} ريال`}
  return t+sig()}
function stmtMsg(c){const a=custAcct(c.id);return hello(c.name)+`ملخص حسابكم حتى ${fmtDate(today())}:\nإجمالي العقود: ${fmt(a.total)} ريال\nالمسدد: ${fmt(a.paid)} ريال\n${a.bal>=0?'المتبقي':'رصيد دائن لكم'}: ${fmt(Math.abs(a.bal))} ريال${sig()}`}
function remindMsg(q,p){return hello(qOwner(q))+`نذكّركم بموعد استحقاق دفعة «${p.label}» من العقد رقم ${q.no}${q.project?' - '+q.project:''}، بمبلغ ${fmt(p.rem)} ريال، وتاريخ الاستحقاق ${fmtDate(p.due)}.\nنأمل التكرم بالسداد، شاكرين لكم تعاونكم.${sig()}`}
function followMsg(q){const c=calc(q);return hello(qOwner(q))+`نود متابعة عرض السعر رقم ${q.no}${q.project?' لمشروع '+q.project:''} بإجمالي ${fmt(c.total)} ريال، وتاريخ انتهاء سريانه ${fmtDate(expiry(q))}.\nيسعدنا الرد على أي استفسار.${sig()}`}

/* ---- documents ---- */
function receiptDoc(r,tp){
  const s=S.settings,c=custById(r.custId)||{name:'',phone:'',vat:''};
  const q=r.qid?S.quotes.find(x=>x.id===r.qid):null,amt=r2(r.amount);
  let desc=String(r.notes||'').trim(),ref='سند حر، غير مرتبط بعقد',sum='';
  if(q&&q.contract){
    const p=r.payId?instRows(q,r.id).find(x=>x.id===r.payId):null,a=contractAcct(q,r.id),after=r2(a.paid+amt);
    ref=`عقد رقم ${q.no}${q.project?' - '+q.project:''}`;
    if(!desc)desc=p?`دفعة «${p.label}» من عقد ${q.project||q.no}`:`دفعة على حساب عقد ${q.project||q.no}`;
    sum=`<table class="sm"><thead><tr><th colspan="2">موقف العقد بعد هذا السند</th></tr></thead><tbody>
    <tr><td>قيمة العقد</td><td class="e">${fmt(a.total)}</td></tr><tr><td>المسدد سابقاً</td><td class="e">${fmt(a.paid)}</td></tr><tr><td>هذا السند</td><td class="e">${fmt(amt)}</td></tr>
    <tr class="k"><td>إجمالي المسدد</td><td class="e">${fmt(after)}</td></tr><tr class="gt"><td>المتبقي من العقد</td><td class="e">${fmt(Math.max(0,r2(a.total-after)))}</td></tr>`+
    (p?`<tr><td>المتبقي من الدفعة «${esc(p.label)}»</td><td class="e">${fmt(Math.max(0,r2(p.rem-amt)))}</td></tr>`:'')+`</tbody></table>`}
  else if(!desc)desc='دفعة مستلمة';
  const inner=`<div class="d-bar">${esc(s.brandEn)}</div><div class="d-sub">سند قبض | RECEIPT VOUCHER</div>
  <div class="d-meta"><div class="mp"><i>رقم السند</i><span>${r.no?`<bdi dir="ltr">${esc(r.no)}</bdi>`:'يُعطى عند الحفظ'}</span></div><div class="mp"><i>التاريخ</i><span>${fmtDate(r.date)}</span></div>
  <div class="mp"><i>استلمنا من</i><span>${esc(c.name)}</span></div><div class="mp"><i>الجوال</i><span><bdi dir="ltr">${esc(c.phone)}</bdi></span></div>
  <div class="mp"><i>المرجع</i><span>${esc(ref)}</span></div><div class="mp"><i>الرقم الضريبي للعميل</i><span><bdi dir="ltr">${esc(c.vat)}</bdi></span></div></div>
  <div class="rc-amt"><div><small>المبلغ / Amount</small><b>${fmt(amt)}</b> ر.س</div><div class="w">${esc(sarWords(amt))}</div></div>
  <div class="d-meta" style="grid-template-columns:1fr"><div class="mp"><i>طريقة الدفع</i><span>${esc(r.method)}</span></div>${r.ref?`<div class="mp"><i>رقم الحوالة / الشيك</i><span><bdi dir="ltr">${esc(r.ref)}</bdi></span></div>`:''}<div class="mp"><i>البيان</i><span>${esc(desc)}</span></div></div>
  ${sum}
  <div class="sigs"><div class="sg"><b>المستلم</b><b>${esc(s.nameAr)}</b><div class="ln2">الاسم: ${esc(S.settings.preparedBy)}</div><div class="ln2">التوقيع: __________________</div><div class="ln2">الختم:</div>${stampImg('stamp')}</div>
  <div class="sg"><b>المسلِّم</b><b>${esc(c.name)}</b><div class="ln2">الاسم: ____________________</div><div class="ln2">التوقيع: __________________</div></div></div>`;
  return wrap(inner+(r.void?`<div class="void-mark">ملغى</div>`:''),tp)}
function statementDoc(cid){
  const s=S.settings,c=custById(cid);if(!c)return '';const a=custAcct(cid),td=today();
  const ev=[];
  a.cons.forEach(q=>ev.push({d:q.contract.date||q.date,t:0,txt:`عقد رقم ${q.no}${q.project?' - '+q.project:''}`,debit:cTotal(q),credit:0}));
  LR().filter(r=>r.custId===cid).forEach(r=>{const q=r.qid?S.quotes.find(x=>x.id===r.qid):null;ev.push({d:r.date,t:1,txt:`سند قبض ${r.no} - ${r.method}${r.ref?' ('+r.ref+')':''}${q?' - على عقد '+q.no:' - غير مرتبط بعقد'}`,debit:0,credit:n0(r.amount)})});
  ev.sort((x,y)=>String(x.d).localeCompare(String(y.d))||x.t-y.t);
  let bal=0;const led=ev.map(e=>{bal=r2(bal+e.debit-e.credit);return `<tr><td class="c">${fmtDate(e.d)}</td><td>${esc(e.txt)}</td><td class="e">${e.debit?fmt(e.debit):''}</td><td class="e">${e.credit?fmt(e.credit):''}</td><td class="e">${fmt(bal)}</td></tr>`}).join('');
  const cons=a.cons.map(q=>{const ins=instRows(q),ac=contractAcct(q);
    return `<div class="terms-h" style="color:#1b3a63">عقد رقم ${esc(q.no)}${q.project?' - '+esc(q.project):''} | قيمة العقد ${fmt(ac.total)} | المسدد ${fmt(ac.paid)} | المتبقي ${fmt(Math.max(0,ac.rem))}</div>
    <table class="pay" style="margin-top:4px"><thead><tr><th>الدفعة</th><th style="width:78px">الاستحقاق</th><th style="width:88px">المبلغ</th><th style="width:88px">المسدد</th><th style="width:88px">المتبقي</th><th style="width:70px">الحالة</th></tr></thead><tbody>${ins.map(p=>`<tr><td>${esc(p.label)}</td><td class="c">${fmtDate(p.due)}</td><td class="e">${fmt(p.amt)}</td><td class="e">${fmt(p.paid)}</td><td class="e">${fmt(p.rem)}</td><td class="c">${p.overdue?'متأخرة':ST_LBL[p.st][0]}</td></tr>`).join('')}</tbody></table>`}).join('');
  const inner=`<div class="d-bar">${esc(s.brandEn)}</div><div class="d-sub">كشف حساب عميل | ACCOUNT STATEMENT</div>
  <div class="d-meta"><div class="mp"><i>العميل</i><span>${esc(c.name)}</span></div><div class="mp"><i>تاريخ الكشف</i><span>${fmtDate(td)}</span></div>
  <div class="mp"><i>الجوال</i><span><bdi dir="ltr">${esc(c.phone)}</bdi></span></div><div class="mp"><i>الرقم الضريبي</i><span><bdi dir="ltr">${esc(c.vat)}</bdi></span></div>
  <div class="mp"><i>جهة الاتصال</i><span>${esc(c.contact)}</span></div><div class="mp"><i>المدينة</i><span>${esc(c.city)}</span></div></div>
  <table class="sm"><thead><tr><th colspan="2">ملخص الحساب</th></tr></thead><tbody><tr><td>إجمالي العقود</td><td class="e">${fmt(a.total)}</td></tr><tr><td>إجمالي المسدد</td><td class="e">${fmt(a.paid)}</td></tr><tr class="gt"><td>${a.bal>=0?'الرصيد المتبقي على العميل':'رصيد دائن للعميل'}</td><td class="e">${fmt(Math.abs(a.bal))}</td></tr></tbody></table>
  ${cons||'<p class="p-intro" style="color:#555">لا توجد عقود لهذا العميل حتى الآن.</p>'}
  <div class="pay-cap">كشف الحركة</div>
  <table class="pay"><thead><tr><th style="width:80px">التاريخ</th><th>البيان</th><th style="width:92px">مدين</th><th style="width:92px">دائن</th><th style="width:96px">الرصيد</th></tr></thead><tbody>${led||'<tr><td colspan="5" class="c">لا توجد حركات</td></tr>'}<tr class="k"><td></td><td>الرصيد الحالي</td><td class="e">${fmt(a.total)}</td><td class="e">${fmt(a.paid)}</td><td class="e">${fmt(a.bal)}</td></tr></tbody></table>
  <p style="font-size:10px;color:#555;margin-top:10px">مدين = قيمة العقود، دائن = المبالغ المستلمة. هذا الكشف مستخرج من سجلات الشركة حتى تاريخه.</p>
  <div class="sigs"><div class="sg"><b>${esc(s.nameAr)}</b><div class="ln2">الاسم: ${esc(s.preparedBy)}</div><div class="ln2">التوقيع: __________________</div>${stampImg('stamp')}</div><div></div></div>`;
  return wrap(inner)}

/* ---- dashboard ---- */
function vDash(){
  const td=today(),cons=S.quotes.filter(q=>q.contract&&q.status!=='lost');
  const tot=r2(cons.reduce((a,q)=>a+cTotal(q),0)),paid=r2(cons.reduce((a,q)=>a+contractAcct(q).paid,0));
  const rem=r2(tot-paid),pct=tot?Math.round(paid/tot*100):0,unl=sumR(LR().filter(r=>!r.qid));
  const due=[];cons.forEach(q=>instRows(q).forEach(p=>{if(p.st!=='paid'&&p.due)due.push({q,p,days:daysDiff(td,p.due)})}));
  due.sort((a,b)=>a.days-b.days);
  const late=due.filter(x=>x.days<0),soon=due.filter(x=>x.days>=0&&x.days<=14),lateAmt=r2(late.reduce((a,x)=>a+x.p.rem,0));
  const fups=S.quotes.filter(q=>(q.status==='sent'||q.status==='draft')&&expiry(q)).map(q=>({q,days:daysDiff(td,expiry(q))})).filter(x=>x.days<=7).sort((a,b)=>a.days-b.days);
  const dueRow=x=>`<div class="li"><div class="m"><b>${esc(qOwner(x.q))}</b><small>${esc(x.p.label)} · عقد <bdi dir="ltr">${esc(x.q.no)}</bdi>${x.q.project?' · '+esc(x.q.project):''}</small></div>
    <div><span class="chip ${x.days<0?'bad':'warn'}">${x.days<0?'متأخرة '+(-x.days)+' يوم':(x.days===0?'تستحق اليوم':'بعد '+x.days+' يوم')}</span><small class="muted" style="display:block">${fmtDate(x.p.due)}</small></div>
    <div class="amt">${fmt(x.p.rem)}</div>
    <div class="row" style="flex-wrap:nowrap"><button class="btn sm pri" type="button" data-act="rc-new-inst" data-qid="${x.q.id}" data-pid="${x.p.id}">استلام</button><a class="btn sm" target="_blank" rel="noopener" href="${esc(waLink(custPhone(x.q),remindMsg(x.q,x.p)))}">تذكير واتساب</a></div></div>`;
  const fRow=x=>`<div class="li"><div class="m"><b>${esc(qOwner(x.q))}</b><small>عرض <bdi dir="ltr">${esc(x.q.no)}</bdi>${x.q.project?' · '+esc(x.q.project):''}</small></div>
    <div><span class="chip ${x.days<0?'bad':'warn'}">${x.days<0?'انتهى منذ '+(-x.days)+' يوم':(x.days===0?'ينتهي اليوم':'ينتهي بعد '+x.days+' يوم')}</span><small class="muted" style="display:block">${fmtDate(expiry(x.q))}</small></div>
    <div class="amt">${fmt(calc(x.q).total)}</div>
    <div class="row" style="flex-wrap:nowrap"><button class="btn sm" type="button" data-act="dash-open-q" data-qid="${x.q.id}">فتح</button><a class="btn sm" target="_blank" rel="noopener" href="${esc(waLink(custPhone(x.q),followMsg(x.q)))}">متابعة واتساب</a></div></div>`;
  const conRow=q=>{const a=contractAcct(q),p=a.total?Math.min(100,Math.round(a.paid/a.total*100)):0;return `<div class="li"><div class="m"><b>${esc(qOwner(q))}</b><small>عقد <bdi dir="ltr">${esc(q.no)}</bdi>${q.project?' · '+esc(q.project):''}</small>
    <div class="bar-p" title="${p}%"><i style="width:${p}%"></i></div></div><div class="amt" style="min-width:120px">${fmt(a.paid)} <small class="muted">من ${fmt(a.total)}</small></div><span class="chip ${p>=100?'ok':''}">${p}%</span>
    <button class="btn sm" type="button" data-act="dash-open-c" data-qid="${q.id}">العقد</button></div>`};
  const rec=LR().slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,5);
  main.innerHTML=`<div class="title-row"><h1>لوحة المتابعة</h1><div class="sp"></div><button class="btn" type="button" data-act="nav" data-v="customers">العملاء</button><button class="btn pri" type="button" data-act="rc-new-list">سند قبض جديد</button></div>
  <div class="kpis"><div class="kpi"><small>إجمالي العقود</small><b>${fmt(tot)}</b><small>${cons.length} عقد</small></div>
  <div class="kpi"><small>المحصّل على العقود</small><b>${fmt(paid)}</b><small>${pct}% من قيمة العقود</small></div>
  <div class="kpi"><small>المتبقي على العقود</small><b>${fmt(rem)}</b><small>${unl>0?'سندات غير مرتبطة بعقد: '+fmt(unl):'&nbsp;'}</small></div>
  <div class="kpi ${late.length?'bad':''}"><small>دفعات متأخرة</small><b>${fmt(lateAmt)}</b><small>${late.length} دفعة</small></div></div>
  ${approvalsCard()}<div class="card"><h3>دفعات متأخرة <span class="chip ${late.length?'bad':'ok'}">${late.length}</span></h3>${late.length?late.map(dueRow).join(''):'<div class="empty">لا توجد دفعات متأخرة. تظهر هنا الدفعات التي لها تاريخ استحقاق وتجاوزته دون سداد.</div>'}</div>
  <div class="card"><h3>مستحقة خلال 14 يوماً <span class="chip">${soon.length}</span></h3>${soon.length?soon.map(dueRow).join(''):'<div class="empty">لا توجد دفعات قريبة الاستحقاق. حدد تاريخ استحقاق لكل دفعة من شاشة العقد.</div>'}</div>
  <div class="card"><h3>عروض تحتاج متابعة <span class="chip ${fups.length?'warn':''}">${fups.length}</span></h3>${fups.length?fups.map(fRow).join(''):'<div class="empty">لا توجد عروض منتهية أو توشك على الانتهاء خلال 7 أيام.</div>'}</div>
  <div class="card"><h3>حالة التحصيل في العقود</h3>${cons.length?cons.map(conRow).join(''):'<div class="empty">لا توجد عقود بعد. حوّل عرضاً إلى عقد لتظهر هنا.</div>'}</div>
  <div class="card"><h3>آخر السندات</h3>${rec.length?rec.map(r=>{const q=r.qid?S.quotes.find(x=>x.id===r.qid):null;return `<div class="li"><div class="m"><b>${esc(custName(r.custId))}</b><small><bdi dir="ltr">${esc(r.no)}</bdi> · ${fmtDate(r.date)} · ${esc(r.method)}${q?' · عقد '+esc(q.no):''}</small></div><div class="amt">${fmt(r.amount)}</div></div>`}).join(''):'<div class="empty">لم تُسجل سندات قبض بعد.</div>'}</div>`;
}

/* ---- customers ---- */
function vCustomers(){
  main.innerHTML=`<div class="title-row"><h1>العملاء</h1><span class="chip" id="cu-n"></span><div class="sp"></div></div>
  <div class="card"><h3>إضافة عميل</h3><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))"><label class="fld"><span>اسم العميل / المنشأة</span><input id="cu-name"></label><label class="fld"><span>الجوال</span><input id="cu-phone" class="ltr"></label><div class="fld"><span>&nbsp;</span><button class="btn pri" type="button" data-act="cu-add">إضافة وفتح الملف</button></div></div></div>
  <div class="card"><div class="row" style="margin-bottom:12px"><input id="cq" placeholder="ابحث بالاسم أو الجوال أو الرقم الضريبي" style="max-width:380px"></div>
  <div class="tablewrap"><table class="t" style="min-width:760px"><thead><tr><th>العميل</th><th>الجوال</th><th>العقود</th><th class="num">قيمة العقود</th><th class="num rc-col">المسدد</th><th class="num rc-col">المتبقي</th><th></th></tr></thead><tbody id="crows"></tbody></table></div></div>`;
  const draw=()=>{const f=norm($('#cq').value);const rows=S.customers.filter(c=>!f||norm(c.name+' '+c.phone+' '+c.vat+' '+c.contact).includes(f)).sort(byName);$('#cu-n').textContent=`${S.customers.length} عميل`;
    $('#crows').innerHTML=rows.length?rows.map(c=>{const a=custAcct(c.id);return `<tr data-id="${c.id}"><td><b>${esc(c.name)||'بدون اسم'}</b><small class="muted" style="display:block">${esc(c.city)}</small></td><td class="num">${esc(c.phone)}</td><td>${a.cons.length}</td><td class="num">${fmt(a.total)}</td><td class="num rc-col">${fmt(a.paid)}</td><td class="num rc-col"><span class="chip ${a.bal>0.004?'warn':(a.bal<-0.004?'':'ok')}">${fmt(a.bal)}</span></td>
    <td><div class="row" style="justify-content:flex-end;flex-wrap:nowrap"><button class="btn sm" type="button" data-act="cu-open">فتح</button><button class="btn sm" type="button" data-act="cu-receipt">سند قبض</button></div></td></tr>`}).join(''):`<tr><td colspan="7" class="empty">لا يوجد عملاء. أضف عميلاً أو اكتب اسمه في عرض سعر جديد وسيُضاف تلقائياً.</td></tr>`};
  draw();$('#cq').addEventListener('input',draw);
}
function vCustomer(){
  const c=custById(S.ui.cid);if(!c)return go('customers');
  const F=(k,l,ex='')=>`<label class="fld"><span>${l}</span><input data-cu="${k}" value="${esc(c[k])}" ${ex}></label>`;
  main.innerHTML=`<div class="split"><section>
  <div class="title-row"><h1 id="cu-h">${esc(c.name)||'عميل جديد'}</h1></div>
  <div class="card"><h3>بيانات العميل</h3><div class="grid g2">${F('name','اسم العميل / المنشأة')}${F('contact','جهة الاتصال')}${F('phone','الجوال','class="ltr"')}${F('email','البريد الإلكتروني','class="ltr"')}${F('city','المدينة')}${F('vat','الرقم الضريبي','class="ltr"')}${F('cr','السجل التجاري','class="ltr"')}${F('address','العنوان الوطني')}</div>
  <label class="fld" style="margin-top:12px"><span>ملاحظات</span><textarea data-cu="notes" rows="2">${esc(c.notes)}</textarea></label></div>
  <div class="card rc-col"><h3>حساب العميل</h3><div id="cu-acct" class="tot"></div></div>
  <div class="card"><h3>العقود والدفعات</h3><div id="cu-cons"></div></div>
  <div class="card"><h3>عروض بدون عقد</h3><div id="cu-qs"></div></div>
  <div class="card rc-col"><h3>سندات القبض</h3><div id="cu-rcs"></div></div>
  <div id="sharebox"></div>
  <div class="sticky-act"><button class="btn pri" type="button" data-act="cu-stmt">طباعة كشف الحساب</button><button class="btn red" type="button" data-act="cu-receipt-d">سند قبض جديد</button><button class="btn" type="button" data-act="cu-share">مشاركة واتساب</button><button class="btn danger" type="button" data-act="cu-del">حذف العميل</button><button class="btn" type="button" data-act="nav" data-v="customers">العملاء</button></div>
  </section><aside class="pv"><div class="bar"><b>كشف الحساب Letter</b><span>يتحدث فوراً</span></div><div class="pv-wrap"><div class="sheet" id="sheet"></div></div></aside></div>`;
  refreshCu();
}
function refreshCu(){
  const c=custById(S.ui.cid);if(!c||S.ui.view!=='customer')return;const a=custAcct(c.id);
  $('#cu-acct').innerHTML=`<div class="r"><span>إجمالي العقود</span><span class="v">${fmt(a.total)}</span></div><div class="r"><span>إجمالي المسدد</span><span class="v">${fmt(a.paid)}</span></div><div class="r big"><span>${a.bal>=0?'الرصيد المتبقي':'رصيد دائن للعميل'}</span><span class="v">${fmt(Math.abs(a.bal))}</span></div>`;
  $('#cu-cons').innerHTML=a.cons.length?a.cons.map(q=>{const ins=instRows(q),ac=contractAcct(q);return `<div class="grp"><b>عقد ${esc(q.no)}</b><span class="muted">${esc(q.project)}</span><span class="sp"></span><span class="gs">${fmt(ac.paid)} / ${fmt(ac.total)}</span></div>
    <div class="tablewrap"><table class="t" style="min-width:560px"><thead><tr><th>الدفعة</th><th>الاستحقاق</th><th class="num">المبلغ</th><th class="num">المسدد</th><th>الحالة</th><th></th></tr></thead><tbody>${ins.map(p=>`<tr data-qid="${q.id}" data-pid="${p.id}"><td>${esc(p.label)}</td><td>${fmtDate(p.due)}</td><td class="num">${fmt(p.amt)}</td><td class="num">${fmt(p.paid)}</td><td><span class="chip ${p.overdue?'bad':ST_LBL[p.st][1]}">${p.overdue?'متأخرة':ST_LBL[p.st][0]}</span></td><td>${p.st==='paid'?'':'<button class="btn sm" type="button" data-act="rc-new-inst" data-qid="'+q.id+'" data-pid="'+p.id+'">استلام</button>'}</td></tr>`).join('')}</tbody></table></div>`}).join(''):'<div class="empty">لا توجد عقود لهذا العميل. اربط العميل بعرض سعر ثم حوّله إلى عقد.</div>';
  const nq=S.quotes.filter(q=>q.custId===c.id&&!q.contract);
  $('#cu-qs').innerHTML=nq.length?nq.map(q=>`<div class="li"><div class="m"><b><bdi dir="ltr">${esc(q.no)}</bdi></b><small>${esc(q.project)} · ${fmtDate(q.date)}</small></div><div>${qChips(q)}</div><div class="amt">${fmt(calc(q).total)}</div><button class="btn sm" type="button" data-act="dash-open-q" data-qid="${q.id}">فتح</button></div>`).join(''):'<div class="empty" style="padding:16px">لا توجد عروض بدون عقد.</div>';
  const rs=S.receipts.filter(r=>r.custId===c.id);
  $('#cu-rcs').innerHTML=rs.length?`<div class="tablewrap"><table class="t" style="min-width:520px"><thead><tr><th>السند</th><th>التاريخ</th><th>الطريقة</th><th class="num">المبلغ</th><th></th></tr></thead><tbody>${rs.map(r=>`<tr data-id="${r.id}"><td><bdi dir="ltr">${esc(r.no)}</bdi>${r.void?' <span class="chip bad">ملغى</span>':''}</td><td>${fmtDate(r.date)}</td><td>${esc(r.method)}</td><td class="num">${fmt(r.amount)}</td><td><button class="btn sm" type="button" data-act="rc-edit">فتح</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty" style="padding:16px">لا توجد سندات لهذا العميل.</div>';
  $('#sheet').innerHTML=statementDoc(c.id);fitPreview();
}

/* ---- receipts ---- */
let RC=null;
const newRC=o=>Object.assign({id:'',no:'',date:today(),custId:'',qid:'',payId:'',amount:0,method:METHODS[0],ref:'',notes:''},o||{});
function startReceipt(o){RC=newRC(o);go('receipt')}
const conOptions=cid=>S.quotes.filter(q=>q.contract&&q.custId===cid);
function rcAuto(){
  const r=RC;r.payId='';r.amount=0;if(!r.qid)return;
  const q=S.quotes.find(x=>x.id===r.qid);if(!q||!q.contract)return;
  const nx=instRows(q,r.id).find(p=>p.rem>0);
  if(nx){r.payId=nx.id;r.amount=nx.rem}else{const a=contractAcct(q,r.id);r.amount=a.rem>0?a.rem:0}}
function vPayments(){
  const total=sumR(LR()),mt=sumR(LR().filter(r=>String(r.date).startsWith(today().slice(0,7))));
  main.innerHTML=`<div class="title-row"><h1>الدفعات وسندات القبض</h1><div class="sp"></div><button class="btn" type="button" data-act="xl-export">تصدير Excel</button><button class="btn pri" type="button" data-act="rc-new-list">سند قبض جديد</button></div>
  <div class="kpis" style="margin-bottom:14px"><div class="kpi"><small>عدد السندات</small><b>${LR().length}</b><small>&nbsp;</small></div><div class="kpi"><small>إجمالي المقبوض</small><b>${fmt(total)}</b><small>&nbsp;</small></div><div class="kpi"><small>مقبوض هذا الشهر</small><b>${fmt(mt)}</b><small>&nbsp;</small></div></div>
  <div class="card"><div class="row" style="margin-bottom:12px"><input id="rq" placeholder="ابحث برقم السند أو العميل أو المرجع" style="max-width:420px"></div>
  <div class="tablewrap"><table class="t" style="min-width:820px"><thead><tr><th>السند</th><th>التاريخ</th><th>العميل</th><th>مرتبط بـ</th><th>الطريقة</th><th class="num">المبلغ ر.س</th><th></th></tr></thead><tbody id="rrows"></tbody></table></div></div>`;
  const draw=()=>{const f=norm($('#rq').value);
    const rows=S.receipts.filter(r=>!f||norm(r.no+' '+custName(r.custId)+' '+r.ref+' '+r.method).includes(f)).sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.no).localeCompare(String(a.no)));
    $('#rrows').innerHTML=rows.length?rows.map(r=>{const q=r.qid?S.quotes.find(x=>x.id===r.qid):null;const p=q&&q.contract&&r.payId?(q.contract.payments.find(x=>x.id===r.payId)||{}).label:'';
      return `<tr data-id="${r.id}"><td><b><bdi dir="ltr">${esc(r.no)}</bdi></b>${r.void?' <span class="chip bad">ملغى</span>':''}</td><td>${fmtDate(r.date)}</td><td>${esc(custName(r.custId))}</td><td>${q?'عقد <bdi dir="ltr">'+esc(q.no)+'</bdi>'+(p?' · '+esc(p):''):'<span class="muted">سند حر</span>'}</td><td>${esc(r.method)}</td><td class="num">${fmt(r.amount)}</td>
      <td><div class="row" style="justify-content:flex-end;flex-wrap:nowrap"><button class="btn sm" type="button" data-act="rc-edit">فتح</button><button class="btn sm" type="button" data-act="rc-print-l">طباعة</button>${r.void?'':'<button class="btn sm danger" type="button" data-act="rc-void">إلغاء</button>'}</div></td></tr>`}).join(''):`<tr><td colspan="7" class="empty">لا توجد سندات. اضغط «سند قبض جديد» لتسجيل أول دفعة.</td></tr>`};
  draw();$('#rq').addEventListener('input',draw);
}
function vReceipt(){
  if(!RC)RC=newRC();const r=RC,cons=conOptions(r.custId),q=r.qid?S.quotes.find(x=>x.id===r.qid):null,ins=q&&q.contract?instRows(q,r.id):[];
  main.innerHTML=`<div class="split"><section>
  <div class="title-row"><h1>${r.id?'سند قبض':'سند قبض جديد'} ${r.no?`<bdi dir="ltr">${esc(r.no)}</bdi>`:''}</h1></div>
  ${r.void?`<div class="note bad">سند ملغى بتاريخ ${fmtDate(String(r.voidAt||'').slice(0,10))}. السبب: ${esc(r.voidReason)}</div>`:''}<div class="card"><h3>العميل والعقد</h3><div class="grid g2">
    <label class="fld"><span>التاريخ</span><input type="date" data-r="date" value="${esc(r.date)}"></label>
    <label class="fld"><span>العميل</span><select data-rs="custId"><option value="">اختر العميل</option>${S.customers.slice().sort(byName).map(c=>`<option value="${c.id}" ${c.id===r.custId?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label>
    <label class="fld"><span>العقد</span><select data-rs="qid"><option value="">سند حر، غير مرتبط بعقد</option>${cons.map(x=>`<option value="${x.id}" ${x.id===r.qid?'selected':''}>${esc(x.no)}${x.project?' - '+esc(x.project):''}</option>`).join('')}</select></label>
    ${q?`<label class="fld"><span>الدفعة</span><select data-rs="payId"><option value="">دفعة عامة على حساب العقد</option>${ins.map(p=>`<option value="${p.id}" ${p.id===r.payId?'selected':''}>${esc(p.label)} - المتبقي ${fmt(p.rem)}</option>`).join('')}</select></label>`:'<div></div>'}</div>
  <div id="r-ctx" style="margin-top:12px"></div>
  <p class="muted" style="font-size:12px;margin:10px 0 0">العميل غير موجود؟ <button class="btn sm" type="button" data-act="nav" data-v="customers">أضفه من شاشة العملاء</button></p></div>
  <div class="card"><h3>المبلغ وطريقة الدفع</h3><div class="grid g2">
    <label class="fld"><span>المبلغ (ر.س)</span><input type="number" min="0" step="any" data-r="amount" value="${esc(r.amount||'')}"></label>
    <label class="fld"><span>طريقة الدفع</span><select data-r="method">${METHODS.map(m=>`<option ${m===r.method?'selected':''}>${m}</option>`).join('')}</select></label>
    <label class="fld"><span>رقم الحوالة / الشيك</span><input data-r="ref" class="ltr" value="${esc(r.ref)}"></label></div>
  <label class="fld" style="margin-top:12px"><span>البيان (اختياري، يُكتب تلقائياً إن تُرك فارغاً)</span><textarea data-r="notes" rows="2">${esc(r.notes)}</textarea></label></div>
  <div id="sharebox"></div>
  <div class="sticky-act"><button class="btn pri" type="button" data-act="rc-save">حفظ السند</button><button class="btn" type="button" data-act="rc-print">طباعة / حفظ PDF</button>${r.id&&!r.void?'<button class="btn danger" type="button" data-act="rc-void">إلغاء السند</button>':''}<button class="btn" type="button" data-act="rc-share">مشاركة واتساب</button><button class="btn" type="button" data-act="rc-new">سند جديد</button><button class="btn" type="button" data-act="nav" data-v="payments">قائمة السندات</button></div>
  </section><aside class="pv"><div class="bar"><b>معاينة Letter</b><span>تتحدث فوراً</span></div><div class="pv-wrap"><div class="sheet" id="sheet"></div></div></aside></div>`;
  refreshRC();
}
function refreshRC(){
  if(S.ui.view!=='receipt'||!RC)return;const r=RC,q=r.qid?S.quotes.find(x=>x.id===r.qid):null,amt=n0(r.amount);let h='';
  if(q&&q.contract){
    const a=contractAcct(q,r.id),p=r.payId?instRows(q,r.id).find(x=>x.id===r.payId):null;
    h=`<div class="tot"><div class="r"><span>قيمة العقد</span><span class="v">${fmt(a.total)}</span></div><div class="r"><span>المسدد سابقاً</span><span class="v">${fmt(a.paid)}</span></div><div class="r"><span>المتبقي من العقد</span><span class="v">${fmt(Math.max(0,a.rem))}</span></div>`+
    (p?`<div class="r"><span>مبلغ الدفعة «${esc(p.label)}»</span><span class="v">${fmt(p.amt)}</span></div><div class="r"><span>المتبقي من الدفعة</span><span class="v">${fmt(p.rem)} <button class="btn sm" type="button" data-act="rc-fill">تعبئة المتبقي</button></span></div>`:'')+`</div>`;
    const lim=p?p.rem:Math.max(0,a.rem);
    if(amt>lim+0.004)h+=`<div class="note" style="margin-top:10px">المبلغ أكبر من المتبقي (${fmt(lim)} ر.س) بمقدار ${fmt(amt-lim)} ر.س، ويمكن حفظه كدفعة زائدة.</div>`;
  }else if(r.custId){
    const a=custAcct(r.custId);h=conOptions(r.custId).length?'<span class="muted">اختر عقداً لربط السند بإحدى دفعاته، أو اتركه سنداً حراً.</span>':`<span class="muted">لا توجد عقود لهذا العميل، سيُسجل السند كسند حر. الرصيد الحالي: ${fmt(a.bal)} ر.س</span>`}
  $('#r-ctx').innerHTML=h;$('#sheet').innerHTML=receiptDoc(r);fitPreview();
}

/* ---- revisions ---- */
function drawVers(q){
  const box=$('#vers');if(!box)return;const fam=q.fam?S.quotes.filter(x=>x.fam===q.fam).sort((a,b)=>n0(a.rev)-n0(b.rev)):[q];
  if(fam.length<2){box.hidden=true;return}box.hidden=false;let prev=null;
  box.innerHTML=`<h3>إصدارات العرض</h3><div class="tablewrap"><table class="t" style="min-width:520px"><thead><tr><th>الرقم</th><th>التاريخ</th><th class="num">الصافي ر.س</th><th class="num">الفرق عن السابق</th><th>الحالة</th><th></th></tr></thead><tbody>${fam.map(x=>{const t=calc(x).total,d=prev==null?null:r2(t-prev);prev=t;
    return `<tr data-id="${x.id}" ${x.id===q.id?'style="background:var(--navy-soft)"':''}><td><b><bdi dir="ltr">${esc(x.no)}</bdi></b></td><td>${fmtDate(x.date)}</td><td class="num">${fmt(t)}</td><td class="num">${d==null?'':(d>0?'+':'')+fmt(d)}</td><td>${qChips(x)}</td><td>${x.id===q.id?'':'<button class="btn sm" type="button" data-act="open">فتح</button>'}</td></tr>`}).join('')}</tbody></table></div>`}
function clHint(){
  const q=curQ(),el=$('#cl-hint');if(!q||!el)return;const nm=String(q.client||'').trim();
  if(!nm){el.textContent='';return}
  const c=S.customers.find(x=>norm(x.name)===norm(nm));
  el.textContent=c?('عميل مسجل'+(c.phone?' · '+c.phone:'')):'عميل جديد، يُضاف إلى العملاء عند الخروج من الحقل'}

/* ---- excel export ---- */
function exportXlsx(){
  if(!window.XLSX){toast('تعذر تحميل مكتبة Excel، تأكد من الاتصال بالإنترنت ثم أعد المحاولة');return}
  const X=window.XLSX,wb=X.utils.book_new();
  const add=(name,head,rows,w)=>{const ws=X.utils.aoa_to_sheet([head,...rows]);ws['!cols']=w.map(x=>({wch:x}));X.utils.book_append_sheet(wb,ws,name)};
  const stl=q=>(STATUS[q.status]||[''])[0];
  add('العملاء',['العميل','جهة الاتصال','الجوال','البريد','المدينة','الرقم الضريبي','السجل التجاري','العنوان','عدد العقود','قيمة العقود','المسدد','الرصيد','ملاحظات'],
    S.customers.slice().sort(byName).map(c=>{const a=custAcct(c.id);return [c.name,c.contact,c.phone,c.email,c.city,c.vat,c.cr,c.address,a.cons.length,a.total,a.paid,a.bal,c.notes]}),[28,20,14,24,14,18,16,28,10,14,14,14,24]);
  add('العروض',['الرقم','الإصدار','التاريخ','العميل','المشروع','الموقع','الحالة','قبل الضريبة','الضريبة','الخصم','الصافي','عقد'],
    S.quotes.map(q=>{const c=calc(q);return [q.no,q.rev||1,q.date,qOwner(q),q.project,q.location,stl(q),c.sub,c.vat,c.disc,c.total,q.contract?'نعم':'لا']}),[14,8,12,28,26,14,14,14,12,12,14,8]);
  add('بنود العروض',['رقم العرض','القسم','الوصف','النوع','الوحدة','العدد','السعر','الإجمالي'],
    S.quotes.flatMap(q=>q.lines.map(l=>[q.no,l.group,l.desc,l.brand,l.unit,n0(l.qty),n0(l.price),lineTot(l)])),[14,32,60,14,8,8,12,14]);
  add('دفعات العقود',['رقم العقد','العميل','المشروع','الدفعة','النسبة %','المبلغ','الاستحقاق','المسدد','المتبقي','الحالة'],
    S.quotes.filter(q=>q.contract).flatMap(q=>instRows(q).map(p=>[q.no,qOwner(q),q.project,p.label,n0(p.pct),p.amt,p.due||'',p.paid,p.rem,p.overdue?'متأخرة':ST_LBL[p.st][0]])),[14,28,26,30,10,14,12,14,14,12]);
  add('سندات القبض',['السند','التاريخ','العميل','العقد','الدفعة','المبلغ','الطريقة','رقم الحوالة / الشيك','البيان','الحالة'],
    S.receipts.map(r=>{const q=r.qid?S.quotes.find(x=>x.id===r.qid):null;const p=q&&q.contract?q.contract.payments.find(x=>x.id===r.payId):null;return [r.no,r.date,custName(r.custId),q?q.no:'',p?p.label:'',n0(r.amount),r.method,r.ref,r.notes,r.void?'ملغى: '+r.voidReason:'ساري']}),[14,12,28,14,30,14,14,20,40,24]);
  add('المكتبة',['القسم','الوصف','النوع','الوحدة','السعر'],S.items.map(i=>[i.cat,i.desc,i.brand,i.unit,n0(i.price)]),[32,60,14,8,12]);
  wb.Workbook={Views:[{RTL:true}]};
  try{X.writeFile(wb,`rass-data-${today()}.xlsx`);toast('تم تصدير ملف Excel')}catch(e){toast('تعذر إنشاء الملف')}
}

/* ---- actions ---- */
function armed(b){if(!b.classList.contains('armed')){b.classList.add('armed');const old=b.textContent;b.textContent='تأكيد؟';setTimeout(()=>{if(b.isConnected){b.classList.remove('armed');b.textContent=old}},3000);return false}return true}
function act2(a,b,q){
  const tr=b.closest('tr'),id=tr?tr.dataset.id:'';
  switch(a){
    case 'del-q':{if(S.receipts.some(r=>r.qid===id)){toast('لا يمكن حذف عرض عليه سندات قبض');return true}if(!armed(b))return true;S.quotes=S.quotes.filter(x=>x.id!==id);save();render();return true}
    case 'pay-add':q.contract.payments.push({id:uid(),label:'دفعة جديدة',pct:0,due:''});save();drawPay();refreshC();return true;
    case 'pay-rm':{const p=q.contract.payments[+tr.dataset.pi];if(p&&S.receipts.some(r=>r.qid===q.id&&r.payId===p.id)){toast('لا يمكن حذف دفعة عليها سندات قبض');return true}q.contract.payments.splice(+tr.dataset.pi,1);save();drawPay();refreshC();return true}
    case 'share-q':openShare(quoteMsg(q),custPhone(q),'أرفق ملف PDF يدوياً: اضغط «طباعة / حفظ PDF» ثم احفظه وأرسله في المحادثة.');return true;
    case 'sh-copy':{const t=$('#sh-t');const ok=()=>toast('تم نسخ النص');if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t.value).then(ok,()=>{t.select();document.execCommand('copy');ok()});else{t.select();document.execCommand('copy');ok()}return true}
    case 'dash-open-q':go('quote',b.dataset.qid);return true;
    case 'dash-open-c':{S.ui.qid=b.dataset.qid;ensureContract(curQ());go('contract',b.dataset.qid);return true}
    case 'cu-add':{const nm=$('#cu-name').value.trim();if(!nm){toast('اكتب اسم العميل');$('#cu-name').focus();return true}const c=newCust(nm);c.phone=$('#cu-phone').value.trim();S.customers.push(c);S.ui.cid=c.id;go('customer');return true}
    case 'cu-open':S.ui.cid=id;go('customer');return true;
    case 'cu-receipt':startReceipt({custId:id});rcAuto0();return true;
    case 'cu-receipt-d':startReceipt({custId:S.ui.cid});rcAuto0();return true;
    case 'cu-stmt':{const c=custById(S.ui.cid);printDoc(statementDoc(c.id),'كشف حساب - '+c.name);return true}
    case 'cu-share':{const c=custById(S.ui.cid);openShare(stmtMsg(c),c.phone,'أرفق كشف الحساب بصيغة PDF يدوياً إن أردت.');return true}
    case 'cu-del':{const c=custById(S.ui.cid);if(S.quotes.some(x=>x.custId===c.id)||S.receipts.some(r=>r.custId===c.id)){toast('لا يمكن حذف عميل له عروض أو سندات');return true}if(!armed(b))return true;S.customers=S.customers.filter(x=>x.id!==c.id);save();go('customers');return true}
    case 'rc-new-list':startReceipt();return true;
    case 'rc-new':RC=newRC();vReceipt();return true;
    case 'rc-new-inst':{const qq=S.quotes.find(x=>x.id===b.dataset.qid);const p=instRows(qq).find(x=>x.id===b.dataset.pid);startReceipt({custId:qq.custId,qid:qq.id,payId:b.dataset.pid,amount:p?p.rem:0});return true}
    case 'rc-from-pay':{const p=instRows(q)[+tr.dataset.pi];startReceipt({custId:q.custId,qid:q.id,payId:p.id,amount:p.rem});return true}
    case 'rc-edit':{const r=S.receipts.find(x=>x.id===id);RC=Object.assign(newRC(),JSON.parse(JSON.stringify(r)));go('receipt');return true}
    case 'rc-print-l':{const r=S.receipts.find(x=>x.id===id);printDoc(receiptDoc(r),'سند قبض '+r.no);return true}
    case 'rc-fill':{const qq=S.quotes.find(x=>x.id===RC.qid),p=qq&&instRows(qq,RC.id).find(x=>x.id===RC.payId);if(p){RC.amount=p.rem;$('[data-r=amount]').value=p.rem;refreshRC()}return true}
    case 'rc-print':{if(!RC.id){toast('احفظ السند أولاً');return true}printDoc(receiptDoc(RC),'سند قبض '+RC.no);return true}
    case 'rc-share':{if(!RC.id){toast('احفظ السند أولاً');return true}openShare(receiptMsg(RC),(custById(RC.custId)||{}).phone,'يمكنك إرفاق ملف PDF للسند بعد حفظه من الطباعة.');return true}
    case 'xl-export':exportXlsx();return true;
  }
  return false}
function rcAuto0(){const r=RC;const cs=conOptions(r.custId);if(cs.length===1){r.qid=cs[0].id;rcAuto();vReceipt()}}

/* ---- extra listeners ---- */
document.addEventListener('input',e=>{
  const t=e.target;
  if(t.dataset.f==='client')clHint();
  if(t.dataset.cu){const c=custById(S.ui.cid);if(!c)return;c[t.dataset.cu]=t.value;save();if(t.dataset.cu==='name')$('#cu-h').textContent=c.name||'عميل جديد';refreshCu();return}
  if(t.dataset.r&&RC){const k=t.dataset.r;RC[k]=k==='amount'?(t.value===''?0:n0(t.value)):t.value;refreshRC();return}
  if(t.id==='sh-t'){const a=$('#sh-a');a.href=waLink($('#sharebox').dataset.phone,t.value)}
});
document.addEventListener('change',e=>{
  const t=e.target,q=curQ();
  if(t.dataset.rs&&RC){const k=t.dataset.rs;RC[k]=t.value;
    if(k==='custId'){const cs=conOptions(RC.custId);RC.qid=cs.length===1?cs[0].id:'';rcAuto()}
    else if(k==='qid'){rcAuto()}
    else if(k==='payId'){const qq=S.quotes.find(x=>x.id===RC.qid);if(qq){if(RC.payId){const p=instRows(qq,RC.id).find(x=>x.id===RC.payId);RC.amount=p?p.rem:0}else{const a=contractAcct(qq,RC.id);RC.amount=a.rem>0?a.rem:0}}}
    vReceipt();return}
  if(t.dataset.r&&RC){refreshRC();return}
  if(t.dataset.f==='client'&&q){
    const nm=t.value.trim();
    if(nm){let c=S.customers.find(x=>norm(x.name)===norm(nm));if(!c){c=newCust(nm);S.customers.push(c);toast('أُضيف «'+nm+'» إلى العملاء')}
      q.custId=c.id;q.client=c.name;t.value=c.name;if(!q.location&&c.city){q.location=c.city;const l=$('[data-f=location]');if(l)l.value=c.city}}
    else q.custId='';
    save();clHint();refreshQ();renderTabs();return}
});


/* ===== modal ===== */
function modal(html,mount){const m=$('#modal');m.innerHTML=`<div role="dialog" aria-modal="true">${html}</div>`;m.hidden=false;if(mount)mount(m);const f=$('input,textarea,select',m);if(f)f.focus()}
const closeModal=()=>{const m=$('#modal');m.hidden=true;m.innerHTML=''};
function askReason(title,label,okText,cb,opt){
  modal(`<h3>${esc(title)}</h3><label class="fld"><span>${esc(label)}</span><textarea id="rs-t" rows="3"></textarea></label><div class="auth-err" id="rs-e" hidden></div><div class="row"><button class="btn pri" type="button" id="rs-ok">${esc(okText)}</button><button class="btn" type="button" data-act="modal-close">إلغاء</button></div>`,m=>{
    $('#rs-ok',m).onclick=async()=>{const v=$('#rs-t',m).value.trim();if(!(opt&&opt.optional)&&v.length<3){const e=$('#rs-e',m);e.textContent='اكتب السبب';e.hidden=false;return}
      try{await cb(v);closeModal()}catch(e){const er=$('#rs-e',m);er.textContent=e.message;er.hidden=false}}})}
function tempPwModal(title,pw,note){
  modal(`<h3>${esc(title)}</h3><p class="muted" style="margin:0">${esc(note)}</p><div class="pwbox" id="tp">${esc(pw)}</div><div class="row"><button class="btn pri" type="button" id="tp-c">نسخ</button><button class="btn" type="button" data-act="modal-close">تم</button></div>`,m=>{
    $('#tp-c',m).onclick=()=>{navigator.clipboard&&navigator.clipboard.writeText(pw).then(()=>toast('تم النسخ'),()=>{})}})}
const when=iso=>iso?new Date(iso).toLocaleString('en-GB',{timeZone:'Asia/Riyadh',hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'';

/* ===== access control in the UI ===== */
const SEARCH_OK=new Set(['aq','cq','rq','lq','srch','sh-t','sh-url','rp-month','au-user','au-act']);
const ACT_NEED={'new-quote':'qcreate','dup':'qcreate','new-rev':'qcreate','add-line':'qedit','ln-up':'qedit','ln-dn':'qedit','ln-rm':'qedit','ln-lib':'qedit','pick':'qedit','sh-create':'qedit','sh-revoke':'qedit','ap-req':'qedit',
 'pay-add':'cedit','pay-rm':'cedit','to-contract':'qcontract','cu-add':'cust','cu-del':'cust','lib-del':'items','lib-std':'items','lib-ok':'items','lib-ok-all':'items','lib-export':'rcread0',
 'rc-new-list':'rcw','rc-new-inst':'rcw','rc-from-pay':'rcw','cu-receipt':'rcw','cu-receipt-d':'rcw','rc-save':'rcw','rc-new':'rcw','rc-fill':'rcw','rc-void':'void','xl-export':'rcread','cu-stmt':'rcread','dash-ap-ok':'approve','dash-ap-no':'approve','ap-ok':'approve','ap-no':'approve'};
function has(n,q){const p=P();switch(n){case 'qcreate':return canCreateQ();case 'qedit':return canQ(q);case 'cedit':return canC(q);case 'qcontract':return !!q&&(!!q.contract||canQ(q));case 'cust':return p.customersWrite;case 'items':return p.itemsWrite;case 'rcw':return p.receiptsWrite;case 'void':return p.voidReceipts;case 'rcread':return p.receipts;case 'approve':return p.approve;case 'rcread0':return true}return true}
function applyAccess(){
  const p=P(),v=S.ui.view,q=curQ();let lock=false,dueOk=false;
  if(v==='quote')lock=!canQ(q);
  else if(v==='contract'){const m=q&&qMode(q);lock=!(m==='full'||m==='contract');dueOk=m==='due'}
  else if(v==='customers'||v==='customer')lock=!p.customersWrite;
  else if(v==='library')lock=!p.itemsWrite;
  else if(v==='settings')lock=!p.settingsWrite;
  else if(v==='receipt')lock=!p.receiptsWrite||!!(typeof RC!=='undefined'&&RC&&RC.id);
  if(lock)$$('#main input,#main textarea,#main select').forEach(e=>{if(SEARCH_OK.has(e.id)||e.type==='file'&&false)return;if(dueOk&&e.dataset.p==='due')return;e.disabled=true});
  $$('#main [data-act]').forEach(b=>{const n=ACT_NEED[b.dataset.act];if(n&&!has(n,q))b.hidden=true;if(b.dataset.act==='rc-save'&&typeof RC!=='undefined'&&RC&&RC.id)b.hidden=true});
  $$('#main .rc-col').forEach(e=>e.hidden=!p.receipts);
  document.body.classList.toggle('ro',lock)}

/* ===== customer approval link / discount approval (quote screen) ===== */
const APK=q=>JSON.stringify([q._approval,q._share,q._decision&&q._decision.at,q.status,r2(calc(q).pct),q.lines.length]);
function drawExtra(q){
  const box=$('#qextra');if(!box)return;const k=APK(q);if(box.dataset.k===k)return;box.dataset.k=k;
  const ap=q._approval||{state:'none'},th=n0(S.settings.discApprovalPct??5),c=calc(q);let h='';
  if(ap.state==='pending')h+=`<div class="note">الخصم (${r2(c.pct)}%) يتجاوز حد الاعتماد (${th}%) وهو بانتظار اعتماد المدير. لا يمكن إرسال العرض أو اعتماده أو تحويله إلى عقد قبل ذلك.${P().approve?`<div class="row" style="margin-top:8px"><button class="btn sm pri" type="button" data-act="ap-ok">اعتماد الخصم</button><button class="btn sm danger" type="button" data-act="ap-no">إرجاع للتعديل</button></div>`:''}</div>`;
  else if(ap.state==='rejected')h+=`<div class="note bad">أعاد المدير طلب الخصم${ap.note?': '+esc(ap.note):''}. خفّض الخصم إلى ${th}% أو أقل، أو أعد طلب الاعتماد.<div class="row" style="margin-top:8px"><button class="btn sm" type="button" data-act="ap-req">إعادة طلب الاعتماد</button></div></div>`;
  else if(ap.state==='approved'&&c.pct>th)h+=`<div class="note" style="background:var(--ok-bg);color:var(--ok)">الخصم ${r2(ap.pct)}% معتمد من ${esc(ap.by||'المدير')}.</div>`;
  const mine=canQ(q);
  if(q._share){const url=location.origin+'/q/'+q._share.token;
    h+=`<div class="card"><h3>رابط اعتماد العميل</h3><div class="linkbox"><input id="sh-url" readonly value="${esc(url)}"><button class="btn sm" type="button" data-act="sh-copy-url">نسخ</button><a class="btn sm" target="_blank" rel="noopener" href="${esc(waLink(custPhone(q),quoteMsg(q)+'\nرابط مراجعة العرض واعتماده:\n'+url))}">إرسال واتساب</a>${mine?'<button class="btn sm danger" type="button" data-act="sh-revoke">إلغاء الرابط</button>':''}</div><small class="muted">صالح حتى ${fmtDate(String(q._share.expires).slice(0,10))}. يفتحه العميل دون تسجيل دخول، ويعتمد بالاسم والتوقيع.</small></div>`}
  else if(mine&&q.status!=='superseded'&&q.lines.length&&!['pending','rejected'].includes(ap.state))h+=`<div class="card"><h3>اعتماد العميل إلكترونياً</h3><p class="muted" style="margin-top:0">أنشئ رابطاً يفتحه العميل من جواله، فيراجع العرض ويكتب اسمه ويوقّع، فيتحول العرض تلقائياً إلى «معتمد» ويصلك الإشعار.</p><button class="btn" type="button" data-act="sh-create">إنشاء رابط اعتماد</button></div>`;
  if(q._decision){const d=q._decision;h+=`<div class="decision ${d.action==='reject'?'rej':''}" style="margin-top:14px"><b>${d.action==='approve'?'اعتمد العميل العرض':'رفض العميل العرض'}</b> · ${esc(d.name)} · ${when(d.at)}${d.note?'<br>'+esc(d.note):''}${d.signature?'<br><img src="'+d.signature+'" alt="توقيع العميل">':''}</div>`}
  box.innerHTML=h;applyAccess()}
async function upd(q,r){Object.assign(q,{_v:r._v,_approval:r._approval,_share:r._share,_decision:r._decision,status:r.status??q.status});SNAP.quotes[q.id]=ser(q)}
async function approvalAct(id,action,note){const r=await api('POST','/quotes/'+id+'/approval',{action,note});const q=S.quotes.find(x=>x.id===id);if(q)Object.assign(q,{_v:r.quote._v,_approval:r.quote._approval});return r}

/* ===== users ===== */
let USERS=[];
async function vUsers(){
  main.innerHTML=`<div class="title-row"><h1>المستخدمون والصلاحيات</h1><div class="sp"></div><button class="btn pri" type="button" data-act="u-new">مستخدم جديد</button></div>
  <div class="card"><div class="tablewrap"><table class="t" style="min-width:820px"><thead><tr><th>الاسم</th><th>اسم المستخدم</th><th>البريد</th><th>الدور</th><th>الحالة</th><th>آخر دخول</th><th></th></tr></thead><tbody id="urows"><tr><td colspan="7" class="empty">جارٍ التحميل…</td></tr></tbody></table></div></div>
  <div class="card"><h3>الأدوار والصلاحيات</h3><div class="tablewrap"><table class="t" style="min-width:640px"><thead><tr><th style="width:90px">الدور</th><th>ما يستطيعه</th></tr></thead><tbody>
  <tr><td><b>مدير</b></td><td>كل شيء: العروض والعقود والعملاء والمكتبة والسندات والإعدادات والمستخدمون والسجل والنسخ الاحتياطي، واعتماد الخصومات الكبيرة.</td></tr>
  <tr><td><b>محاسب</b></td><td>يرى كل العروض والعقود، ويضيف العملاء، ويصدر سندات القبض ويلغيها بسبب، ويعدّل تواريخ استحقاق الدفعات، ويطّلع على التقارير. لا يعدّل العروض ولا الأسعار.</td></tr>
  <tr><td><b>مبيعات</b></td><td>يرى ويعدّل عروضه وعملاءه فقط، بخصم لا يتجاوز الحد المقرر، ولا يطّلع على السندات. العرض المعتمد يُقفل ويبقى العقد فقط قابلاً للتعديل.</td></tr>
  <tr><td><b>مشاهد</b></td><td>اطلاع وطباعة فقط دون أي تعديل.</td></tr></tbody></table></div></div>`;
  try{const r=await api('GET','/users');USERS=r.users;drawUsers(r.mail)}catch(e){fail(e)}}
function drawUsers(mailOk){
  $('#urows').innerHTML=USERS.map(u=>`<tr data-id="${u.id}"><td><b>${esc(u.full_name)}</b>${u.id===ME.id?' <span class="chip info">أنت</span>':''}</td><td class="num">${esc(u.username)}</td><td class="num">${esc(u.email||'—')}</td><td>${ROLE_LBL[u.role]}</td>
  <td>${u.active?(u.locked?'<span class="chip warn">مقفل مؤقتاً</span>':'<span class="chip ok">نشط</span>'):'<span class="chip bad">موقوف</span>'}${u.must_change?' <span class="chip">كلمة مؤقتة</span>':''}</td><td>${when(u.last_login)||'—'}</td>
  <td><div class="row" style="justify-content:flex-end;flex-wrap:nowrap"><button class="btn sm" type="button" data-act="u-edit">تعديل</button><button class="btn sm" type="button" data-act="u-reset">كلمة مؤقتة</button>${u.locked?'<button class="btn sm" type="button" data-act="u-unlock">فك القفل</button>':''}</div></td></tr>`).join('')||'<tr><td colspan="7" class="empty">لا يوجد مستخدمون</td></tr>';
  if(!mailOk&&!$('#mail-note'))$('#main').insertAdjacentHTML('afterbegin','<div class="note" id="mail-note">خدمة البريد غير مضبوطة، لذلك لن تصل روابط استعادة كلمة المرور. اضبط SMTP أو Resend في متغيرات البيئة، وفي الأثناء استخدم «كلمة مؤقتة» من هنا.</div>')}
function userForm(u){
  const o=Object.entries(ROLE_LBL).map(([k,v])=>`<option value="${k}" ${u&&u.role===k?'selected':''}>${v}</option>`).join('');
  modal(`<h3>${u?'تعديل مستخدم':'مستخدم جديد'}</h3>
  <label class="fld"><span>الاسم الكامل</span><input id="uf-name" value="${esc(u?u.full_name:'')}"></label>
  <label class="fld"><span>اسم المستخدم (إنجليزي)</span><input id="uf-user" class="ltr" value="${esc(u?u.username:'')}" ${u?'disabled':''}></label>
  <label class="fld"><span>البريد الإلكتروني (لاستعادة كلمة المرور)</span><input id="uf-mail" class="ltr" type="email" value="${esc(u?u.email||'':'')}"></label>
  <label class="fld"><span>الدور</span><select id="uf-role">${o}</select></label>
  ${u?`<label class="row"><input type="checkbox" id="uf-act" ${u.active?'checked':''} style="width:auto"> الحساب نشط</label>`:''}
  <div class="auth-err" id="uf-e" hidden></div><div class="row"><button class="btn pri" type="button" id="uf-ok">${u?'حفظ':'إنشاء'}</button><button class="btn" type="button" data-act="modal-close">إلغاء</button></div>`,m=>{
    $('#uf-ok',m).onclick=async()=>{try{
      const body={name:$('#uf-name',m).value,email:$('#uf-mail',m).value,role:$('#uf-role',m).value};
      if(u){body.active=$('#uf-act',m).checked;await api('PUT','/users/'+u.id,body);closeModal();vUsers()}
      else{body.username=$('#uf-user',m).value;const r=await api('POST','/users',body);closeModal();tempPwModal('تم إنشاء المستخدم',r.tempPassword,'سلّم هذه الكلمة المؤقتة للمستخدم الآن، فهي لن تظهر مرة أخرى. سيُطلب منه تغييرها عند أول دخول.');vUsers()}
    }catch(e){const er=$('#uf-e',m);er.textContent=e.message;er.hidden=false}}})}

/* ===== audit ===== */
const AU_LBL={'auth.login':'دخول','auth.logout':'خروج','auth.login_failed':'فشل دخول','auth.forgot':'نسيان كلمة المرور','auth.reset':'تعيين كلمة مرور','auth.password_change':'تغيير كلمة المرور','quote.create':'عرض جديد','quote.update':'تعديل عرض','quote.delete':'حذف عرض','quote.status':'تغيير حالة','quote.revise':'إصدار جديد','quote.share':'رابط اعتماد','quote.unshare':'إلغاء رابط','quote.customer_approved':'اعتماد العميل','quote.customer_rejected':'رفض العميل','quote.approval_requested':'طلب اعتماد خصم','quote.approval_granted':'اعتماد خصم','quote.approval_rejected':'إرجاع خصم','contract.create':'إنشاء عقد','receipt.create':'سند قبض','receipt.void':'إلغاء سند','customer.create':'عميل جديد','customer.update':'تعديل عميل','customer.delete':'حذف عميل','user.create':'مستخدم جديد','user.update':'تعديل مستخدم','user.reset_password':'كلمة مؤقتة','user.unlock':'فك قفل','settings.update':'تعديل الإعدادات','settings.counters':'الترقيم','items.update':'المكتبة','backup.create':'نسخة احتياطية','backup.auto':'نسخة تلقائية','backup.import':'استيراد','backup.export':'تصدير','backup.download':'تنزيل نسخة','report.monthly':'تقرير شهري','takeoff.create':'ملف حصر جديد','takeoff.update':'تعديل ملف حصر','takeoff.delete':'حذف ملف حصر','takeoff.ai':'اقتراح ذكي للحصر',setup:'تهيئة النظام'};
let AUD={rows:[],more:false};
async function vAudit(){
  main.innerHTML=`<div class="title-row"><h1>سجل العمليات</h1><div class="sp"></div></div>
  <div class="card"><div class="row" style="margin-bottom:12px"><input id="au-user" placeholder="اسم المستخدم" style="max-width:200px" class="ltr"><select id="au-act" style="max-width:200px"><option value="">كل العمليات</option><option value="auth">الدخول والخروج</option><option value="quote">العروض</option><option value="contract">العقود</option><option value="receipt">السندات</option><option value="customer">العملاء</option><option value="user">المستخدمون</option><option value="settings">الإعدادات</option><option value="backup">النسخ الاحتياطي</option></select><button class="btn" type="button" data-act="au-go">عرض</button></div>
  <div class="tablewrap"><table class="t" style="min-width:760px"><thead><tr><th style="width:130px">الوقت</th><th style="width:120px">المستخدم</th><th style="width:130px">العملية</th><th>التفاصيل</th><th style="width:110px">IP</th></tr></thead><tbody id="aurows"></tbody></table></div><div class="row" style="margin-top:10px"><button class="btn" type="button" data-act="au-more" id="au-more" hidden>تحميل المزيد</button></div></div>`;
  AUD={rows:[],more:false};await loadAudit(true)}
async function loadAudit(reset){
  try{const q=new URLSearchParams({limit:'100'});const u=$('#au-user').value.trim(),a=$('#au-act').value;if(u)q.set('user',u);if(a)q.set('action',a);if(!reset&&AUD.rows.length)q.set('before',AUD.rows[AUD.rows.length-1].id);
    const r=await api('GET','/audit?'+q);AUD.rows=reset?r.entries:AUD.rows.concat(r.entries);AUD.more=r.entries.length>=100;
    $('#aurows').innerHTML=AUD.rows.map(e=>`<tr><td class="num" style="direction:ltr;text-align:right">${when(e.at)}</td><td>${esc(e.username||'—')}</td><td><span class="chip ${/failed|void|delete|rejected/.test(e.action)?'bad':(/approved|granted/.test(e.action)?'ok':'')}">${esc(AU_LBL[e.action]||e.action)}</span></td><td>${esc(e.summary||'')}</td><td class="num">${esc(e.ip||'')}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">لا توجد سجلات</td></tr>';
    $('#au-more').hidden=!AUD.more}catch(e){fail(e)}}

/* ===== reports ===== */
let REP=null;
async function vReports(){
  const m=S.ui.rpMonth||today().slice(0,7);
  main.innerHTML=`<div class="title-row"><h1>التقارير الشهرية للتحصيل</h1><div class="sp"></div><input id="rp-month" type="month" value="${m}" style="width:auto"><button class="btn" type="button" data-act="rp-print">طباعة</button></div><div id="rp-body"><div class="empty">جارٍ التحميل…</div></div>`;
  $('#rp-month').addEventListener('change',e=>{S.ui.rpMonth=e.target.value;vReports()});
  try{REP=await api('GET','/reports/monthly?month='+m);drawReport();window.FIN&&window.FIN.extra($('#rp-body'));window.MEM&&window.MEM.extra($('#rp-body'))}catch(e){fail(e);$('#rp-body').innerHTML='<div class="empty">تعذر تحميل التقرير</div>'}}
const repTbl=(t,rows)=>`<div class="card"><h3>${t}</h3><div class="tablewrap"><table class="t" style="min-width:420px"><thead><tr><th>البيان</th><th style="width:70px">العدد</th><th class="num" style="width:140px">المبلغ ر.س</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${r.count}</td><td class="num">${fmt(r.amount)}</td></tr>`).join('')||'<tr><td colspan="3" class="empty">لا توجد حركات</td></tr>'}</tbody></table></div></div>`;
function drawReport(){const r=REP;
  $('#rp-body').innerHTML=`<div class="kpis"><div class="kpi"><small>إجمالي المقبوض</small><b>${fmt(r.total)}</b><small>${r.count} سند</small></div><div class="kpi"><small>عقود جديدة</small><b>${fmt(r.contracts.total)}</b><small>${r.contracts.count} عقد</small></div><div class="kpi ${r.voidedCount?'bad':''}"><small>سندات ملغاة</small><b>${fmt(r.voidedTotal)}</b><small>${r.voidedCount} سند</small></div></div>
  ${repTbl('حسب طريقة الدفع',r.byMethod)}${repTbl('حسب العميل',r.byCustomer)}${repTbl('حسب مسؤول المبيعات',r.bySales)}
  <div class="card"><h3>السندات</h3><div class="tablewrap"><table class="t" style="min-width:560px"><thead><tr><th>السند</th><th>التاريخ</th><th>العميل</th><th>الطريقة</th><th>العقد</th><th class="num">المبلغ</th></tr></thead><tbody>${r.list.map(x=>`<tr><td><bdi dir="ltr">${esc(x.no)}</bdi></td><td>${fmtDate(x.date)}</td><td>${esc(x.customer)}</td><td>${esc(x.method)}</td><td>${esc(x.quote)}</td><td class="num">${fmt(x.amount)}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">لا توجد سندات في هذا الشهر</td></tr>'}</tbody></table></div></div>`}
function reportDoc(){const r=REP,tb=(t,rows)=>`<div class="pay-cap">${t}</div><table class="pay"><thead><tr><th>البيان</th><th style="width:60px">العدد</th><th style="width:130px">المبلغ</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.name)}</td><td class="c">${x.count}</td><td class="e">${fmt(x.amount)}</td></tr>`).join('')}</tbody></table>`;
  return wrap(`${R.bars(S.settings,'تقرير التحصيل الشهري | '+esc(r.month))}<table class="sm"><tbody><tr><td>إجمالي المقبوض (${r.count} سند)</td><td class="e">${fmt(r.total)}</td></tr><tr><td>عقود جديدة (${r.contracts.count})</td><td class="e">${fmt(r.contracts.total)}</td></tr><tr><td>سندات ملغاة (${r.voidedCount})</td><td class="e">${fmt(r.voidedTotal)}</td></tr></tbody></table>${tb('حسب طريقة الدفع',r.byMethod)}${tb('حسب العميل',r.byCustomer)}${tb('حسب مسؤول المبيعات',r.bySales)}`)}

/* ===== settings: approvals, counters, backups ===== */
async function loadBackups(){
  const box=$('#bk-list');if(!box)return;
  try{const r=await api('GET','/backups');box.innerHTML=r.backups.length?`<div class="tablewrap"><table class="t" style="min-width:480px"><thead><tr><th>التاريخ</th><th>النوع</th><th>المحتوى</th><th></th></tr></thead><tbody>${r.backups.slice(0,15).map(b=>`<tr><td>${when(b.created_at)}</td><td>${b.kind==='auto'?'تلقائية':'يدوية'}</td><td>${b.counts?`${b.counts.quotes} عرض · ${b.counts.customers} عميل · ${b.counts.receipts} سند`:''}</td><td><a class="btn sm" href="/api/backups/${b.id}">تنزيل</a></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty" style="padding:14px">لا توجد نسخ بعد. تُنشأ نسخة تلقائياً كل يوم.</div>'}catch(e){}}
async function doImport(file){
  let d;try{d=JSON.parse(await file.text())}catch(e){return toast('الملف ليس JSON صالحاً')}
  if(!d||!d.settings||!d.items||!d.quotes)return toast('الملف ليس نسخة احتياطية صالحة');
  modal(`<h3>استيراد نسخة احتياطية</h3><p class="muted" style="margin:0">سيُدمج الملف مع البيانات الحالية: يُضاف ما ليس موجوداً من العروض والعملاء والسندات، ولا يُحذف أي سجل. يتضمن الملف ${d.quotes.length} عرضاً و${(d.customers||[]).length} عميلاً و${(d.receipts||[]).length} سنداً.</p><label class="row"><input type="checkbox" id="im-set" checked style="width:auto"> استخدام إعدادات الشركة من الملف</label><div class="auth-err" id="im-e" hidden></div><div class="row"><button class="btn pri" type="button" id="im-ok">استيراد</button><button class="btn" type="button" data-act="modal-close">إلغاء</button></div>`,m=>{
    $('#im-ok',m).onclick=async()=>{try{const r=await api('POST','/import',{data:d,applySettings:$('#im-set',m).checked});closeModal();const x=r.result;await reloadAll();toast(`تم الاستيراد: ${x.quotes} عرض، ${x.customers} عميل، ${x.receipts} سند`)}catch(e){const er=$('#im-e',m);er.textContent=e.message;er.hidden=false}}})}

/* ===== quantity take-off (lazy loaded) ===== */
const TKJS=['/tk-core.js','/tk-cad.js','/tk-vis.js','/tk-view.js','/tk-ui.js','/tk-panel.js'];
window.TKHOST=window.HOST={get main(){return main},instRows,custById,custName,LR,sumR,cTotal,download,pick,flush:()=>{clearTimeout(saveT);return flush()},toastUndo,printDoc,wrap,quoteDoc,contractDoc,receiptDoc:(r,t)=>receiptDoc(r,t),curQ,render,renderLines,refreshQ,ensureContract,canC,has,P:()=>P(),syncFonts,norm,esc,R,api,toast,fail,S:()=>S,ME:()=>ME,uid,modal,closeModal,when,fmt,canQ,canCreate:()=>canCreateQ(),newQuote:patch=>newQuoteFrom(null,{patch}),saveS:()=>save(),go};
async function vTakeoff(){
  main.innerHTML='<div class="empty">جارٍ تحميل أدوات الحصر…</div>';
  try{for(const f of TKJS){if(!document.querySelector('script[data-tk="'+f+'"]'))await new Promise((ok,no)=>{const e=document.createElement('script');e.src=f+'?v=1';e.dataset.tk=f;e.onload=ok;e.onerror=()=>no(new Error('تعذر تحميل '+f));document.head.appendChild(e)})}}
  catch(e){main.innerHTML='<div class="empty">'+esc(e.message)+'</div>';return}
  window.TKU.mount();
}

/* ===== agreements (lazy loaded) ===== */
async function vAgreements(){
  main.innerHTML='<div class="empty">جارٍ التحميل…</div>';
  try{if(!window.AGR)await new Promise((ok,no)=>{const e=document.createElement('script');e.src='/agr.js?v=1';e.onload=ok;e.onerror=()=>no(new Error('تعذر تحميل شاشة الاتفاقيات'));document.head.appendChild(e)})}
  catch(e){main.innerHTML='<div class="empty">'+esc(e.message)+'</div>';return}
  window.AGR.mount();
}

async function vCycle(){
  main.innerHTML='<div class="empty">جارٍ التحميل…</div>';
  try{if(!window.CYC)await new Promise((ok,no)=>{const e=document.createElement('script');e.src='/cyc.js?v=1';e.onload=ok;e.onerror=()=>no(new Error('تعذر تحميل شاشة دورة العقد'));document.head.appendChild(e)})}
  catch(e){main.innerHTML='<div class="empty">'+esc(e.message)+'</div>';return}
  window.CYC.mount();
}

async function vRfq(){
  main.innerHTML='<div class="empty">جارٍ التحميل…</div>';
  try{if(!window.RFQ)await new Promise((ok,no)=>{const e=document.createElement('script');e.src='/rfq.js?v=1';e.onload=ok;e.onerror=()=>no(new Error('تعذر تحميل طلبات الأسعار'));document.head.appendChild(e)})}
  catch(e){main.innerHTML='<div class="empty">'+esc(e.message)+'</div>';return}
  window.RFQ.mount();
}

/* ===== template studio (lazy loaded) ===== */
async function vTemplates(){
  main.innerHTML='<div class="empty">جارٍ تحميل استوديو القوالب…</div>';
  try{if(!window.STU)await new Promise((ok,no)=>{const e=document.createElement('script');e.src='/studio.js?v=1';e.onload=ok;e.onerror=()=>no(new Error('تعذر تحميل استوديو القوالب'));document.head.appendChild(e)})}
  catch(e){main.innerHTML='<div class="empty">'+esc(e.message)+'</div>';return}
  window.STU.mount();
}

/* ===== reload from server ===== */
async function reloadAll(keepView=true){
  const b=await api('GET','/bootstrap');const ui=S?S.ui:{view:'dash'};
  ME=b.me;S={settings:b.settings,items:b.items,customers:b.customers,quotes:b.quotes,receipts:b.receipts,ui};
  if(!S.ui.qid||!S.quotes.some(q=>q.id===S.ui.qid))S.ui.qid=(S.quotes[0]||{}).id;
  snapshot();lastSync=Date.now();render()}
const defView=()=>P().receipts?'dash':'archive';
function canView(v){const p=P();return ({dash:p.receipts,payments:p.receipts,receipt:p.receipts,reports:p.reports,settings:p.settingsWrite,users:p.users,audit:p.audit,takeoff:p.takeoff,templates:p.settingsWrite,invoices:p.invoices,agreements:p.agreements!=='none',cycle:p.pdocs!=='none'||p.receipts,rfq:p.seeCost})[v]??true}

/* ===== extra actions ===== */
async function newQuoteFrom(base,opt){
  const s=S.settings;
  const nq=base?JSON.parse(JSON.stringify(base)):{client:'',custId:'',project:'',location:'',validity:s.validity,preparedBy:s.preparedBy,lines:[],discMode:'pct',discPct:0,discAmt:0,vatRate:s.vatRate,notes:s.notes};
  nq.id=uid();nq.date=today();nq.status='draft';nq.contract=null;
  if(base){Object.keys(nq).forEach(k=>{if(k[0]==='_')delete nq[k]});nq.lines.forEach(l=>l.id=uid())}
  Object.assign(nq,opt&&opt.patch||{});
  const r=await api('POST','/quotes',{quote:nq,numbering:(opt&&opt.keep)?'keep':'counter',parentId:opt&&opt.parentId,supersede:opt&&opt.supersede});
  S.settings.nextSeq=r.counters.nextSeq;S.settings.rcNext=r.counters.rcNext;
  if(r.superseded){const i=S.quotes.findIndex(x=>x.id===r.superseded.id);if(i>=0){S.quotes[i]=r.superseded;SNAP.quotes[r.superseded.id]=ser(r.superseded)}}
  S.quotes.unshift(r.quote);SNAP.quotes[r.quote.id]=ser(r.quote);return r.quote}
function act3(a,b,q){
  const tr=b.closest('tr'),id=tr?tr.dataset.id:'';
  const guard=ACT_NEED[a];if(guard&&!has(guard,a==='dup'||a==='new-rev'?q:q)){toast('ليس لديك صلاحية لهذا الإجراء');return true}
  switch(a){
    case 'modal-close':closeModal();return true;
    case 'logout':api('POST','/auth/logout').finally(()=>location.href='/login');return true;
    case 'chpw':location.href='/change-password';return true;
    case 'new-quote':newQuoteFrom().then(nq=>{go('quote',nq.id);setTimeout(()=>{const i=$('[data-f=client]');i&&i.focus()},50)}).catch(fail);return true;
    case 'dup':{const o=S.quotes.find(x=>x.id===id);if(!o)return true;newQuoteFrom(o,{patch:{rev:1,fam:'',parent:'',no:''}}).then(nq=>{render();toast('تم نسخ العرض برقم '+nq.no)}).catch(fail);return true}
    case 'new-rev':{
      if(q.contract){toast('لا يمكن إنشاء إصدار لعرض له عقد، استخدم «نسخ» من السجل');return true}
      const fam=q.fam||uid();if(!q.fam){q.fam=fam}
      const n=S.quotes.filter(x=>x.fam===fam).length,base=String(q.no).replace(/-R\d+$/,''),rev=n+1;
      flush().then(()=>newQuoteFrom(q,{keep:true,parentId:q.id,supersede:q.status==='won'?null:q.id,patch:{fam,rev,no:`${base}-R${rev}`,parent:q.id}})).then(nq=>{go('quote',nq.id);toast('أُنشئ الإصدار '+nq.no)}).catch(fail);return true}
    case 'sh-create':flush().then(()=>api('POST','/quotes/'+q.id+'/share')).then(r=>{upd(q,r.quote);drawExtra(q);toast('تم إنشاء رابط الاعتماد')}).catch(fail);return true;
    case 'sh-revoke':api('DELETE','/quotes/'+q.id+'/share').then(r=>{upd(q,r.quote);drawExtra(q);toast('أُلغي الرابط')}).catch(fail);return true;
    case 'sh-copy-url':{const t=$('#sh-url');t.select();const ok=()=>toast('تم نسخ الرابط');if(navigator.clipboard)navigator.clipboard.writeText(t.value).then(ok,()=>{document.execCommand('copy');ok()});else{document.execCommand('copy');ok()}return true}
    case 'ap-ok':approvalAct(q.id,'approve','').then(()=>{refreshQ();toast('تم اعتماد الخصم')}).catch(fail);return true;
    case 'ap-no':askReason('إرجاع طلب الخصم','سبب الإرجاع أو الحد المقبول','إرجاع',async v=>{await approvalAct(q.id,'reject',v);refreshQ();toast('أُرجع الطلب')});return true;
    case 'ap-req':api('POST','/quotes/'+q.id+'/approval-request').then(r=>{Object.assign(q,{_v:r.quote._v,_approval:r.quote._approval});refreshQ();toast('أُعيد طلب الاعتماد')}).catch(fail);return true;
    case 'dash-ap-ok':{const qid=b.dataset.qid;approvalAct(qid,'approve','').then(()=>{render();toast('تم اعتماد الخصم')}).catch(fail);return true}
    case 'dash-ap-no':{const qid=b.dataset.qid;askReason('إرجاع طلب الخصم','سبب الإرجاع أو الحد المقبول','إرجاع',async v=>{await approvalAct(qid,'reject',v);render()});return true}
    case 'rc-save':{const r=RC;if(!r.custId){toast('اختر العميل أولاً');return true}if(!(n0(r.amount)>0)){toast('أدخل مبلغاً أكبر من صفر');return true}
      api('POST','/receipts',{date:r.date,custId:r.custId,qid:r.qid,payId:r.payId,amount:r2(r.amount),method:r.method,ref:r.ref,notes:r.notes}).then(x=>{S.receipts.unshift(x.receipt);S.settings.rcNext=x.counters.rcNext;RC=Object.assign(newRC(),x.receipt);toast('تم حفظ السند '+x.receipt.no);vReceipt();applyAccess()}).catch(fail);return true}
    case 'rc-void':{const rid=(tr&&tr.dataset.id)||RC.id,r=S.receipts.find(x=>x.id===rid);if(!r)return true;
      askReason('إلغاء السند '+r.no,'سبب الإلغاء (يُسجل في السجل ولا يمكن التراجع)','إلغاء السند',async v=>{const x=await api('POST','/receipts/'+r.id+'/void',{reason:v});Object.assign(r,x.receipt);if(RC&&RC.id===r.id)RC=Object.assign(newRC(),r);toast('أُلغي السند');render()});return true}
    case 'au-go':loadAudit(true);return true;
    case 'au-more':loadAudit(false);return true;
    case 'rp-print':if(REP)printDoc(reportDoc(),'تقرير التحصيل '+REP.month);return true;
    case 'u-new':userForm(null);return true;
    case 'u-edit':userForm(USERS.find(u=>u.id===id));return true;
    case 'u-reset':{const u=USERS.find(x=>x.id===id);askReason('كلمة مرور مؤقتة لـ '+u.full_name,'اكتب «تأكيد» أو سبباً','إنشاء كلمة مؤقتة',async()=>{const r=await api('POST','/users/'+id+'/reset-password');setTimeout(()=>tempPwModal('كلمة المرور المؤقتة',r.tempPassword,'سلّمها للمستخدم الآن، ولن تظهر مرة أخرى. أُنهيت جلساته الحالية وسيُطلب منه تغييرها عند الدخول.'),50);vUsers()},{optional:true});return true}
    case 'u-unlock':api('POST','/users/'+id+'/unlock').then(()=>{toast('تم فك القفل');vUsers()}).catch(fail);return true;
    case 'bk-create':api('POST','/backups').then(()=>{toast('تم إنشاء نسخة احتياطية');loadBackups()}).catch(fail);return true;
    case 'bk-export':location.href='/api/export';return true;
  }
  return false}
function approvalsCard(){
  if(!P().approve)return '';const list=S.quotes.filter(q=>q._approval&&q._approval.state==='pending');
  return `<div class="card"><h3>طلبات اعتماد الخصم <span class="chip ${list.length?'warn':'ok'}">${list.length}</span></h3>${list.length?list.map(q=>`<div class="li"><div class="m"><b>${esc(qOwner(q))}</b><small>عرض <bdi dir="ltr">${esc(q.no)}</bdi>${q.project?' · '+esc(q.project):''} · المسؤول: ${esc(q._ownerName||'')}</small></div><div><span class="chip warn">خصم ${r2(calc(q).pct)}%</span></div><div class="amt">${fmt(calc(q).total)}</div><div class="row" style="flex-wrap:nowrap"><button class="btn sm" type="button" data-act="dash-open-q" data-qid="${q.id}">فتح</button><button class="btn sm pri" type="button" data-act="dash-ap-ok" data-qid="${q.id}">اعتماد</button><button class="btn sm danger" type="button" data-act="dash-ap-no" data-qid="${q.id}">إرجاع</button></div></div>`).join(''):'<div class="empty">لا توجد طلبات بانتظار الاعتماد.</div>'}</div>`}
const pendingN=()=>P().approve?S.quotes.filter(q=>q._approval&&q._approval.state==='pending').length:0;
function renderTools(){$('#tools').innerHTML=`<div class="userbox"><span><b>${esc(ME.name)}</b> · ${ROLE_LBL[ME.role]}</span></div><a class="btn sm" href="/site.html" title="تسجيل معاينة موقعية يعمل دون إنترنت">معاينة موقعية</a><button class="btn sm" type="button" data-act="theme">الوضع</button><button class="btn sm" type="button" data-act="chpw">كلمة المرور</button><button class="btn sm" type="button" data-act="logout">خروج</button>`}

/* ===== boot ===== */
async function boot(){
  try{const th=localStorage.getItem(LT);if(th)document.documentElement.dataset.theme=th}catch(e){}
  try{await reloadAll()}catch(e){if(e.status!==401)$('#main').innerHTML='<div class="empty">تعذر تحميل البيانات: '+esc(e.message)+'<br><button class="btn" onclick="location.reload()">إعادة المحاولة</button></div>';return}
  renderTools();
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(fitPreview).observe(document.body);
  document.addEventListener('visibilitychange',async()=>{
    if(document.visibilityState!=='visible'||saving||saveT&&diff()||Date.now()-lastSync<60000)return;
    const a=document.activeElement;if(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName))return;
    try{await reloadAll()}catch(e){}});
  $('#modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#modal').hidden)closeModal()});
}
boot();
})();
