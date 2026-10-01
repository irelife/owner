/* ★★ お問い合わせの「物件の所在地」を見る検査
 *
 *  ご指示（2026/10/1）：
 *    「物件の所在地を選択させて → 福山市 倉敷市 岡山市
 *      ※複数棟ある場合は大きい方を選択して、的な例文載せて」
 *
 *  なぜ要るか
 *    オーナー様112名の「支社」は、いま全員が空欄です。空欄だと
 *    ご相談はすべて本社（SUPPORT）に届きます。112行を手で埋めるのは
 *    手間がかかるうえ、入力ゆれも出ます。
 *    そこで、ご相談を書くときにオーナー様ご自身にお選びいただき、
 *    台帳の支社が空のときだけ、それを使います。
 *
 *  ★必ず選ばせる形にはしていません。
 *    選ばないと送れない、というのは本末転倒です。ご相談が
 *    届かないほうが困ります。空なら、これまでどおり当社で振り分けます。
 *
 *  使いかた： node tests/tarea2.cjs [場所]
 */
const path = require('path');
const fs   = require('fs');
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

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport:{ width:430, height:900 } });
  const errs = [], SENT = [];
  p.on('pageerror', e => errs.push(e.message));

  await p.route('**/macros/s/**', r => {
    const q = JSON.parse(r.request().postData() || '{}');
    SENT.push(q);
    let x = { ok:true };
    if (q.action === 'login') {
      x = { ok:true, token:'T1',
            owner:{ name:'Turnkey合同会社', atena:'Turnkey合同会社 御中' } };
    } else if (q.action === 'home') {
      x = { ok:true, month:'2026年9月', total:2773303, sokinDate:'9月30日',
            pdfId:'p1', rows:[], moves:{ newc:0, yotei:2, boshu:0 }, props:[] };
    } else if (q.action === 'status') {
      x = { ok:true, month:'2026年9月', newc:[], yotei:[], boshu:[] };
    } else if (q.action === 'papers') {
      x = { ok:true, years:[], chart:[] };
    } else if (q.action === 'talks') {
      x = { ok:true, list:[] };
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
    var t = document.querySelector('[data-go="contact"]');
    if (t) t.click();
  });
  await p.waitForTimeout(700);

  console.log('\n❶ えらぶ欄があるか');
  const sel = await p.evaluate(() => {
    const el = document.getElementById('ct-area');
    if (!el) return null;
    return {
      opts : [].slice.call(el.options).map(function(o){
        return { v:o.value, t:o.textContent.trim() }; }),
      now  : el.value,
      label: (document.querySelector('label[for="ct-area"]') || {}).textContent || '',
      /* 注記が、欄の「下」に block で出ているか */
      hint : (function(){
        var h = el.parentNode.querySelector('p.hint');
        if (!h) return null;
        return { txt:h.textContent.replace(/\s+/g,' ').trim(),
                 disp:getComputedStyle(h).display,
                 ml:getComputedStyle(h).marginLeft };
      })()
    };
  });
  ok(!!sel, '物件の所在地をえらぶ欄がある');
  if (sel) {
    console.log('    えらべるもの:', sel.opts.map(o=>o.t).join(' / '));
    ok(sel.label.indexOf('物件の所在地') >= 0, '★見出しが「物件の所在地」', sel.label);
    ok(sel.now === '', '★はじめは何も選ばれていない（勝手に決めない）', sel.now);
    const t = sel.opts.map(o=>o.t);
    ok(t.indexOf('福山市') >= 0, '★福山市がある');
    ok(t.indexOf('倉敷市') >= 0, '★倉敷市がある');
    ok(t.indexOf('岡山市') >= 0, '★岡山市がある');
    ok(t.indexOf('上記以外') >= 0, '★「上記以外」の逃げ道がある（迷って送れなくならないため）');
    const v = sel.opts.map(o=>o.v);
    ok(v.indexOf('福山') >= 0 && v.indexOf('倉敷') >= 0 && v.indexOf('岡山') >= 0,
       '★★送る値は 福山／倉敷／岡山（台帳の「支社」と同じ3語）', v);
    console.log('\n❷ 選びかたの例文');
    ok(!!sel.hint, '注記がある');
    if (sel.hint) {
      console.log('    ', sel.hint.txt);
      ok(/複数棟/.test(sel.hint.txt), '★複数棟のときの選びかたが書いてある');
      ok(/いちばん大きな/.test(sel.hint.txt), '★「いちばん大きな物件」と書いてある');
      ok(/お分かりにならない/.test(sel.hint.txt), '★分からないときの逃げ道も書いてある');
      ok(sel.hint.disp === 'block', '★欄の下に出ている（block）', sel.hint.disp);
      ok(parseFloat(sel.hint.ml) === 0, '★左に寄っていない（margin-left:0）', sel.hint.ml);
    }
  }

  console.log('\n❸ ★★選んだ所在地が、ちゃんと送られるか');
  SENT.length = 0;
  await p.evaluate(() => {
    document.getElementById('ct-area').value = '倉敷';
    document.getElementById('ct-body').value = '9月分の相殺についてお尋ねします。';
  });
  await p.click('#ct-go');
  await p.waitForTimeout(900);
  const ask = SENT.filter(x => x.action === 'ask')[0] || null;
  console.log('    送った中身:', JSON.stringify(ask && { kind:ask.kind, area:ask.area }));
  ok(!!ask, 'ご相談が送られる');
  ok(ask && ask.area === '倉敷', '★★選んだ所在地（倉敷）が送られている', ask && ask.area);
  ok(ask && ask.body.indexOf('9月分の相殺') >= 0, '本文も送られている');

  console.log('\n❹ ★選ばなくても送れること（選ばないと送れない、にしない）');
  SENT.length = 0;
  await p.evaluate(() => {
    var n = document.getElementById('ct-new'); if (n) n.open = true;
    document.getElementById('ct-area').value = '';
    document.getElementById('ct-body').value = '空室の募集状況を教えてください。';
  });
  await p.click('#ct-go');
  await p.waitForTimeout(900);
  const ask2 = SENT.filter(x => x.action === 'ask')[0] || null;
  ok(!!ask2, '★★所在地を選ばなくても、ご相談は送れる');
  ok(ask2 && ask2.area === '', '★そのときは空で送る（当てずっぽうに決めない）', ask2 && ask2.area);

  console.log('\n❺ 送ったあと');
  const after = await p.evaluate(() => ({
    area: document.getElementById('ct-area').value,
    body: document.getElementById('ct-body').value
  }));
  ok(after.body === '', '本文の欄が空になる');
  ok(after.area === '', '★所在地も戻る（次のご相談に前の選択が残らない）', after.area);

  ok(errs.length === 0, '　JavaScript の誤りが出ない', errs);
  await p.close();
  await b.close();
  console.log('\nPASS=' + P + ' FAIL=' + F);
  process.exit(F ? 1 : 0);
})();
