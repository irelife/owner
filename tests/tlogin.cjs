/* ログインの検査。
 *
 *   【なぜ要るか】
 *   2026/9/22、ログインしても すぐログイン画面に戻る という事故が
 *   ありました。原因は画面側でした。
 *
 *     show('home') は home・status・papers の3つを同時に叩きます。
 *     auth() は、どれか1つでも「入館証が違う」を返すと logout(true)
 *     を呼びます。quiet=true なので何も出ないまま戻ります。
 *     しかも status と papers の失敗は呼び出し側が握りつぶすので、
 *     メッセージすら残りませんでした。
 *
 *   【どうしたか】
 *     ・ホームの「ついで」（status／papers）は、失敗しても戻しません
 *     ・戻すときは、理由を必ずログイン画面に出します
 *     ・どの窓口で起きたかを console.warn に残します
 *
 *   この検査は、そこが戻らないことを見張ります。
 *
 * 使いかた：
 *     cd tests && npm install && npx playwright install chromium
 *     node tests/tlogin.cjs
 */
const path = require('path');
const { chromium } = (function(){
  try{ return require('playwright'); }
  catch(e){ return require('/opt/node22/lib/node_modules/playwright'); }
})();

const DIR = path.resolve(process.argv[2] || path.join(__dirname, '..'));

/* 何が起きても、こうなってほしい */
const CASES = [
  { name:'ホームの「ついで」の入居状況が落ちても、ホームに留まる',
    bad:['status'], token:'T1', want:'home' },
  { name:'ホームの「ついで」の過去の明細が落ちても、ホームに留まる',
    bad:['papers'], token:'T1', want:'home' },
  { name:'★ホーム本体が落ちたら、理由を出してログイン画面へ',
    bad:['home'], token:'T1', want:'login' },
  { name:'★ぜんぶ落ちたら、理由を出してログイン画面へ',
    bad:['home','status','papers'], token:'T1', want:'login' },
  { name:'★入館証が返ってこなければ、その場で知らせる',
    bad:[], token:'', want:'login' },
  { name:'ぜんぶ正常なら、ホームに入る',
    bad:[], token:'T1', want:'home' }
];

(async () => {
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); }
                         else    { fail++; console.log('  ❌ ' + m); } };

  const b = await chromium.launch();
  for (const c of CASES) {
    const p = await b.newPage({ viewport:{ width:390, height:844 } });
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));

    await p.route('**/macros/s/**', r => {
      const A = JSON.parse(r.request().postData() || '{}').action;
      let x;
      if (A === 'login') {
        x = { ok:true, token:c.token, owner:{ name:'山田 太郎', atena:'山田 太郎 様' } };
      } else if (c.bad.indexOf(A) >= 0) {
        x = { ok:false, error:'auth', message:'入館証が違います' };
      } else if (A === 'me') {
        x = { ok:true, owner:{ name:'山田 太郎', atena:'山田 太郎 様' } };
      } else if (A === 'home') {
        x = { ok:true, month:'2026年9月', total:1284000, rows:[], props:[] };
      } else if (A === 'status') {
        x = { ok:true, newc:[], yotei:[], boshu:[] };
      } else if (A === 'papers') {
        x = { ok:true, years:[] };
      } else {
        x = { ok:true };
      }
      r.fulfill({ status:200, contentType:'application/json',
                  body:JSON.stringify(x) });
    });

    await p.goto('file://' + path.join(DIR, 'index.html'));
    await p.waitForTimeout(400);
    await p.fill('#li-mail', 'owner@example.jp');
    await p.fill('#li-pass', 'password1234');
    await p.click('#li-go');
    await p.waitForTimeout(900);

    const r = await p.evaluate(() => ({
      onLogin : !document.getElementById('s-login').hidden,
      onHome  : !document.getElementById('s-home').hidden,
      msg     : ((document.getElementById('li-msg') || {}).textContent || '').trim()
    }));

    if (c.want === 'home') {
      ok(r.onHome && !r.onLogin, c.name);
    } else {
      /* ★戻すときは、理由を必ず出すこと。無言で戻ったのが事故の正体でした */
      ok(r.onLogin && !r.onHome && !!r.msg, c.name);
    }
    ok(errs.length === 0, '　　JavaScript の誤りが出ない');
    await p.close();
  }
  await b.close();

  console.log('\nPASS=' + pass + ' FAIL=' + fail);
  process.exit(fail ? 1 : 0);
})();
