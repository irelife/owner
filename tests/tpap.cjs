/* ★★ 送金明細のカードで、金額が切れないかを見る検査
 *
 *  【なぜ要るか】
 *  2026/10/1、送金明細の「そのつぎの3か月」のカードで、
 *  金額が右にはみ出して切れていました。
 *
 *    css は @media (min-width:1024px) で3列にしていました。
 *    ところが、この画面の枠は max-width:672px です。
 *      672 − 余白40 − すきま40 ＝ 592 ÷ 3 ＝ 1枚 197px
 *      金額（36px）は「¥2,781,083」で 169px 必要
 *      内側の余白48pxを引くと 147px しか無い → 22px はみ出る
 *    「画面の幅」で決めたのに「枠の幅」は別だった、というずれです。
 *    672px に合わせる前は、画面幅＝枠幅だったので入っていました。
 *
 *  【どう直したか】
 *    auto-fit ＋ minmax(260px, 1fr) にしました。枠に入るぶんだけ
 *    並べるので、画面の幅と枠の幅がずれても崩れません。
 *
 *  ★この検査は「見た目の好み」ではなく「文字が切れていないか」を
 *    数字で見ます。金額は、オーナー様がいちばん見る数字です。
 *
 *  使いかた： node tests/tpap.cjs [場所]
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

/* ★わざと桁の多い金額で試します。
     本番に ¥123,456,789 の月が来たときに、はじめて切れる——
     という形にしないためです。 */
const BIG = 123456789;
const PROPS = ['マーベラスA棟','マーベラスB棟','ルミエール静A棟',
               'ルミエール静B棟','ハイサニー B','ハイサニー A'];
const rows = PROPS.map(function(n, i){ return { label:n, amount:400000 + i * 1000 }; });
const item = function(ym, tot){
  return { ym:ym, total:tot, sokinDate:'9月30日', pdfId:'x' + ym, rows:rows };
};

/* 画面の幅をいろいろ変えて試します（枠は 672px のまま） */
const VIEWS = [
  { w:1920, h:1000, n:'大きな画面' },
  { w:1280, h:1000, n:'ふつうのPC' },
  { w:1024, h:900,  n:'3列にしていた境目' },
  { w:768,  h:900,  n:'タブレット' },
  { w:430,  h:900,  n:'スマホ' },
  { w:360,  h:780,  n:'小さいスマホ' }
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
        x = { ok:true, month:'2026年9月', total:BIG, sokinDate:'9月30日',
              pdfId:'p1', rows:rows, moves:{ newc:0, yotei:2, boshu:0 },
              props:PROPS.map(function(n){ return { name:n, note:'' }; }) };
      } else if (A === 'status') {
        x = { ok:true, month:'2026年9月', newc:[], yotei:[], boshu:[] };
      } else if (A === 'papers') {
        x = { ok:true, chart:[], years:[{ year:'2026年', items:[
          item('2026年9月', BIG), item('2026年8月', BIG),
          item('2026年7月', BIG), item('2026年6月', BIG),
          item('2026年5月', BIG) ] }] };
      }
      r.fulfill({ status:200, contentType:'application/json',
                  body:JSON.stringify(x) });
    });

    await p.goto('file://' + path.join(DIR, 'index.html'));
    await p.waitForTimeout(400);
    await p.fill('#li-mail', 'owner@example.jp');
    await p.fill('#li-pass', 'password1234');
    await p.click('#li-go');
    await p.waitForTimeout(1100);
    await p.evaluate(() => {
      var t = document.querySelector('[data-go="papers"]');
      if (t) t.click();
    });
    await p.waitForTimeout(800);

    const m = await p.evaluate(() => {
      /* 金額の字が、内側の余白に収まっているか。
         ★scrollWidth では測れません（.pp-a は overflow:visible のため）。
           Range で、文字そのものの幅を測ります。 */
      function look(el){
        if (!el || !el.firstChild) return null;
        var cs = getComputedStyle(el);
        var box = el.getBoundingClientRect().width
                - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        var rg = document.createRange();
        rg.selectNodeContents(el);
        return { box:Math.round(box), txt:Math.round(rg.getBoundingClientRect().width),
                 s:el.textContent.trim() };
      }
      var g = document.getElementById('pp-grid');
      var cards = g ? [].slice.call(g.querySelectorAll('.pp')) : [];
      var hero = document.querySelector('#pp-hero .pp-a');
      return {
        onPapers : !document.getElementById('s-papers').hidden,
        cards    : cards.length,
        colW     : cards.length ? Math.round(cards[0].getBoundingClientRect().width) : 0,
        small    : cards.map(function(c){ return look(c.querySelector('.pp-a')); }),
        big      : look(hero),
        scrollX  : document.documentElement.scrollWidth
                   > document.documentElement.clientWidth
      };
    });

    console.log('\n── ' + v.n + '（画面 ' + v.w + 'px）──');
    console.log('   カード ' + m.cards + '枚 ／ 1枚 ' + m.colW + 'px');
    if (m.big) console.log('   大きな1枚 「' + m.big.s + '」 入る幅 ' +
                           m.big.box + 'px ／ 文字 ' + m.big.txt + 'px');
    if (m.small[0]) console.log('   小さいカード 「' + m.small[0].s + '」 入る幅 ' +
                                m.small[0].box + 'px ／ 文字 ' + m.small[0].txt + 'px');

    ok(m.onPapers, '送金明細の画面が出る');
    ok(m.cards >= 1, 'カードが出る', m.cards);
    ok(m.colW >= 250, '★1枚の幅が 250px 以上（金額が入る幅を確保）', m.colW);
    ok(!!m.big && m.big.txt <= m.big.box,
       '★★ 大きな1枚の金額が、はみ出していない', m.big);
    const ng = m.small.filter(function(x){ return x && x.txt > x.box; });
    ok(ng.length === 0,
       '★★★ 小さいカードの金額が、1枚も はみ出していない', ng);
    ok(!m.scrollX, '★横スクロールが出ていない');
    ok(errs.length === 0, '　JavaScript の誤りが出ない', errs);
    await p.close();
  }
  await b.close();
  console.log('\nPASS=' + P + ' FAIL=' + F);
  process.exit(F ? 1 : 0);
})();
