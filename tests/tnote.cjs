/* ★★ その月のひとこと（明細の備考）の検査（2026/10/15 新規）
 *
 *  【改良前】 送金明細は、数字だけでした。
 *      先月より8万円少ない月でも、理由がどこにも書いてありません。
 *      オーナー様は分からないので、お電話をくださいます。
 *
 *  【改良後】 明細シートの「備考」に1行書いておくと、
 *      明細のカードに「当社より」として出ます。
 *
 *  ★この検査がいちばん見ているのは3つです。
 *    ① 書かれていない月に、空の枠を出していないか
 *       （毎月「当社より」の空箱が出ると、かえって不安になります）
 *    ② 3か所（ホーム・月ごとのカード・刷る紙）で中身がそろっているか
 *       1か所でも抜けると、見た方によって伝わる情報が変わります
 *    ③ 文字がそのまま出ているか（< や & を書いても壊れない）
 *
 *  使いかた：  node tests/tnote.cjs
 */
const path = require('path');
const { chromium } = (function(){
  try{ return require('playwright'); }
  catch(e){ return require('/opt/node22/lib/node_modules/playwright'); }
})();

const DIR = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const URL = 'file://' + path.join(DIR, 'index.html');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); }
                       else   { fail++; console.log('  ❌ ' + m); } };
const eq = (g, w, m) => ok(g === w, m + '（' + JSON.stringify(g) + '）');

const NOTE10 = '今月は101号室の原状回復の精算がございますため、'
             + 'いつもの月よりお振込額が少なくなっております。';
const NOTE08 = '8月は更新料2件（203号室・305号室）を含んでおります。';

/* 10月 … 備考あり ／ 9月 … 備考なし ／ 8月 … 備考あり（＋記号を入れる） */
const IT = {
  '2026年10月': { ym:'2026年10月', total:412350, sokinDate:'2026年10月28日',
    id:'F10', message:NOTE10,
    rows:[{ label:'マーベラスA棟', amount:500000 },
          { label:'原状回復費', amount:-87650 }] },
  '2026年9月':  { ym:'2026年9月',  total:500000, sokinDate:'2026年9月28日',
    id:'F09',
    rows:[{ label:'マーベラスA棟', amount:500000 }] },
  '2026年8月':  { ym:'2026年8月',  total:530000, sokinDate:'2026年8月28日',
    id:'F08', message:NOTE08 + '\n<b>太字にはなりません</b> & 記号もそのまま',
    rows:[{ label:'マーベラスA棟', amount:530000 }] }
};
const ORDER = ['2026年10月', '2026年9月', '2026年8月'];

let homeMsg = NOTE10;          /* ホームが返す message。'' にすると「無い月」 */

function build(){
  const h = IT['2026年10月'];
  return {
    HOME: { ok:true, month:'2026年10月', total:h.total, sokinDate:h.sokinDate,
      pdfId:h.id, rows:h.rows, message:homeMsg,
      moves:{ newc:0, yotei:0, boshu:0 }, props:[{ name:'マーベラスA棟' }] },
    PAPERS: { ok:true, years:[{ year:'2026年',
      items:ORDER.map(k => IT[k]) }] }
  };
}

function stage(p){
  return p.route('**/macros/s/**', r => {
    const A = JSON.parse(r.request().postData() || '{}').action;
    const { HOME, PAPERS } = build();
    let x = { ok:true };
    if(A === 'login' || A === 'me')
      x = { ok:true, token:'T', owner:{ name:'山田 太郎', atena:'山田 太郎 様' },
            home:HOME, papers:PAPERS };
    else if(A === 'home')   x = HOME;
    else if(A === 'papers') x = PAPERS;
    else if(A === 'status') x = { ok:true, month:'2026年10月', newc:[], yotei:[], boshu:[] };
    else if(A === 'insList' || A === 'talks') x = { ok:true, list:[] };
    r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(x) });
  });
}

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport:{ width:390, height:900 } });
  /* 印刷を止めます。headless では窓が開かず、止まってしまうためです。 */
  await p.addInitScript(() => { window.print = function(){ window.__printed = 1; }; });
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
    await p.waitForTimeout(1300);
  }
  const home = () => p.evaluate(() => {
    const w = document.getElementById('hm-letter');
    const L = w.querySelector('.letter');
    return {
      html : w.innerHTML.trim(),
      text : (w.textContent || '').replace(/\s+/g, ' ').trim(),
      boxes: w.querySelectorAll('.letter').length,
      /* ★本当に見えているか。
       *   2026/10/15、はじめ #hm-letter を <div hidden> の中に置いてしまい、
       *   DOM にはあるのに画面には出ない、という不具合を作りました。
       *   「ある」と「見える」は別ものです。高さで確かめます。 */
      shown: !!(L && L.offsetParent !== null &&
                L.getBoundingClientRect().height > 0),
      high : L ? Math.round(L.getBoundingClientRect().height) : 0,
      head : (w.querySelector('.lt-h') || {}).textContent || '',
      sign : (w.querySelector('.lt-s') || {}).textContent || '',
      /* 改行がそのまま出るか（white-space） */
      wrap : w.querySelector('.letter p:not(.lt-h):not(.lt-s)')
               ? getComputedStyle(w.querySelector('.letter p:not(.lt-h):not(.lt-s)')).whiteSpace
               : ''
    };
  });

  /* ───────── ① ホーム（備考あり）───────── */
  console.log('\n① ホームの送金カード（備考あり）');
  homeMsg = NOTE10; await login();
  let h = await home();
  eq(h.boxes, 1, '「当社より」の枠が1つ出る');
  eq(h.head, '当社より', '見出し');
  ok(h.text.indexOf(NOTE10) >= 0, '本文がそのまま出る（' + h.text.slice(0, 28) + '…）');
  ok(/IREライフ/.test(h.sign), '差出人が入る（' + h.sign + '）');
  eq(h.wrap, 'pre-wrap', '★改行をそのまま出す（white-space: pre-wrap）');
  eq(h.shown, true, '★★本当に画面に見えている（高さ ' + h.high + 'px）');
  ok(h.high > 60, '★つぶれていない（' + h.high + 'px）');

  /* ───────── ② ホーム（備考なし）───────── */
  console.log('\n② ★備考が無い月は、空の枠を出さない');
  homeMsg = ''; await login();
  h = await home();
  eq(h.boxes, 0, '★枠そのものが出ない');
  eq(h.html, '', '★中身も空（空箱を置かない）');

  homeMsg = '   　 '; await login();
  h = await home();
  eq(h.boxes, 0, '★空白だけの備考も、出さない');

  homeMsg = null; await login();
  h = await home();
  eq(h.boxes, 0, '★message が無い（古い Apps Script）ときも出ない');

  /* ───────── ③ 送金明細の、月ごとのカード ───────── */
  console.log('\n③ 送金明細の、月ごとのカード');
  homeMsg = NOTE10; await login();
  await p.click('[data-go="papers"]'); await p.waitForTimeout(800);
  let r = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('#s-papers .pp')];
    return cards.map(c => ({
      ym   : (c.querySelector('.pp-t') || {}).textContent || '',
      notes: c.querySelectorAll('.letter').length,
      text : (c.querySelector('.letter') ? c.querySelector('.letter').textContent : '')
               .replace(/\s+/g, ' ').trim()
    }));
  });
  eq(r.length, 3, '3か月ぶんのカードが出る');
  eq(r[0].ym, '2026年10月', '1枚めは10月');
  eq(r[0].notes, 1, '★10月には「当社より」が出る');
  ok(r[0].text.indexOf(NOTE10) >= 0, '中身がホームと同じ（' + r[0].text.slice(0, 24) + '…）');
  eq(r[1].ym, '2026年9月', '2枚めは9月');
  eq(r[1].notes, 0, '★9月（備考なし）には出さない');
  eq(r[2].notes, 1, '8月には出る');

  /* ───────── ④ 文字がそのまま出るか ───────── */
  console.log('\n④ ★記号を書いても壊れない');
  r = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('#s-papers .pp')];
    const c = cards[2];                       /* 8月 */
    const L = c.querySelector('.letter');
    return {
      text : (L.textContent || ''),
      bold : L.querySelectorAll('b').length,
      html : L.innerHTML
    };
  });
  eq(r.bold, 0, '★<b> は太字にならない（文字として出す）');
  ok(r.text.indexOf('<b>太字にはなりません</b>') >= 0,
     '★山かっこがそのまま見える');
  ok(r.text.indexOf('& 記号もそのまま') >= 0, '★& もそのまま');
  ok(r.html.indexOf('&lt;b&gt;') >= 0, 'HTMLとしては逃がしてある');

  /* ───────── ⑤ 刷る紙にも出るか ───────── */
  console.log('\n⑤ ★［この内容をPDFで保存］で刷る紙にも出る');
  await p.click('#s-papers .pp.big [data-print]'); await p.waitForTimeout(400);
  r = await p.evaluate(() => {
    const h = document.getElementById('pp-print');
    return {
      printed: !!window.__printed,
      notes  : h.querySelectorAll('.prt-note').length,
      text   : (h.textContent || '').replace(/\s+/g, ' ').trim()
    };
  });
  eq(r.printed, true, '印刷を呼んだ');
  eq(r.notes, 1, '★紙にも「ひとこと」が1つ出る');
  ok(r.text.indexOf(NOTE10) >= 0, '中身が画面と同じ（' + r.text.slice(0, 24) + '…）');

  /* 備考の無い月（9月）を刷ると、枠ごと出ないこと */
  await p.evaluate(() => { window.__printed = 0; });
  await p.click('#s-papers .pp:nth-child(1) [data-print]').catch(() => {});
  const nine = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('#s-papers [data-print]')];
    const b9 = btns.find(x => x.getAttribute('data-print') === '2026年9月');
    if(b9) b9.click();
    return 1;
  });
  await p.waitForTimeout(400);
  r = await p.evaluate(() => {
    const h = document.getElementById('pp-print');
    return { notes:h.querySelectorAll('.prt-note').length,
             ym:(h.textContent || '').indexOf('2026年9月') >= 0 };
  });
  eq(r.ym, true, '9月の紙に切り替わった');
  eq(r.notes, 0, '★備考の無い月は、紙にも枠を出さない');

  /* ───────── ⑥ 誤り ───────── */
  console.log('\n⑥ JavaScript の誤り');
  ok(errs.length === 0, 'ページの誤りが 0 件' +
     (errs.length ? '（' + errs.join(' / ') + '）' : ''));

  await b.close();
  console.log('\nPASS=' + pass + '  FAIL=' + fail);
  process.exit(fail ? 1 : 0);
})();
