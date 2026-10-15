/* ログイン画面の背景の検査。
 *
 *   【なぜ要るか】
 *   2026/10/15、ログイン・再設定の画面に背景（上からの光・下の街なみ）を
 *   足し、カードをすりガラス（不透明度 .90）にしました。
 *
 *   すりガラスは、カードの地に後ろの色が1割まざります。
 *   まざった結果、文字が読みにくくなっていないかを、数値で見張ります。
 *
 *   【測りかた】
 *   いちばん条件の悪いところで測ります。
 *     ① 画面の地（--background）の上に
 *     ② 上からの光（--glow を --glow-1 の濃さで）を重ね
 *     ③ その上にカード（--card を .90 の濃さで）を重ねる
 *   こうして出た「カードの地」に対して、本文・薄い字・枠の明暗差を出します。
 *   実際の画面では、光はカードの位置ではもっと薄いので、
 *   ここで足りていれば、どこでも足ります。
 *
 *   【目安】（WCAG 2.1）
 *     本文・薄い字 … 4.5:1 以上
 *     枠・図形　　 … 3:1 以上
 *
 * 使いかた：
 *     cd tests && npm install && npx playwright install chromium
 *     node tests/tbg.cjs
 */
const path = require('path');
const { chromium } = (function(){
  try{ return require('playwright'); }
  catch(e){ return require('/opt/node22/lib/node_modules/playwright'); }
})();

const DIR = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const THEMES = ['wine','midnight','charcoal','kami','cho'];

let pass = 0, fail = 0;
function ok(cond, name, extra){
  if(cond){ pass++; console.log('  ○ ' + name); }
  else    { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
function ge(got, want, name){
  ok(got >= want, name + '（' + got.toFixed(2) + ':1 ／ 目安 ' + want + ':1）',
     '足りません');
}

/* ── 色の計算（ブラウザの外でやります） ───────────────── */
function lum(c){                        /* c = [r,g,b] 0〜255 */
  const f = v => { v /= 255; return v <= .03928 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4); };
  return .2126*f(c[0]) + .7152*f(c[1]) + .0722*f(c[2]);
}
function ratio(a, b){
  const x = lum(a), y = lum(b);
  return (Math.max(x,y) + .05) / (Math.min(x,y) + .05);
}
function over(fg, bg, a){               /* fg を a の濃さで bg に重ねる */
  return [0,1,2].map(i => Math.round(fg[i]*a + bg[i]*(1-a)));
}
function mix(a, b, p){                  /* a を p、b を 1-p でまぜる */
  return [0,1,2].map(i => Math.round(a[i]*p + b[i]*(1-p)));
}

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport:{ width:390, height:844 } });

  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));

  await p.goto('file://' + path.join(DIR, 'index.html'));
  await p.waitForTimeout(600);

  /* ═══ ① 5つの配色で、文字が読めるか ═══════════════════ */
  console.log('\n① カードの地（いちばん条件の悪い重なり）に対する文字の明暗差');
  for(const th of THEMES){
    console.log('\n  【' + th + '】');
    const v = await p.evaluate(t => {
      document.documentElement.setAttribute('data-theme', t);
      const cs = getComputedStyle(document.documentElement);
      const g  = n => cs.getPropertyValue(n).trim();
      /* hsl の3つの値を、画面に描かせて rgb に直します */
      const probe = document.createElement('div');
      document.body.appendChild(probe);
      const rgb = hslStr => {
        probe.style.color = 'hsl(' + hslStr + ')';
        const m = getComputedStyle(probe).color.match(/[\d.]+/g);
        return [ +m[0], +m[1], +m[2] ];
      };
      const out = {
        bg:   rgb(g('--background')),
        card: rgb(g('--card')),
        fg:   rgb(g('--foreground')),
        mut:  rgb(g('--muted-foreground')),
        bd:   rgb(g('--border')),
        glow: rgb(g('--glow')),
        g1:   parseFloat(g('--glow-1')),
        city: rgb(g('--city')),
        ca:   parseFloat(g('--city-a'))
      };
      probe.remove();
      return out;
    }, th);

    ok(isFinite(v.g1) && v.g1 > 0 && v.g1 <= .3,
       '上からの光の濃さが 0〜.3 に収まっている（' + v.g1 + '）');
    ok(isFinite(v.ca) && v.ca > 0 && v.ca <= .3,
       '街なみの濃さが 0〜.3 に収まっている（' + v.ca + '）');

    /* 地 → 光 → カード（.90）の順に重ねます */
    const lit  = over(v.glow, v.bg, v.g1);
    const face = over(v.card, lit, .90);

    ge(ratio(v.fg,  face), 4.5, '本文の文字');
    ge(ratio(v.mut, face), 4.5, '薄い字（説明文）');
    /* 枠は --border に --foreground を2割まぜたものです（上のCSSと同じ） */
    const bd2 = mix(v.bd, v.fg, .80);
    ge(ratio(bd2, face), 3.0, 'カードの枠（--foreground を2割まぜたもの）');
    ok(ratio(bd2, face) > ratio(v.bd, v.card),
       '★枠が、改良前より読みやすくなった（'
       + ratio(v.bd, v.card).toFixed(2) + ' → ' + ratio(bd2, face).toFixed(2) + '）');

    /* すりガラスに対応していない端末（カードは不透明）でも測ります */
    ge(ratio(v.fg,  v.card), 4.5, '★すりガラス非対応の端末でも、本文が読める');
    ge(ratio(v.mut, v.card), 4.5, '★すりガラス非対応の端末でも、薄い字が読める');

    /* 街なみは「図形」なので 3:1 までは要りません。
       逆に、濃すぎて文字のじゃまにならないことを見ます（地との差が小さい）。 */
    const cityOn = over(v.city, v.bg, v.ca);
    ok(ratio(cityOn, v.bg) < 2.0,
       '街なみが控えめ（地との差 ' + ratio(cityOn, v.bg).toFixed(2) + ':1 ／ 2.0 未満）');
  }

  /* ═══ ② 背景がカードより後ろにあるか ═══════════════════ */
  console.log('\n② 重なりの順番');
  await p.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'wine');
    document.querySelectorAll('.scr').forEach(s => s.hidden = true);
    document.getElementById('s-login').hidden = false;
  });
  const z = await p.evaluate(() => {
    const sc = document.getElementById('s-login');
    const be = getComputedStyle(sc, '::before');
    const af = getComputedStyle(sc, '::after');
    return {
      pos:  getComputedStyle(sc).position,
      iso:  getComputedStyle(sc).isolation,
      ovf:  getComputedStyle(sc).overflow,
      zb:   be.zIndex, za: af.zIndex,
      cb:   be.content, ca: af.content,
      pe:   be.pointerEvents + '/' + af.pointerEvents
    };
  });
  ok(z.pos === 'relative', '画面が position:relative（背景を中に置ける）');
  ok(z.iso === 'isolate',  'isolation:isolate（背景が body の後ろへ抜けない）');
  ok(z.ovf === 'visible',  '★overflow を切っていない（横向きでカードが切れない）');
  ok(+z.zb < 0 && +z.za < 0, '背景2枚がカードより後ろ（' + z.zb + ' / ' + z.za + '）');
  ok(+z.za > +z.zb, '街なみが、光より手前');
  ok(z.cb !== 'none' && z.ca !== 'none', '背景2枚が実際に描かれている');
  ok(z.pe === 'none/none', '★背景が指の操作を奪わない（pointer-events:none）');

  /* ═══ ③ 4つの画面すべてに付いているか ════════════════ */
  console.log('\n③ ログイン まわりの4画面');
  for(const id of ['s-login','s-forgot','s-reset','s-newpass']){
    const r = await p.evaluate(i => {
      const el = document.getElementById(i);
      if(!el) return null;
      const be = getComputedStyle(el, '::before').content;
      const card = el.querySelector(':scope > .card');
      const sh = card ? getComputedStyle(card).boxShadow : '';
      return { be, sh };
    }, id);
    ok(r && r.be !== 'none', id + ' に背景が付いている');
    ok(r && r.sh && r.sh !== 'none', id + ' のカードが浮いている（影がある）');
  }

  /* ═══ ④ 印刷では消えるか ══════════════════════════════ */
  console.log('\n④ 印刷');
  await p.emulateMedia({ media:'print' });
  const pr = await p.evaluate(() => {
    const sc = document.getElementById('s-login');
    return {
      be: getComputedStyle(sc, '::before').display,
      af: getComputedStyle(sc, '::after').display,
      bg: getComputedStyle(sc.querySelector(':scope > .card')).backgroundColor,
      sh: getComputedStyle(sc.querySelector(':scope > .card')).boxShadow
    };
  });
  ok(pr.be === 'none' && pr.af === 'none', '背景2枚が消える');
  ok(/255,\s*255,\s*255/.test(pr.bg), 'カードの地が白になる（' + pr.bg + '）');
  ok(pr.sh === 'none', '影が消える');
  await p.emulateMedia({ media:'screen' });

  /* ═══ ⑤ 図形が外から持ってこられていないか ═══════════ */
  console.log('\n⑤ 持ちもの');
  const m = await p.evaluate(() => {
    const sc = document.getElementById('s-login');
    const af = getComputedStyle(sc, '::after');
    return af.maskImage || af.webkitMaskImage || '';
  });
  ok(/^url\("data:image\/svg\+xml/.test(m),
     '街なみが data: の図形（外のサーバーに取りに行かない）');
  ok(m.length < 4000, '図形が小さい（' + m.length + ' 文字／4000 未満）');
  ok(!/http(s)?:\/\/(?!www\.w3\.org)/.test(m), '図形の中に外のURLが無い');

  /* ═══ ⑥ JSの誤り ═════════════════════════════════════ */
  console.log('\n⑥ JSの誤り');
  ok(errs.length === 0, 'JSの誤りが0件', errs.join(' / '));

  await b.close();
  console.log('\n──────────────────────────────');
  console.log('PASS=' + pass + '  FAIL=' + fail);
  process.exit(fail ? 1 : 0);
})();
