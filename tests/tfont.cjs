/* 見出しの明朝（Shippori Mincho B1）の検査。
 *
 *   ① 切り出したフォントに、画面に出る見出しの字がぜんぶ入っているか
 *      ★ここが肝です。1字でも抜けると、その字だけ別の書体で出ます。
 *        見出しの文言を変えて tools/subset-font.py を走らせ忘れると起きます。
 *   ② ゴシックをお選びの方に、フォントを1バイトも送っていないか
 *   ③ 明朝のときは、ちゃんと読んで、ちゃんと当たっているか
 *   ④ 通信量が、決めた上限を超えていないか
 *   ⑤ 先あての script が読む鍵と、app.js が書く鍵が同じか
 *   ⑥ 金額には明朝を当てていないか（数字の幅がそろわなくなるため）
 *
 * ★フォントは file:// では読めません。この検査だけ、小さな
 *   にせサーバーを立てて http:// で開きます。
 *
 * 使いかた：  node tests/tfont.cjs
 */
const path = require('path');
const fs   = require('fs');
const http = require('http');
const { chromium } = (function(){
  try{ return require('playwright'); }
  catch(e){ return require('/opt/node22/lib/node_modules/playwright'); }
})();

const DIR    = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const WOFF   = path.join(DIR, 'fonts', 'shippori-mincho-b1.woff2');
const BUDGET = 60 * 1024;         /* 通信量の上限。超えたら考え直します */

const TYPES = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript',
                '.woff2':'font/woff2', '.json':'application/json' };

const ROWS = [{ label:'マーベラスA棟', amount:472320 },
              { label:'マーベラスB棟', amount:494200 },
              { label:'管理料',        amount:-35800 }];
const HOME = { ok:true, month:'2026年9月', total:930720, sokinDate:'2026年9月30日',
  pdfId:'F1', rows:ROWS, moves:{ newc:1, yotei:0, boshu:1 },
  props:[{ name:'マーベラスA棟' }] };
const PAPERS = { ok:true, years:[{ year:'2026年', items:[
  { ym:'2026年9月', total:930720, sokinDate:'2026年9月30日', id:'F1', rows:ROWS },
  { ym:'2026年8月', total:900000, sokinDate:'2026年8月31日', id:'',   rows:ROWS }]}]};
const INS = { ok:true, list:[{ id:'I1', name:'マーベラスA棟', company:'○○海上',
  tel:'082-000-0000', end:'2026-12-31', no:'A-1', files:[] }] };

/* css で明朝にしてある部品。tools/subset-font.py の CLASSES と同じにします */
const SEL = ['.h-mincho', '.sect', '.mya-h', '.tile-t', '.st-t', '.ins-n', '.year'];

let P = 0, F = 0;
const ok = (c, m) => { if (c) { P++; console.log('  ✅ ' + m); }
                       else   { F++; console.log('  ❌ ' + m); } };
const eq = (g, w, m) => ok(g === w, m + '（' + JSON.stringify(g) + '）');

(async () => {
  /* ── にせサーバー ───────────────────────── */
  const srv = http.createServer((req, res) => {
    const f = path.join(DIR, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(DIR) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      res.writeHead(404); return res.end();
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const URL = 'http://127.0.0.1:' + srv.address().port + '/index.html';

  const b = await chromium.launch();
  const p = await b.newPage({ viewport:{ width:390, height:900 } });
  const errs = [], fonts = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('response', r => { if (/\.woff2(\?|$)/.test(r.url())) fonts.push(r.url().split('/').pop()); });

  await p.route('**/macros/s/**', r => {
    const A = JSON.parse(r.request().postData() || '{}').action;
    let x = { ok:true };
    if (A === 'login' || A === 'me')
      x = { ok:true, token:'T', owner:{ name:'山田 太郎', atena:'山田 太郎 様' }, home:HOME };
    else if (A === 'home')    x = HOME;
    else if (A === 'papers')  x = PAPERS;
    else if (A === 'status')  x = { ok:true, month:'2026年9月',
      newc:[{ prop:'マーベラスA棟', room:'101号室' }], yotei:[],
      boshu:[{ prop:'マーベラスA棟', room:'102号室' }], message:'よろしくお願いいたします。' };
    else if (A === 'insList') x = INS;
    else if (A === 'talks')   x = { ok:true, list:[] };
    r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(x) });
  });

  async function login(){
    await p.goto(URL);
    await p.evaluate(() => { try{ localStorage.clear(); }catch(e){} });
    /* ★ここで数え直します。1回目の読み込みぶんは、
         入館証を消すためのもので、数には入れません。 */
    fonts.length = 0;
    await p.goto(URL);
    await p.waitForTimeout(400);
    await p.fill('#li-mail', 'owner@example.jp');
    await p.fill('#li-pass', 'password1234');
    await p.click('#li-go');
    await p.waitForTimeout(1400);
    /* ★フォントが届くのを、時間ではなくブラウザに聞いて待ちます。
         固定の待ち時間だと、立て込んでいるときに取りこぼします。 */
    await p.evaluate(() => document.fonts.ready);
  }

  console.log('\n── ④ 通信量 ──');
  ok(fs.existsSync(WOFF), '切り出したフォントが置いてある');
  const kb = fs.existsSync(WOFF) ? fs.statSync(WOFF).size : 0;
  ok(kb > 0 && kb <= BUDGET,
     '★ ' + (kb / 1024).toFixed(1) + ' KB（上限 ' + (BUDGET / 1024) + ' KB）');

  console.log('\n── ③ 明朝のとき ──');
  await login();
  ok(fonts.filter(f => /shippori/.test(f)).length === 1,
     '★フォントを1回だけ読む（' + fonts.length + '回）');
  const fam = await p.evaluate(() =>
    getComputedStyle(document.querySelector('#s-home .tile-t')).fontFamily);
  ok(/Shippori Mincho B1/.test(fam), '見出しに明朝が当たっている');
  const loaded = await p.evaluate(() =>
    [...document.fonts].some(f => f.family.indexOf('Shippori') >= 0 && f.status === 'loaded'));
  ok(loaded, '★フォントの読み込みが終わっている（字が化けない）');

  console.log('\n── ⑥ 金額は明朝にしない ──');
  const money = await p.evaluate(() => {
    const out = {};
    ['#hm-total', '#hm-diff-v'].forEach(s => {
      const e = document.querySelector(s);
      if (e) out[s] = /Shippori/.test(getComputedStyle(e).fontFamily);
    });
    return out;
  });
  Object.keys(money).forEach(k =>
    ok(money[k] === false, '★ ' + k + ' は明朝にしない（数字の幅がそろわないため）'));

  console.log('\n── ⑦ 明朝が、小さすぎる字に当たっていないか ──');
  {
    /* 【なぜ見るか】
     *  明朝は、横の画がとても細い書体です。小さくすると、その線が
     *  かすれて読みにくくなります（とくに画面の明るいところ、
     *  目の弱い方）。本文の目安 16px を、明朝の下限にします。
     *  ★「品が良い」と「読みやすい」は別です。見本と同じにしただけで
     *    読みやすさを確かめないのは、作り手の都合です。 */
    const MIN = 16;
    const screens = ['home', 'papers', 'status', 'insurance', 'account'];
    const small = [];
    for (const s of screens){
      await p.evaluate(n => {
        document.querySelectorAll('section.scr').forEach(e => { e.hidden = true; });
        const t = document.getElementById('s-' + n);
        if (t) t.hidden = false;
        document.getElementById('app').hidden = false;
        document.getElementById('boot').hidden = true;
      }, s);
      await p.waitForTimeout(60);
      const got = await p.evaluate(min => {
        const out = [];
        document.querySelectorAll('*').forEach(e => {
          if (e.getClientRects().length === 0) return;
          const cs = getComputedStyle(e);
          if (!/Shippori/.test(cs.fontFamily)) return;
          if (!(e.textContent || '').trim()) return;
          const px = parseFloat(cs.fontSize);
          if (px < min) out.push(e.className + ' ' + px.toFixed(1) + 'px');
        });
        return out;
      }, MIN);
      got.forEach(x => small.push(s + ': ' + x));
    }
    ok(small.length === 0,
       '★ 明朝は ' + MIN + 'px 未満に使っていない' +
       (small.length ? '（' + [...new Set(small)].slice(0, 4).join(' ／ ') + '）' : ''));
  }

  console.log('\n── ① 見出しの字が、ぜんぶ入っているか ──');
  {
    /* 画面をひととおり開いて、明朝の部品に出る字を集めます */
    const screens = ['home', 'papers', 'status', 'insurance', 'contact',
                     'accountant', 'account'];
    const chars = new Set();
    for (const s of screens){
      await p.evaluate(n => {
        document.querySelectorAll('section.scr').forEach(e => { e.hidden = true; });
        const t = document.getElementById('s-' + n);
        if (t) t.hidden = false;
        document.getElementById('app').hidden = false;
        document.getElementById('boot').hidden = true;
      }, s);
      await p.waitForTimeout(80);
      const got = await p.evaluate(sel => {
        const out = [];
        document.querySelectorAll(sel.join(',')).forEach(e => {
          if (e.offsetParent === null && e.getClientRects().length === 0) return;
          out.push(e.textContent || '');
        });
        return out.join('');
      }, SEL);
      for (const c of got) if (!/\s/.test(c)) chars.add(c);
    }
    /* ★入っているかどうかは、切り出しのときに残した一覧
     *   （fonts/chars.txt）と突き合わせます。
     *
     *  ★幅を測って見分ける手は使えません。日本語の字は、どの書体でも
     *    1文字ぶんの同じ幅だからです。実際それで、入っている字まで
     *    「無い」と出ましたし、わざと入れた「鬱」も見つけられませんでした。
     *    一覧と突き合わせるほうが、速くて、確かです。 */
    const inFont = new Set([...fs.readFileSync(
      path.join(DIR, 'fonts', 'chars.txt'), 'utf8')]);
    const miss = [...chars].filter(c => !inFont.has(c));
    console.log('    見出しに出る字: ' + chars.size + '種');
    ok(miss.length === 0,
       '★★ 入っていない字が無い' +
       (miss.length ? '（' + miss.join('') + ' … tools/subset-font.py を走らせ直してください）' : ''));
  }

  console.log('\n── ①-2 一覧と、フォント本体がそろっているか ──');
  {
    /* ★一覧（chars.txt）が、本体とそろっているかを見ます。
     *   見出しによく出る字を1つ、実際に描いて確かめます。
     *     明朝で描いたものが、ふつうの書体と「ちがう」＝本当に入っている
     *
     *  ★「入っていない字」の側は、ここでは見ません。
     *    入っていない字をブラウザが何の書体で描くかは決まっておらず、
     *    どの書体と比べても「ちがう」と出ることがあったためです。
     *    抜けの見張りは、上の一覧との突き合わせ（①）が受け持ちます。
     *    ①は、見出しに字を足して切り出し直さずに走らせると、
     *    きちんと落ちることを確かめてあります。 */
    const r = await p.evaluate(() => {
      function ink(ch, fam){
        const c = document.createElement('canvas');
        c.width = 160; c.height = 160;
        const x = c.getContext('2d');
        x.font = '120px ' + fam;
        x.textBaseline = 'top';
        x.fillText(ch, 10, 10);
        return c.toDataURL();
      }
      /* ★同じ「落ち先」を、両方に付けるのが肝心です。
           片方だけ落ち先なしにすると、ブラウザが別の書体を選び、
           入っていない字でも「ちがう」と出てしまいます。 */
      const M = "'Shippori Mincho B1', sans-serif", G = 'sans-serif';
      return { has: ink('送', M) !== ink('送', G) };
    });
    ok(r.has, '★一覧に有る字（送）が、本当に明朝で描かれている');
  }

  console.log('\n── ② ゴシックをお選びのとき ──');
  {
    await p.goto(URL);
    await p.evaluate(() => {
      try{ localStorage.clear(); localStorage.setItem('ire_owner_font', 'gothic'); }catch(e){}
    });
    fonts.length = 0;
    await p.goto(URL);
    await p.waitForTimeout(400);
    await p.fill('#li-mail', 'owner@example.jp');
    await p.fill('#li-pass', 'password1234');
    await p.click('#li-go');
    await p.waitForTimeout(1400);
    await p.evaluate(() => document.fonts.ready);
    eq(await p.evaluate(() => document.documentElement.getAttribute('data-font')),
       'gothic', '開いた瞬間からゴシック');
    const fam2 = await p.evaluate(() =>
      getComputedStyle(document.querySelector('#s-home .tile-t')).fontFamily);
    ok(!/Shippori/.test(fam2), '見出しが明朝でない');
    ok(fonts.filter(f => /shippori/.test(f)).length === 0,
       '★★ フォントを1バイトも読んでいない（' + fonts.length + '回）');
  }

  console.log('\n── ⑤ 鍵の名前 ──');
  {
    const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
    const app  = fs.readFileSync(path.join(DIR, 'js/app.js'), 'utf8');
    const m = app.match(/FTKEY\s*=\s*'([^']+)'/);
    ok(!!m, 'app.js に、字を保存する鍵の名前がある');
    ok(!!m && html.indexOf("localStorage.getItem('" + m[1] + "')") >= 0,
       '★先あてが読む鍵と、app.js が書く鍵が同じ（' + (m ? m[1] : '') + '）');
    ok(html.indexOf('id="my-fonts"') >= 0, 'マイアカウントに、えらびの受け皿がある');
    const css = fs.readFileSync(path.join(DIR, 'css/style.css'), 'utf8');
    ok(/html\[data-font="gothic"\]\{[^}]*--mincho:var\(--font\)/.test(css),
       'css に受け口がある: data-font="gothic"');
    ok(css.indexOf("url('../fonts/shippori-mincho-b1.woff2')") >= 0,
       '★フォントは自前で置いている（外のサーバーを読まない）');
    ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(css) &&
       !/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(html),
       '★★ 外のフォント置き場を読んでいない（通信量と、見られ方のため）');
  }

  console.log('');
  ok(errs.length === 0, 'JavaScript の誤りが出ない' + (errs.length ? '（' + errs[0] + '）' : ''));

  await b.close();
  srv.close();
  console.log('\nPASS=' + P + ' FAIL=' + F);
  process.exit(F ? 1 : 0);
})();
