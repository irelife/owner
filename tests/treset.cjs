/* メールのリンクからの、パスワード再設定の検査。
 *
 *   【なぜ要るか】
 *   2026/10/2、パスワードをお忘れのオーナー様が、ご自分では
 *   作り直せない状態になっていました。
 *
 *     再設定の画面は Apps Script が出していました。Apps Script の
 *     画面は Google の枠（iframe）の中でしか動きません。その枠が
 *     拡張機能・広告ブロッカー・サードパーティCookie の制限で
 *     塞がれると
 *         「script.google.com で接続が拒否されました」
 *     となり、先へ進めません。管理者が手で打つしかなく、
 *     112名では回りません。
 *
 *   【どうしたか】
 *     リンクの行き先を、このマイページにしました。枠を使いません。
 *         https://irelife.github.io/owner/#r=（合言葉）
 *
 *   この検査は、次の4つを見張ります。
 *     ① リンクから来たら、必ず再設定の画面が出ること
 *     ② 合言葉が、住所欄に残らないこと
 *     ③ 短い・一致しないパスワードを、送らずに止めること
 *     ④ 期限切れのときに、やり直しの道を書いて出すこと
 *
 * 使いかた：
 *     cd tests && npm install && npx playwright install chromium
 *     node tests/treset.cjs
 */
const path = require('path');
const { chromium } = (function(){
  try{ return require('playwright'); }
  catch(e){ return require('/opt/node22/lib/node_modules/playwright'); }
})();

const DIR = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const URL = 'file://' + path.join(DIR, 'index.html');

/* にせサーバー。resetDo に来たものを控えておきます。 */
async function stage(p, answer){
  const sent = [];
  await p.route('**/macros/s/**', r => {
    const b = JSON.parse(r.request().postData() || '{}');
    sent.push(b);
    let x = { ok:true };
    if(b.action === 'resetDo') x = answer || { ok:true, email:'owner@example.jp' };
    if(b.action === 'me')      x = { ok:true, owner:{ name:'山田 太郎', atena:'山田 太郎 様' } };
    r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(x) });
  });
  return sent;
}

const look = p => p.evaluate(() => ({
  reset : !document.getElementById('s-reset').hidden,
  login : !document.getElementById('s-login').hidden,
  msg   : (document.getElementById('rs-msg').textContent || '').trim(),
  limsg : (document.getElementById('li-msg').textContent || '').trim(),
  mail  : document.getElementById('li-mail').value || '',
  hash  : location.hash,
  qs    : location.search,
  toast : (function(t){ return (t && !t.hidden) ? (t.textContent || '').trim() : ''; })
            (document.getElementById('toast'))
}));

(async () => {
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); }
                         else    { fail++; console.log('  ❌ ' + m); } };

  const b = await chromium.launch();
  const errs = [];
  const open = async (suffix, answer) => {
    const p = await b.newPage({ viewport:{ width:390, height:844 } });
    p.on('pageerror', e => errs.push(e.message));
    const sent = await stage(p, answer);
    await p.goto(URL + (suffix || ''));
    await p.waitForTimeout(400);
    return { p, sent };
  };

  /* ───────── ① リンクから来たら、再設定の画面 ───────── */
  {
    const { p } = await open('#r=TOK123');
    const r = await look(p);
    ok(r.reset && !r.login, '「#r=」のリンクから来たら、再設定の画面が出る');
    ok(r.hash === '' || r.hash === '#', '★合言葉が、住所欄（#）に残らない');
    await p.close();
  }

  /* 古い「?r=」のリンクも読めること */
  {
    const { p } = await open('?r=TOK123');
    const r = await look(p);
    ok(r.reset && !r.login, '古い「?r=」のリンクでも、再設定の画面が出る');
    ok(r.qs === '', '★合言葉が、住所欄（?）に残らない');
    await p.close();
  }

  /* 合言葉が無ければ、ふつうにログイン画面 */
  {
    const { p } = await open('');
    const r = await look(p);
    ok(r.login && !r.reset, '合言葉が無ければ、いつものログイン画面');
    await p.close();
  }

  /* 入館証が残っていても、リンクが優先 */
  {
    const p = await b.newPage({ viewport:{ width:390, height:844 } });
    p.on('pageerror', e => errs.push(e.message));
    await stage(p);
    await p.goto(URL);
    await p.evaluate(() => {
      localStorage.setItem('ire_owner_token', 'OLD');
      localStorage.setItem('ire_owner_seen', String(Date.now()));
    });
    /* ★「?z=1」を足すのは、読み込み直させるためです。
         同じ住所に「#」だけ足すと、ブラウザはページを読み直しません。 */
    await p.goto(URL + '?z=1#r=TOK123');
    await p.waitForTimeout(500);
    const r = await look(p);
    ok(r.reset && !r.login, '★入館証が残っていても、リンクから来たら再設定が優先');
    const t = await p.evaluate(() => localStorage.getItem('ire_owner_token'));
    ok(!t, '★古い入館証は、その場で捨てる');
    await p.close();
  }

  /* ───────── ③ 送る前に止める ───────── */
  {
    const { p, sent } = await open('#r=TOK123');
    await p.fill('#rs-a', 'abc1234');          /* 7文字 */
    await p.fill('#rs-b', 'abc1234');
    await p.click('#rs-go');
    await p.waitForTimeout(500);
    const r = await look(p);
    ok(/8文字以上/.test(r.msg), '7文字なら「8文字以上で」と出る');
    ok(sent.length === 0, '★短いときは、クラウドへ送らない');
    ok(r.reset, '　　画面は再設定のまま');
    await p.close();
  }
  {
    const { p, sent } = await open('#r=TOK123');
    await p.fill('#rs-a', 'abcd12345');
    await p.fill('#rs-b', 'abcd12346');
    await p.click('#rs-go');
    await p.waitForTimeout(500);
    const r = await look(p);
    ok(/一致しません/.test(r.msg), '食い違えば「一致しません」と出る');
    ok(sent.length === 0, '★食い違うときは、クラウドへ送らない');
    await p.close();
  }

  /* ───────── 正しく入れたとき ───────── */
  {
    const { p, sent } = await open('#r=TOK123');
    await p.fill('#rs-a', 'abcd12345');
    await p.fill('#rs-b', 'abcd12345');
    await p.click('#rs-go');
    await p.waitForTimeout(700);
    const r = await look(p);
    const q = sent.filter(x => x.action === 'resetDo');
    ok(q.length === 1, 'resetDo を1回だけ送る');
    ok(q.length === 1 && q[0].tk === 'TOK123', '★合言葉をそのまま送る');
    ok(q.length === 1 && q[0].pass === 'abcd12345', '★新しいパスワードを送る');
    ok(q.length === 1 && !('token' in q[0]), '★入館証は付けない（まだ入っていないため）');
    ok(r.login && !r.reset, '終わったら、ログイン画面へ戻る');
    ok(/設定しました/.test(r.toast), '★「設定しました」とはっきり出す');
    ok(r.mail === 'owner@example.jp', '★アドレスを入れておく（もう一度打たせない）');
    await p.close();
  }

  /* 2回押しても、2回送らない（合言葉は使い捨て） */
  {
    const { p, sent } = await open('#r=TOK123');
    await p.fill('#rs-a', 'abcd12345');
    await p.fill('#rs-b', 'abcd12345');
    await p.click('#rs-go');
    await p.waitForTimeout(700);
    await p.evaluate(() => {
      document.getElementById('s-login').hidden = true;
      document.getElementById('s-reset').hidden = false;
    });
    await p.fill('#rs-a', 'abcd12345');
    await p.fill('#rs-b', 'abcd12345');
    await p.click('#rs-go');
    await p.waitForTimeout(700);
    const q = sent.filter(x => x.action === 'resetDo');
    ok(q.length === 1, '★使い終わった合言葉では、二度と送らない');
    await p.close();
  }

  /* ───────── ④ 期限切れ ───────── */
  {
    const { p } = await open('#r=OLD',
      { ok:false, error:'token', message:'この案内は期限が切れています' });
    await p.fill('#rs-a', 'abcd12345');
    await p.fill('#rs-b', 'abcd12345');
    await p.click('#rs-go');
    await p.waitForTimeout(700);
    const r = await look(p);
    ok(r.reset && !r.login, '期限切れでは、画面を移さない');
    ok(/もう一度お送りください/.test(r.msg), '★やり直しの道をいっしょに出す');
    ok(/お忘れの方/.test(r.msg), '　　どこを押せばよいかまで書く');
    await p.close();
  }

  ok(errs.length === 0, 'JavaScript の誤りが出ない' +
       (errs.length ? '（' + errs[0] + '）' : ''));

  await b.close();
  console.log('\nPASS=' + pass + ' FAIL=' + fail);
  process.exit(fail ? 1 : 0);
})();
