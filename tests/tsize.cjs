/* 指でふれる的の大きさ・はみ出し・ボタンの重さの検査。
 *
 *   【なぜ要るか】
 *   2026/10/3 に画面を実測したところ、こうなっていました。
 *
 *     ホームに戻る        137 × 36 px   ← 6つの画面すべてに出る、いちばん押す部品
 *     証券の写しを選ぶ    300 × 36 px   ← 保険をお預けいただく最初の一歩
 *     送信の控えの四角     20 × 20 px   ← 札ごと押せますが、札も1行ぶんしかない
 *     お急ぎのときのメール  90 × 14 px   ← 文の中のリンク。指ではまず当たりません
 *
 *   指でふれる的の目安は 44px です（Apple のガイドライン、WCAG 2.5.5）。
 *   オーナー様には高齢の方も多く、ここは効きます。
 *
 *   【もうひとつ】
 *   送金明細の3つのボタンが、3つとも同じ「枠だけ」でした。
 *   ふだん押すのは「明細書（PDF）」1つだけです。同じ重さで3つ並べると、
 *   毎月「どれを押すのか」を考えていただくことになります。
 *   ★原本が無い月は「この内容をPDFで保存」が唯一の道なので、
 *     そちらが主になることも見ます。
 *
 * 使いかた：
 *     cd tests && npm install && npx playwright install chromium
 *     node tests/tsize.cjs
 */
const path = require('path');
const { chromium } = (function(){
  try{ return require('playwright'); }
  catch(e){ return require('/opt/node22/lib/node_modules/playwright'); }
})();

const DIR = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const URL = 'file://' + path.join(DIR, 'index.html');
const MIN = 44;                      /* 指でふれる的の目安 */

const ROWS = [
  { label:'マーベラスA棟', amount:472320 },
  { label:'マーベラスB棟', amount:494200 },
  { label:'管理料',        amount:-35800 }
];
const HOME = { ok:true, month:'2026年9月', total:2773303, sokinDate:'2026年9月30日',
  pdfId:'F1', rows:ROWS, moves:{ newc:1, yotei:0, boshu:2 },
  props:[{ name:'マーベラスA棟' }, { name:'マーベラスB棟' }] };

/* 原本（当社の明細書PDF）がある月と、無い月の両方を出します */
const PAPERS = { ok:true, chart:[], years:[{ year:'2026年', items:[
  { ym:'2026年9月', total:2773303, sokinDate:'2026年9月30日', id:'F1', rows:ROWS },
  { ym:'2026年8月', total:2700000, sokinDate:'2026年8月31日', id:'',   rows:ROWS }
]}]};

function stage(p){
  return p.route('**/macros/s/**', r => {
    const A = JSON.parse(r.request().postData() || '{}').action;
    let x = { ok:true };
    if(A === 'login' || A === 'me'){
      x = { ok:true, token:'T', owner:{ name:'山田 太郎', atena:'山田 太郎 様' }, home:HOME };
    }
    else if(A === 'home')   x = HOME;
    else if(A === 'papers') x = PAPERS;
    else if(A === 'status') x = { ok:true, month:'2026年9月', newc:[], yotei:[], boshu:[], message:'' };
    else if(A === 'insList' || A === 'talks') x = { ok:true, list:[] };
    r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(x) });
  });
}

const SCREENS = ['home','papers','status','insurance','contact','accountant','account'];

(async () => {
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); }
                         else    { fail++; console.log('  ❌ ' + m); } };

  const b = await chromium.launch();
  const p = await b.newPage({ viewport:{ width:390, height:844 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await stage(p);

  await p.goto(URL);
  await p.waitForTimeout(400);
  await p.fill('#li-mail', 'owner@example.jp');
  await p.fill('#li-pass', 'password1234');
  await p.click('#li-go');
  await p.waitForTimeout(900);

  console.log('\n── 指でふれる的が ' + MIN + 'px 以上あるか（幅390pxの画面）──');
  for(const s of SCREENS){
    await p.evaluate(n => {
      document.querySelectorAll('section.scr').forEach(e => { e.hidden = true; });
      document.getElementById('s-' + n).hidden = false;
      document.getElementById('app').hidden = false;
    }, s);
    await p.waitForTimeout(500);

    const r = await p.evaluate(min => {
      const small = [];
      const sc = document.querySelector('section.scr:not([hidden])');
      sc.querySelectorAll('button,a,select,textarea,input:not([type=checkbox])')
        .forEach(el => {
          const b = el.getBoundingClientRect();
          if(b.width === 0 && b.height === 0) return;      /* 出ていないもの */
          if(b.height < min){
            small.push((el.textContent || el.id || el.tagName).trim().slice(0, 20) +
                       ' ' + Math.round(b.width) + '×' + Math.round(b.height));
          }
        });
      /* ★四角（checkbox）は、札（label）ごと押せます。札の大きさで見ます。 */
      sc.querySelectorAll('input[type=checkbox]').forEach(el => {
        const lab = el.closest('label');
        const b = (lab || el).getBoundingClientRect();
        if(b.width === 0 && b.height === 0) return;
        if(b.height < min){
          small.push('四角の札 ' + Math.round(b.width) + '×' + Math.round(b.height));
        }
      });
      return { small:small,
               over:Math.max(0, document.documentElement.scrollWidth - window.innerWidth) };
    }, MIN);

    ok(r.small.length === 0,
       s + ' … 小さすぎる的が無い' + (r.small.length ? '（' + r.small.join(' ／ ') + '）' : ''));
    ok(r.over === 0, '　　よこにはみ出さない' + (r.over ? '（' + r.over + 'px）' : ''));
  }

  console.log('\n── 送金明細のボタンの重さ ──');
  /* ★ここは hidden を外すだけでは足りません。中身は show('papers') が
       読みに行くので、ホームのタイルを実際に押します。 */
  await p.evaluate(() => {
    document.querySelectorAll('section.scr').forEach(e => { e.hidden = true; });
    document.getElementById('s-home').hidden = false;
  });
  await p.click('.tile[data-go="papers"]');
  await p.waitForTimeout(900);

  const bt = await p.evaluate(() => {
    const look = card => {
      if(!card) return null;
      const bs = Array.from(card.querySelectorAll('.pp-acts .btn'));
      return bs.map(x => ({
        t      : x.textContent.trim(),
        ghost  : x.classList.contains('ghost'),
        top    : getComputedStyle(x).marginTop,
        h      : Math.round(x.getBoundingClientRect().height)
      }));
    };
    const cards = Array.from(document.querySelectorAll('#pp-hero .pp, #pp-grid .pp'));
    /* 中を開いてから見ます */
    cards.forEach(c => { const b = c.querySelector('.pp-b'); if(b) b.hidden = false; });
    return { hero:look(cards[0]), next:look(cards[1]) };
  });

  const h = bt.hero || [];
  ok(h.length === 3, '原本のある月は、ボタンが3つ（' + h.length + '）');
  ok(h[0] && /明細書/.test(h[0].t) && h[0].ghost === false,
     '★1つめ「明細書（PDF）」だけが、塗りつぶし（主）');
  ok(h[1] && h[1].ghost === true && h[2] && h[2].ghost === true,
     '★残り2つは、枠だけ（控えめ）');
  ok(h.every(x => x.top === '0px'),
     '★3つとも上の余白が 0（主と控えめで段差ができない）');
  ok(h.every(x => x.h >= MIN), '　　3つとも ' + MIN + 'px 以上');

  const n = bt.next || [];
  ok(n.length === 2, '原本の無い月は、ボタンが2つ（' + n.length + '）');
  ok(n[0] && n[0].ghost === true && /CSV/.test(n[0].t),
     '　　1つめは CSV（控えめ）');
  ok(n[1] && n[1].ghost === false && /PDFで保存/.test(n[1].t),
     '★原本が無い月は「この内容をPDFで保存」が主になる' +
     '（押せるものが1つも目立たない月を作らない）');

  console.log('');
  ok(errs.length === 0, 'JavaScript の誤りが出ない' +
       (errs.length ? '（' + errs[0] + '）' : ''));

  await b.close();
  console.log('\nPASS=' + pass + ' FAIL=' + fail);
  process.exit(fail ? 1 : 0);
})();
