/* 前月比の検査（本物のブラウザで動かします）。
 *
 *   ・2か月そろっていれば出る／1か月なら出ない
 *   ・ふえた月・へった月で、しるしと色が変わる
 *   ・「内訳」を押すと開き、もう一度押すと閉じる
 *   ・物件ごとの差が、大きい順に並ぶ
 *   ・足し算が合わない月は、押せないようにする
 *   ・画面の幅 × 文字の大きさを変えても、はみ出さない
 *
 * ★ここはお金の引き算です。数の正しさは tests/tpp.cjs（ppDiff）で
 *   見ています。この検査は「画面にどう出るか」を見ます。
 *
 * 使いかた：  node tests/tdiff.cjs
 */
const path = require('path');
const { chromium } = (function(){
  try{ return require('playwright'); }
  catch(e){ return require('/opt/node22/lib/node_modules/playwright'); }
})();

const DIR = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const URL = 'file://' + path.join(DIR, 'index.html');

const row = a => a.map(([label, amount]) => ({ label, amount }));
const tot = a => a.reduce((s, [, v]) => s + v, 0);

const R9 = [['マーベラスA棟', 472320], ['マーベラスB棟', 494200],
            ['サンプルD棟', 1360000], ['サンプルE棟', 300000],
            ['サンプルF棟', 182583], ['管理料', -35800]];
const R8 = [['マーベラスA棟', 460320], ['マーベラスB棟', 502600],
            ['サンプルD棟', 1318700], ['サンプルE棟', 294660],
            ['管理料', -35800]];

function home(total){
  return { ok:true, month:'2026年9月', total:total, sokinDate:'2026年9月30日',
           pdfId:'F1', rows:row(R9), moves:{ newc:0, yotei:0, boshu:0 },
           props:[{ name:'マーベラスA棟' }] };
}
function papers(items){ return { ok:true, years:[{ year:'2026年', items:items }] }; }

/* ①ふえた月（内訳が合う） ②へった月 ③1か月だけ ④足し算が合わない */
const CASE = {
  up: papers([
    { ym:'2026年9月', total:tot(R9), sokinDate:'2026年9月30日', id:'F1', rows:row(R9) },
    { ym:'2026年8月', total:tot(R8), sokinDate:'2026年8月31日', id:'F0', rows:row(R8) }]),
  down: papers([
    { ym:'2026年9月', total:tot(R8), sokinDate:'2026年9月30日', id:'F1', rows:row(R8) },
    { ym:'2026年8月', total:tot(R9), sokinDate:'2026年8月31日', id:'F0', rows:row(R9) }]),
  one: papers([
    { ym:'2026年9月', total:tot(R9), sokinDate:'2026年9月30日', id:'F1', rows:row(R9) }]),
  odd: papers([
    { ym:'2026年9月', total:9999999, sokinDate:'2026年9月30日', id:'F1', rows:row(R9) },
    { ym:'2026年8月', total:tot(R8), sokinDate:'2026年8月31日', id:'F0', rows:row(R8) }])
};

let which = 'up';
function stage(p){
  return p.route('**/macros/s/**', r => {
    const A = JSON.parse(r.request().postData() || '{}').action;
    let x = { ok:true };
    if(A === 'login' || A === 'me')
      x = { ok:true, token:'T', owner:{ name:'山田 太郎', atena:'山田 太郎 様' },
            home:home(tot(R9)) };
    else if(A === 'home')   x = home(tot(R9));
    else if(A === 'papers') x = CASE[which];
    else if(A === 'status') x = { ok:true, month:'2026年9月', newc:[], yotei:[],
                                  boshu:[], message:'' };
    else if(A === 'insList' || A === 'talks') x = { ok:true, list:[] };
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
    /* ★入館証が端末に残っていると、ログイン画面が出ません。
         場面を変えるたびに、まっさらにしてから入り直します。 */
    await p.goto(URL);
    await p.evaluate(() => { try{ localStorage.clear(); }catch(e){} });
    await p.goto(URL);
    await p.waitForTimeout(400);
    await p.fill('#li-mail', 'owner@example.jp');
    await p.fill('#li-pass', 'password1234');
    await p.click('#li-go');
    await p.waitForTimeout(1200);
  }
  const read = () => p.evaluate(() => {
    const $ = i => document.getElementById(i);
    return {
      hidden : $('hm-diff-wrap').hidden,
      k      : $('hm-diff-k').textContent,
      v      : $('hm-diff-v').textContent,
      pct    : $('hm-diff-p').textContent,
      minus  : $('hm-diff-v').classList.contains('minus'),
      more   : !$('hm-diff-more').hidden,
      exp    : $('hm-diff-b').getAttribute('aria-expanded'),
      dis    : $('hm-diff-b').getAttribute('aria-disabled'),
      why    : !$('hm-diff-why').hidden,
      tap    : Math.round($('hm-diff-b').getBoundingClientRect().height),
      rows   : [...document.querySelectorAll('#hm-diff-rows .row')]
                 .map(e => e.textContent.trim().replace(/\s+/g, ' ')),
      sumRed : (document.querySelector('#hm-diff-rows .row.sum') || {})
                 .className || ''
    };
  });

  console.log('\n── ① ふえた月 ──');
  which = 'up'; await login();
  let r = await read();
  eq(r.hidden, false, '前月比が出る');
  eq(r.k, '前月比（2026年8月より）', '★ちょうど1か月前なので「前月比」と書く');
  eq(r.v, '+¥232,823', '★ふえた額に + が付く');
  eq(r.pct, '+9.2％', '割合');
  eq(r.minus, false, 'ふえた月は赤くしない');
  eq(r.more, true, '「内訳」が出る');
  eq(r.exp, 'false', 'はじめは閉じている');
  eq(r.why, false, '中身も閉じている');
  ok(r.tap >= 44, '★指でふれる的が 44px 以上（' + r.tap + 'px）');

  await p.click('#hm-diff-b'); await p.waitForTimeout(200);
  r = await read();
  eq(r.exp, 'true', '押すと開く');
  eq(r.why, true, '中身が出る');
  eq(r.rows.length, 6, '★動いた物件5つ ＋ 合計の1行');
  eq(r.rows[0], 'サンプルF棟この月から+¥182,583',
     '★いちばん大きく増えたものが先頭。今月からの物件には、その印');
  eq(r.rows[4], 'マーベラスB棟−¥8,400', '★減った物件は最後、− が付く');
  eq(r.rows[5], '合計+¥232,823', '★合計が、上の額と一致する');
  ok(/\bsum\b/.test(r.sumRed) && !/minus/.test(r.sumRed),
     'ふえた月は、合計を赤くしない');

  await p.click('#hm-diff-b'); await p.waitForTimeout(200);
  r = await read();
  eq(r.exp, 'false', 'もう一度押すと閉じる');
  eq(r.why, false, '中身も隠れる');

  console.log('\n── ② へった月 ──');
  which = 'down'; await login();
  r = await read();
  eq(r.v, '−¥232,823', '★へった額に − が付く');
  eq(r.minus, true, '★へった月は、赤字の色にする');
  ok(r.pct.indexOf('−') === 0, '割合にも − が付く（' + r.pct + '）');
  await p.click('#hm-diff-b'); await p.waitForTimeout(200);
  r = await read();
  ok(/minus/.test(r.sumRed), '★合計も赤字の色にする');
  ok(r.rows[r.rows.length - 2].indexOf('まで') > 0,
     '★先月までだった物件に、その印が付く（' + r.rows[r.rows.length - 2] + '）');

  console.log('\n── ③ 月が1つしかない ──');
  which = 'one'; await login();
  r = await read();
  eq(r.hidden, true, '★箱ごと出さない（引き算できないため）');

  console.log('\n── ④ 内訳の足し算が合わない月 ──');
  which = 'odd'; await login();
  r = await read();
  eq(r.hidden, false, '金額の差は出す');
  eq(r.more, false, '★「内訳」は出さない');
  eq(r.dis, 'true', '★押せないようにする');
  /* ★ふつうの click では、ブラウザの操作そのものが止まります
       （aria-disabled を見ています）。それも確かめたうえで、
       無理やり押しても開かないことを見ます。 */
  await p.evaluate(() => document.getElementById('hm-diff-b').click());
  await p.waitForTimeout(200);
  r = await read();
  eq(r.why, false, '★無理に押しても開かない');

  console.log('\n── ⑤ 幅 × 文字の大きさ ──');
  which = 'up'; await login();
  for(const w of [320, 360, 390, 640, 1024]){
    await p.setViewportSize({ width:w, height:900 });
    const bad = [];
    for(const sz of ['m', 'l', 'xl']){
      await p.evaluate(z => {
        const h = document.documentElement;
        if(z === 'm') h.removeAttribute('data-size');
        else          h.setAttribute('data-size', z);
      }, sz);
      /* 開いた形でも見ます（閉じているときより背が高いため） */
      await p.evaluate(() => {
        document.getElementById('hm-diff-b').setAttribute('aria-expanded', 'true');
        document.getElementById('hm-diff-why').hidden = false;
      });
      await p.waitForTimeout(60);
      const g = await p.evaluate(() => {
        const C = document.documentElement.clientWidth;
        const over = Math.max(0, document.documentElement.scrollWidth - C);
        /* ★金額が2行に折れていないか。
             はこの高さでは測れません。名前が2行になると、となりの
             金額のはこも2行ぶんに伸びるためです（文字は1行のまま）。
             文字そのものを Range で測ります。 */
        function lines(el){
          const rg = document.createRange();
          rg.selectNodeContents(el);
          const h  = rg.getBoundingClientRect().height;
          const lh = parseFloat(getComputedStyle(el).lineHeight);
          return (!h || !lh) ? 1 : Math.round(h / lh);
        }
        let split = lines(document.getElementById('hm-diff-v')) > 1;
        document.querySelectorAll('#hm-diff-rows .row span:last-child')
          .forEach(e => { if(lines(e) > 1) split = true; });
        return { over, split };
      });
      if(g.over > 0)  bad.push(sz + ' ＋' + g.over + 'px');
      if(g.split)     bad.push(sz + ' 金額が2行');
    }
    ok(bad.length === 0, '幅 ' + w + 'px … はみ出さず、金額も折れない' +
       (bad.length ? '（' + bad.join(' ／ ') + '）' : ''));
  }

  /* ══════════════════════════════════════════════════════════════
   *  赤字（マイナス）の赤が、本当に読めるか（2026/10/4 追加）
   *
   *  計算ではなく、ブラウザが実際に塗った色を取って測ります。
   *  【なぜ入れたか】
   *  2026/10/4 に測ったところ、それまでの赤は
   *      ワイン 2.71 ／ ミッドナイト 3.05 ／ チャコール 2.83
   *  しかありませんでした（本文の目安は 4.5:1）。
   *  色を足すたびに人が測り直すのは続きません。検査で押さえます。
   * ══════════════════════════════════════════════════════════════ */
  console.log('\n── ★★ 赤字の赤が、読める濃さか（本物の色で測ります）──');
  {
    which = 'down'; await login();
    const lum = c => {
      const f = x => { x /= 255; return x <= .03928 ? x / 12.92
                                                    : Math.pow((x + .055) / 1.055, 2.4); };
      return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]);
    };
    const num = s2 => s2.match(/\d+/g).slice(0, 3).map(Number);
    const ratio = (a, c) => { const x = lum(a) + .05, y = lum(c) + .05;
                              return x > y ? x / y : y / x; };
    for(const th of ['wine', 'midnight', 'charcoal', 'kami', 'cho']){
      await p.evaluate(t => document.documentElement.setAttribute('data-theme', t), th);
      await p.waitForTimeout(60);
      const g = await p.evaluate(() => {
        const v = document.getElementById('hm-diff-v');
        const k = document.getElementById('hm-diff-b');
        return { fg:getComputedStyle(v).color,
                 bg:getComputedStyle(k).backgroundColor,
                 page:getComputedStyle(document.body).backgroundColor };
      });
      const a = ratio(num(g.fg), num(g.bg));
      const c = ratio(num(g.fg), num(g.page));
      ok(a >= 4.5 && c >= 4.5,
         th + ' … 赤字が読める（カード ' + a.toFixed(2) + ':1 ／ 地 ' +
         c.toFixed(2) + ':1、目安 4.5:1）');
    }
    await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'wine'));
  }

  console.log('');
  ok(errs.length === 0, 'JavaScript の誤りが出ない' +
     (errs.length ? '（' + errs[0] + '）' : ''));

  await b.close();
  console.log('\nPASS=' + pass + ' FAIL=' + fail);
  process.exit(fail ? 1 : 0);
})();
