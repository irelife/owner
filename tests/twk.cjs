/* ★★ 「原状回復・修繕」から、やりとりが外れたままかを見る検査
 *
 *  ご指示（2026/10/1）：
 *    「修繕やりとり欄は削除してください。やりとりしない」
 *
 *  なぜ検査が要るか
 *    この画面は「見るだけ」になりました。ところが、やりとりを
 *    足すのは かんたんです（お問い合わせ画面に同じ作りが残っており、
 *    写すだけで戻ってしまいます）。消したことを言葉で覚えておくのを
 *    やめて、検査で押さえます。
 *
 *  ★消しすぎていないことも、あわせて見ます。
 *    ・工事の中身（場所・内容・期間・費用・相殺予定・備考）は残す
 *    ・「お問い合わせ」画面のやりとり（吹き出し）は残す
 *      ← ここを消してしまうと、ご相談の行き先がなくなります
 *
 *  使いかた： node tests/twk.cjs [場所]
 */
const fs   = require('fs');
const path = require('path');
const DIR  = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const app  = fs.readFileSync(path.join(DIR, 'js/app.js'), 'utf8');
const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');

let P = 0, F = 0;
const ok = (n, c, x) => {
  if (c) { P++; console.log('  ✅ ' + n); }
  else   { F++; console.log('  ❌ ' + n + (x !== undefined ? ('  → ' + JSON.stringify(x)) : '')); }
};

/* paintWorks の中だけを切り出します */
function cut(head, tail){
  const a = app.indexOf(head);
  if (a < 0) return null;
  const b = app.indexOf(tail, a);
  return b < 0 ? null : app.slice(a, b);
}
const wk = cut('  function paintWorks(r){', '  function line(k, v){');

console.log('\n❶ 修繕の画面に、やりとりが無いこと');
ok('paintWorks が見つかる', !!wk);
if (wk) {
  ok('★★ 吹き出し（bub）を作っていない',        wk.indexOf('bub') < 0);
  ok('★★ やりとりの枠（talk）を作っていない',    wk.indexOf('talk') < 0);
  ok('★★ 入力欄（textarea）を作っていない',      wk.indexOf('textarea') < 0);
  ok('★★ 送信ボタン（data-send）を作っていない', wk.indexOf('data-send') < 0);
  ok('★ 開閉の問い合わせ欄（details class="ask"）を作っていない',
     wk.indexOf('class="ask"') < 0);
  ok('★ w.msgs（やりとりの中身）を見ていない',   wk.indexOf('w.msgs') < 0);
}
ok('★★ sendWork（送信の処理）が残っていない', !/function\s+sendWork\s*\(/.test(app));
ok('★ workMsg を呼んでいない',
   !/auth\(\s*'workMsg'/.test(app) && !/auth\(\s*"workMsg"/.test(app));

console.log('\n❷ 消しすぎていないこと（工事の中身は残す）');
if (wk) {
  ok('★ 場所（wk-p）を出す',       wk.indexOf('wk-p') >= 0);
  ok('★ 内容（wk-t）を出す',       wk.indexOf('wk-t') >= 0);
  ok('★ 状態（chip）を出す',       wk.indexOf('chip') >= 0);
  ok('★ 期間を出す',               wk.indexOf("line('期間'") >= 0);
  ok('★ 費用を出す',               wk.indexOf("line('費用'") >= 0);
  ok('★ 相殺予定を出す',           wk.indexOf("line('相殺予定'") >= 0);
  ok('★ 備考を出す',               wk.indexOf("line('備考'") >= 0);
}
ok('★ 工事の一覧を取りにいく窓口（works）はそのまま',
   /auth\(\s*'works'\s*\)/.test(app));

console.log('\n❸ 画面の文（お問い合わせへ案内しているか）');
const sec = (() => {
  const a = html.indexOf('<section id="s-works"');
  const b = html.indexOf('</section>', a);
  return (a < 0 || b < 0) ? '' : html.slice(a, b);
})();
ok('修繕の画面が見つかる', !!sec);
ok('★★ 画面に入力欄が置かれていない', sec.indexOf('textarea') < 0);
ok('★ 「各工事からそのままお問い合わせ」という案内が消えている',
   sec.indexOf('各工事からそのまま') < 0);
ok('★ 「お問い合わせ」へ案内している', /お問い合わせ/.test(sec));

console.log('\n❹ ★「お問い合わせ」画面のやりとりは、消していないこと');
const ct = cut("    $('ct-list').innerHTML = list.map(function(t, i){",
               '    Array.prototype.forEach.call(');
ok('お問い合わせの描きかたが見つかる', !!ct);
if (ct) {
  ok('★★ 吹き出し（bub）は残っている',        ct.indexOf('bub') >= 0);
  ok('★★ 「お客様」「IREライフ」の札は残っている',
     ct.indexOf('お客様') >= 0 && ct.indexOf('IREライフ') >= 0);
  ok('★★ 返信の入力欄は残っている',            ct.indexOf('data-tk=') >= 0);
}
ok('★ 返信の処理（sendTalk）は残っている', /function\s+sendTalk\s*\(/.test(app));

console.log('\n❺ ?v= を上げたか（上げないと、直しが1台にも届きません）');
const m = html.match(/js\/app\.js\?v=(\d+)/);
ok('app.js に ?v= がある', !!m);
if (m) console.log('    いまの app.js は ?v=' + m[1]);

console.log('\nPASS=' + P + '  FAIL=' + F);
process.exit(F ? 1 : 0);
