/* ★★ 税理士先生へ「1年分（12か月）」をお送りする検査（本物のブラウザ）
 *
 *  【改良前】 年別を選ぶと、送信ボタンが押せませんでした。
 *      「年別は、12か月を1つの明細書（PDF）にまとめたものが
 *        ございませんため、当社からの送信はご利用いただけません。」
 *
 *  【改良後】 まとめる必要はありません。**12個そのまま添付**します。
 *      実測：明細PDF 1か月ぶん 132KB ／ 12か月で約1.6MB。
 *      Gmail の上限は 25MB ですので、余裕があります。
 *
 *  ★この検査がいちばん見ているのは、**何件送ったと言うか** です。
 *    Apps Script がまだ古いままだと 1件しか行きません。
 *    そのとき「12件お送りしました」と出すと、オーナー様に嘘をつきます。
 *    ですから、押した数ではなく **返ってきた数** を出しているかを見ます。
 *
 *  使いかた：  node tests/ttax.cjs
 */
const path = require('path');
const { chromium } = (function(){
  try{ return require('playwright'); }
  catch(e){ return require('/opt/node22/lib/node_modules/playwright'); }
})();

const DIR = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const URL = 'file://' + path.join(DIR, 'index.html');

/* 2026年は12か月そろっていて、原本PDFもそろっています。
 * 2025年は12月だけ原本PDFがありません（飛ばされることを見ます）。 */
function month(y, m, id){
  return { ym:y + '年' + m + '月', total:400000 + m, sokinDate:y + '年' + m + '月28日',
           id:id, rows:[{ label:'マーベラスA棟', amount:400000 + m }] };
}
const Y2026 = [];
for(let m = 12; m >= 1; m--) Y2026.push(month(2026, m, 'F26' + m));
const Y2025 = [];
for(let m = 12; m >= 1; m--) Y2025.push(month(2025, m, m === 12 ? '' : ('F25' + m)));

const PAPERS = { ok:true, years:[ { year:'2026年', items:Y2026 },
                                  { year:'2025年', items:Y2025 } ] };
const HOME = { ok:true, month:'2026年12月', total:400012, sokinDate:'2026年12月28日',
               pdfId:'F2612', rows:[{ label:'マーベラスA棟', amount:400012 }],
               moves:{ newc:0, yotei:0, boshu:0 }, props:[{ name:'マーベラスA棟' }] };

/* Apps Script が返す件数。古いまま（1件しか送れない）も試します */
let sentBack = null;              /* null なら ids の数を返す＝新しい Apps Script */
let lastTax  = null;

function stage(p){
  return p.route('**/macros/s/**', r => {
    const req = JSON.parse(r.request().postData() || '{}');
    const A = req.action;
    let x = { ok:true };
    if(A === 'login' || A === 'me')
      x = { ok:true, token:'T', owner:{ name:'Turnkey合同会社', atena:'Turnkey合同会社 御中' },
            home:HOME, papers:PAPERS,
            status:{ ok:true, month:'2026年12月', newc:[], yotei:[], boshu:[] } };
    else if(A === 'home')   x = HOME;
    else if(A === 'papers') x = PAPERS;
    else if(A === 'status') x = { ok:true, month:'2026年12月', newc:[], yotei:[], boshu:[] };
    else if(A === 'insList' || A === 'talks') x = { ok:true, list:[] };
    else if(A === 'taxsend'){
      lastTax = req;
      const n = (sentBack == null)
                  ? ((req.ids && req.ids.length) || 1)
                  : sentBack;
      x = { ok:true, sent:n };
    }
    r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(x) });
  });
}

(async () => {
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); }
                         else    { fail++; console.log('  ❌ ' + m); } };
  const eq = (g, w, m) => ok(g === w, m + '（' + JSON.stringify(g) + '）');

  const b = await chromium.launch();
  const p = await b.newPage({ viewport:{ width:390, height:900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await stage(p);

  async function login(){
    await p.goto(URL);
    await p.evaluate(() => { try{ localStorage.clear(); }catch(e){} });
    await p.goto(URL);
    await p.waitForTimeout(400);
    await p.fill('#li-mail', 'owner@example.jp');
    await p.fill('#li-pass', 'password1234');
    await p.click('#li-go');
    await p.waitForTimeout(1200);
    await p.click('[data-go="accountant"]');
    await p.waitForTimeout(600);
  }
  const read = () => p.evaluate(() => {
    const $ = i => document.getElementById(i);
    return {
      sendOff : $('ac-send').disabled,
      note    : ($('ac-send-n').textContent || '').replace(/\s+/g, ''),
      body    : $('ac-body').value,
      cfOpen  : !$('ac-cf').hidden,
      cfTo    : $('ac-cf-to').textContent,
      cfNote  : ($('ac-cf-n').textContent || '').replace(/\s+/g, ''),
      msg     : ($('ac-msg').textContent || '').replace(/\s+/g, ''),
      pdfHid  : $('ac-pdf').hidden
    };
  });

  console.log('\n── ① 月別（これまでどおり）──');
  await login();
  let r = await read();
  eq(r.sendOff, false, '送信ボタンが押せる');
  ok(/明細書（PDF）を添付してお送りします/.test(r.note), '案内文（' + r.note.slice(0, 30) + '…）');
  ok(r.body.indexOf('明細書（PDF）を添付しております。') > 0,
     '本文は「明細書（PDF）を添付しております。」（件数を書かない）');
  eq(r.pdfHid, false, '［明細書（PDF）を保存］が出る');

  console.log('\n── ② ★年別。改良前は押せませんでした ──');
  await p.click('#ac-y'); await p.waitForTimeout(400);
  r = await read();
  eq(r.sendOff, false, '★送信ボタンが押せるようになった');
  ok(/明細書（PDF）12件を添付してお送りします/.test(r.note),
     '★案内文に 12件（' + r.note.slice(0, 40) + '…）');
  ok(r.body.indexOf('明細書（PDF）12件を添付しております。') > 0,
     '★本文も 12件（実際に付く数と、本文を食い違わせない）');
  ok(r.body.indexOf('明細データ（CSV）を添付') < 0,
     '★付かない CSV のことは書かない');
  eq(r.pdfHid, true, '［明細書（PDF）を保存］は、年別では出さない');

  console.log('\n── ③ 押す前に、何件かをお見せする ──');
  await p.fill('#ac-mail', 'zeirishi@example.co.jp');
  await p.click('#ac-send'); await p.waitForTimeout(300);
  r = await read();
  eq(r.cfOpen, true, '確認の箱が出る');
  eq(r.cfTo, 'zeirishi@example.co.jp', '宛先が出る');
  ok(/明細書（PDF）12件をお送りします/.test(r.cfNote),
     '★確認の箱にも 12件（' + r.cfNote.slice(0, 40) + '…）');
  ok(/2026年分/.test(r.cfNote), '何年分かも出る');

  console.log('\n── ④ 送る中身 ──');
  lastTax = null; sentBack = null;
  await p.click('#ac-cf-ok'); await p.waitForTimeout(900);
  r = await read();
  ok(!!lastTax, 'Apps Script を呼んだ');
  eq(lastTax.ids.length, 12, '★ids が 12件');
  eq(lastTax.ids[0], 'F261', '★1件めが1月（月の順に並べて送る）');
  eq(lastTax.ids[11], 'F2612', '★12件めが12月');
  eq(lastTax.id, 'F261',
     '★id も入れておく（Apps Script が古くても、1件は送れるように）');
  eq(lastTax.copy, true, '控えの希望を送る');
  ok(!lastTax.copyTo && !lastTax.bcc,
     '★控えの宛先は送らない（Apps Script が入館証から見ます）');
  ok(/12件を添付して送信いたしました/.test(r.msg), '★12件と伝える（' + r.msg.slice(0, 40) + '…）');
  eq(r.cfOpen, false, '確認の箱は閉じる');

  console.log('\n── ⑤ ★Apps Script がまだ古いとき（1件しか送れない）──');
  sentBack = 1;
  await login();
  await p.click('#ac-y'); await p.waitForTimeout(400);
  await p.fill('#ac-mail', 'zeirishi@example.co.jp');
  await p.click('#ac-send'); await p.waitForTimeout(300);
  await p.click('#ac-cf-ok'); await p.waitForTimeout(900);
  r = await read();
  ok(!/12件を添付して送信いたしました/.test(r.msg),
     '★「12件お送りしました」と嘘をつかない（' + r.msg.slice(0, 50) + '…）');
  ok(/12件のうち1件です/.test(r.msg), '★「12件のうち1件です」と、はっきり書く');
  ok(/ご自身のメールソフトで作成する/.test(r.msg), '★残りの送りかたを案内する');
  sentBack = null;

  console.log('\n── ⑥ 原本PDFの無い月は、そっと飛ばす ──');
  await login();
  await p.click('#ac-y'); await p.waitForTimeout(300);
  await p.selectOption('#ac-year', '2025'); await p.waitForTimeout(400);
  r = await read();
  eq(r.sendOff, false, '2025年も送れる');
  ok(/明細書（PDF）11件/.test(r.note),
     '★12月だけ原本が無いので 11件（' + r.note.slice(0, 40) + '…）');
  await p.fill('#ac-mail', 'zeirishi@example.co.jp');
  await p.click('#ac-send'); await p.waitForTimeout(300);
  lastTax = null;
  await p.click('#ac-cf-ok'); await p.waitForTimeout(900);
  eq(lastTax.ids.length, 11, '★送るのも 11件（無い月で止めない）');
  ok(lastTax.ids.indexOf('') < 0, '空のIDは送らない');

  console.log('\n── ⑦ 宛先を入れていないとき ──');
  await login();
  await p.click('#ac-y'); await p.waitForTimeout(300);
  await p.fill('#ac-mail', '');
  await p.click('#ac-send'); await p.waitForTimeout(300);
  r = await read();
  eq(r.cfOpen, false, '確認の箱は出さない');
  ok(/メールアドレスをご入力ください/.test(r.msg), 'その旨を出す');

  console.log('\n── ⑧ 月別へ戻しても、おかしくならない ──');
  await p.click('#ac-m'); await p.waitForTimeout(400);
  r = await read();
  eq(r.sendOff, false, '月別でも押せる');
  ok(!/12件/.test(r.note), '★年別の「12件」が残っていない（' + r.note.slice(0, 30) + '…）');
  ok(r.body.indexOf('明細書（PDF）を添付しております。') > 0, '本文も1件ぶんに戻る');

  console.log('\n── ⑨ JavaScript の誤り ──');
  ok(errs.length === 0, 'ページの誤りが 0 件' +
     (errs.length ? '（' + errs.join(' / ') + '）' : ''));

  await b.close();
  console.log('\nPASS=' + pass + '  FAIL=' + fail);
  process.exit(fail ? 1 : 0);
})();
