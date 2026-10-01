/* ★★ お問い合わせ履歴の「検索」の検査（オーナーマイページ側）
 *
 *  ご指示（2026/10/1）：
 *    「これって、どんどん溜まっていったらどうなるの？きれいに整理してほしい」
 *    → 1（開閉式）＋ 2（検索欄）
 *    「※オーナーマイページ側もそうしてください」
 *
 *  【改良前】
 *    開閉式は 2026/9/23 に入れてありました（.tk / .tk-h / .tk-b）。
 *    けれども探す手だてがありませんでした。14件あると、
 *    「6月に出した修繕の相談」を目で探して延々とスクロールします。
 *
 *  【改良後】
 *    検索欄（#ct-q）を足しました。ご用件・日付・状態・本文で引けます。
 *    ★見つかったものは、開いた形で出します
 *      （探しあてたのに、また押して開くのは手間だからです）。
 *    ★打つたびに通信はしません。いま画面にあるものを絞るだけです。
 *
 *  使いかた： node tests/tctq.cjs [場所]
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

/* 14件のやりとり。1件だけ「ＡＢＣ商会」と全角の字を混ぜています。 */
const KINDS = ['明細について', '空室・募集について', '修繕について',
               '火災保険について', '登録内容の変更', 'その他'];
const TALKS = (function(){
  const out = [];
  for (let i = 0; i < 14; i++) {
    const done = (i !== 0);
    out.push({
      id   : 'C20260' + (i + 1) + '-' + i,
      kind : KINDS[i % 6],
      date : '2026/' + (i + 1) + '/5',
      state: done ? '回答済み' : '確認中',
      msgs : [{ at:'2026/' + (i + 1) + '/5 10:00', who:'オーナー',
                body: (i === 7 ? 'ＡＢＣ商会の分の雨漏りについて、相続の件もあわせて'
                               : '第' + (i + 1) + '号のご質問です。') }]
             .concat(done ? [{ at:'2026/' + (i + 1) + '/6 09:00', who:'当社',
                               body:'承知いたしました。' }] : [])
    });
  }
  return out;
})();

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport:{ width:1280, height:900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  let calls = [];

  await p.route('**/macros/s/**', r => {
    const B = JSON.parse(r.request().postData() || '{}');
    calls.push(B.action);
    let x = { ok:true };
    if (B.action === 'login') {
      x = { ok:true, token:'T1', owner:{ name:'Turnkey合同会社' } };
    } else if (B.action === 'home') {
      x = { ok:true, month:'2026年9月', total:0, rows:[],
            moves:{ newc:0, yotei:0, boshu:0 }, props:[] };
    } else if (B.action === 'talks') {
      x = { ok:true, list:TALKS };
    }
    r.fulfill({ status:200, contentType:'application/json',
                body:JSON.stringify(x) });
  });

  await p.goto('file://' + path.join(DIR, 'index.html'));
  await p.waitForTimeout(400);
  await p.fill('#li-mail', 'owner@example.jp');
  await p.fill('#li-pass', 'password1234');
  await p.click('#li-go');
  await p.waitForTimeout(1200);
  await p.click('[data-go="contact"]');
  await p.waitForTimeout(900);

  const look = () => p.evaluate(() => {
    const ts = [].slice.call(document.querySelectorAll('#ct-list .tk'));
    return {
      n    : ts.length,
      open : ts.filter(t => {
               const bd = t.querySelector('.tk-b'); return bd && !bd.hidden; }).length,
      first: ts.length ? ((ts[0].querySelector('.tk-t') || {}).textContent || '') : '',
      cnt  : (document.getElementById('ct-cnt') || {}).textContent || '',
      hasQ : !!document.getElementById('ct-q'),
      emp  : (document.querySelector('#ct-list .empty') || {}).textContent || ''
    };
  });

  console.log('\n❶ はじめの形');
  let v = await look();
  console.log('   ' + v.n + '件中、開いているのは ' + v.open + '件　' + v.cnt);
  ok(v.hasQ, '★★検索欄がある');
  ok(v.n === 14, 'やりとりが14件出る', v.n);
  ok(v.open === 1, '★開いているのは、いちばん新しい1件だけ（開閉式）', v.open);
  ok(/全14 件/.test(v.cnt), '★件数を出す', v.cnt);

  console.log('\n❷ 見出しを押すと開く／もう一度押すと閉じる');
  await p.click('#ct-list .tk:nth-child(3) .tk-h');
  await p.waitForTimeout(200);
  v = await look();
  ok(v.open === 2, '★押したら開く（1 → 2件）', v.open);
  await p.click('#ct-list .tk:nth-child(3) .tk-h');
  await p.waitForTimeout(200);
  v = await look();
  ok(v.open === 1, '★もう一度押したら閉じる（2 → 1件）', v.open);

  console.log('\n❸ 検索');
  const find = async (word) => {
    await p.fill('#ct-q', word);
    await p.waitForTimeout(300);
    return await look();
  };

  v = await find('雨漏り');
  console.log('   「雨漏り」→ ' + v.n + '件　' + v.cnt);
  ok(v.n === 1, '★★本文の中の字で引ける', v.n);
  ok(v.open === 1, '★★見つかったものは、開いた形で出る（また押さなくてよい）', v.open);
  ok(/「雨漏り」に一致： 1 件/.test(v.cnt), '★一致した件数も出す', v.cnt);

  v = await find('abc商会');
  console.log('   「abc商会」（半角・小文字）→ ' + v.n + '件');
  ok(v.n === 1, '★★全角「ＡＢＣ」でも、半角・小文字で引ける（そろえてからくらべる）', v.n);

  v = await find('修繕について');
  console.log('   「修繕について」→ ' + v.n + '件');
  /* KINDS は6つ。14件を順に当てているので、修繕は i=2 と i=8 の2件です。 */
  ok(v.n === 2 && v.first.indexOf('修繕') >= 0, '★ご用件で引ける', [v.n, v.first]);

  v = await find('確認中');
  ok(v.n === 1, '★状態（確認中＝お返事待ち）で引ける', v.n);

  v = await find('2026/3/5');
  ok(v.n === 1, '★日付で引ける', v.n);

  v = await find('ないはずの字');
  console.log('   見つからないとき: ' + v.emp);
  ok(v.n === 0, '無いものは0件', v.n);
  ok(/一致するお問い合わせはありません/.test(v.emp), '★見つからないと、その旨を出す', v.emp);

  v = await find('');
  ok(v.n === 14, '★検索を消すと、全部に戻る', v.n);
  ok(v.open === 1, '★戻したら、また新しい1件だけが開く', v.open);

  console.log('\n❹ 通信の回数（打つたびに通信していないか）');
  const before = calls.filter(a => a === 'talks').length;
  await p.fill('#ct-q', '雨漏り');
  await p.waitForTimeout(400);
  const after = calls.filter(a => a === 'talks').length;
  console.log('   検索の前後で talks: ' + before + ' → ' + after);
  ok(before === after, '★★検索しても通信しない（手元の一覧を絞るだけ）', [before, after]);

  console.log('\n❺ 1件も無いとき');
  await p.fill('#ct-q', '');
  await p.evaluate(() => { window.__paintTalksEmpty = true; });
  /* にせサーバーの答えを空にして、もう一度読み込みます */
  await p.unroute('**/macros/s/**');
  await p.route('**/macros/s/**', r => {
    const B = JSON.parse(r.request().postData() || '{}');
    r.fulfill({ status:200, contentType:'application/json',
                body:JSON.stringify(B.action === 'talks' ? { ok:true, list:[] }
                                                        : { ok:true }) });
  });
  await p.click('[data-go="home"]');
  await p.waitForTimeout(300);
  await p.click('[data-go="contact"]');
  await p.waitForTimeout(900);
  v = await look();
  console.log('   ' + v.emp + '　／　件数欄「' + v.cnt + '」');
  ok(/お問い合わせの履歴はありません/.test(v.emp), '★「履歴はありません」と出す', v.emp);
  ok(v.cnt === '', '★0件のときは「全0 件」を出さない（よけいな字を見せない）', v.cnt);

  ok(errs.length === 0, '　JavaScript の誤りが出ない', errs);
  await p.close();
  await b.close();
  console.log('\nPASS=' + P + ' FAIL=' + F);
  process.exit(F ? 1 : 0);
})();
