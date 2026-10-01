/* ★★ ホームのタイルが「そろって見えるか」を数字で見る検査
 *
 *  ご指示（2026/10/1）：
 *    「だったらバラバラだから、枠の大きさ同一にして」
 *    →「今月のご送金」だけ金額（大きい字）が入っていて、ほかは
 *      説明文だけ。だから中の字の位置がそろっていない
 *      → 説明文を下ぞろえにして、どのタイルも同じ形に見せます
 *
 *  【何が起きていたか（実測）】
 *      送金明細　　 説明文の下の余白 25px
 *      入居状況　　 　　　　　　　　 84px   ← ★そろっていない
 *      火災保険　　 　　　　　　　　 84px
 *      お問い合わせ 　　　　　　　　 25px
 *      税理士へ送信 　　　　　　　　 25px
 *    .tile-d が margin-top:12px だったため、金額のあるタイルだけ
 *    説明文が下へ押され、ほかは下に大きな空きができていました。
 *
 *    列の幅も 309.8 / 324.4 / 309.8px と不均等でした。
 *    1fr は「中身の最小の幅」より狭くならないためです。
 *
 *  【どう直したか】
 *    .tile-d        margin-top:auto（下ぞろえ）＋ padding-top:12px
 *    .tiles の3列   1fr → minmax(0, 1fr)（きっちり同じ幅）
 *
 *  ★「見た目の好み」ではなく、数字でそろっているかを見ます。
 *
 *  使いかた： node tests/ttile.cjs [場所]
 */
const path = require('path');
const { chromium } = (function(){
  try{ return require('playwright'); }
  catch(e){ return require('/opt/node22/lib/node_modules/playwright'); }
})();
const DIR = path.resolve(process.argv[2] || path.join(__dirname, '..'));

let P = 0, F = 0;
const ok = (c, m, x) => {
  if (c) { P++; console.log('  ✅ ' + m); }
  else   { F++; console.log('  ❌ ' + m + (x !== undefined ? ('  → ' + JSON.stringify(x)) : '')); }
};

const VIEWS = [
  { w:1280, h:900, n:'PC（3列）' },
  { w:430,  h:900, n:'スマホ（1列）' }
];

(async () => {
  const b = await chromium.launch();
  for (const v of VIEWS) {
    const p = await b.newPage({ viewport:{ width:v.w, height:v.h } });
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.route('**/macros/s/**', r => {
      const A = JSON.parse(r.request().postData() || '{}').action;
      let x = { ok:true };
      if (A === 'login') {
        x = { ok:true, token:'T1',
              owner:{ name:'Turnkey合同会社', atena:'Turnkey合同会社 御中' } };
      } else if (A === 'home') {
        x = { ok:true, month:'2026年9月', total:2773303, sokinDate:'9月30日',
              pdfId:'p1', rows:[], moves:{ newc:0, yotei:2, boshu:0 }, props:[] };
      } else if (A === 'status') {
        x = { ok:true, month:'2026年9月', newc:[], yotei:[], boshu:[] };
      } else if (A === 'papers') { x = { ok:true, years:[], chart:[] }; }
      else if (A === 'talks')    { x = { ok:true, list:[] }; }
      r.fulfill({ status:200, contentType:'application/json',
                  body:JSON.stringify(x) });
    });
    await p.goto('file://' + path.join(DIR, 'index.html'));
    await p.waitForTimeout(400);
    await p.fill('#li-mail', 'owner@example.jp');
    await p.fill('#li-pass', 'password1234');
    await p.click('#li-go');
    await p.waitForTimeout(1300);

    const m = await p.evaluate(() => {
      const host = document.querySelector('.tiles');
      const ts = [].slice.call(document.querySelectorAll('.tiles .tile'));
      return {
        n    : ts.length,
        cols : getComputedStyle(host).gridTemplateColumns
                 .split(' ').map(function(s){ return Math.round(parseFloat(s) * 100) / 100; }),
        tiles: ts.map(function(t){
          const d = t.querySelector('.tile-d');
          const r = t.getBoundingClientRect();
          return {
            k   : (t.querySelector('.tile-k') || {}).textContent || '',
            w   : Math.round(r.width),
            top : Math.round(r.top),
            gap : d ? Math.round(r.bottom - d.getBoundingClientRect().bottom) : null,
            hasD: !!d
          };
        }),
        /* 修繕が消えているか（#29 で取り下げました） */
        works: !!document.querySelector('[data-go="works"]')
      };
    });

    console.log('\n── ' + v.n + '（画面 ' + v.w + 'px）──');
    console.log('   タイル ' + m.n + '枚 ／ 列 ' + m.cols.join(' / ') + 'px');
    m.tiles.forEach(function(t){
      console.log('   ' + t.k + '　幅' + t.w + 'px　説明文の下の余白 ' + t.gap + 'px');
    });

    ok(m.n === 5, '★タイルは5枚（修繕を取り下げたため）', m.n);
    ok(!m.works, '★修繕のタイルが残っていない');
    ok(m.tiles.every(function(t){ return t.hasD; }), 'どのタイルにも説明文がある');

    /* ❶ 説明文の下の余白が、どのタイルも同じこと */
    const gaps = m.tiles.map(function(t){ return t.gap; });
    const uniq = Array.from(new Set(gaps));
    ok(uniq.length === 1,
       '★★★ 説明文の「下の余白」が、どのタイルも同じ（下ぞろえ）', gaps);

    /* ❷ 同じ行のタイルは、同じ幅であること */
    const rows = {};
    m.tiles.forEach(function(t){ (rows[t.top] = rows[t.top] || []).push(t.w); });
    const bad = Object.keys(rows).filter(function(k){
      return Array.from(new Set(rows[k])).length > 1;
    });
    ok(bad.length === 0, '★★ 同じ行のタイルは、同じ幅', rows);

    /* ❸ 列の幅そのものがそろっていること（PC のときだけ） */
    if (v.w >= 1024) {
      ok(m.cols.length === 3, '★3列になっている', m.cols);
      const d = Math.max.apply(null, m.cols) - Math.min.apply(null, m.cols);
      ok(d < 1, '★★3列の幅の差が 1px 未満（minmax(0,1fr)）', m.cols);
    } else {
      ok(m.cols.length === 1, '★スマホでは1列', m.cols);
    }

    ok(errs.length === 0, '　JavaScript の誤りが出ない', errs);
    await p.close();
  }
  await b.close();
  console.log('\nPASS=' + P + ' FAIL=' + F);
  process.exit(F ? 1 : 0);
})();
