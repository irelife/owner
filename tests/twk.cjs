/* ★★ 「原状回復・修繕」の画面が、取り下げられたままかを見る検査
 *
 *  ご指示（2026/10/1）：
 *    「修繕やりとり欄は削除してください。やりとりしない」
 *    → 2（画面ごと、まるごと消す）
 *
 *  なぜ検査が要るか
 *    画面を1つ消す作業は、消し残しが出やすいところです。
 *      ・ホームのタイルだけ残る → 押すと何も無い画面になります
 *      ・SCREENS の一覧に残る   → 戻る操作で空の画面が出ます
 *      ・読み込みだけ残る       → 毎回むだに通信します
 *    どれも「エラーは出ないのに、おかしい」形です。気づけません。
 *
 *  ★消しすぎていないことも、あわせて見ます。
 *      ・送金明細の「原状回復（◯号室）」の行は別の作りなので残る
 *      ・お問い合わせ画面のやりとり（吹き出し）は残る
 *      ・.chip（確認中／回答済み）と .kv（火災保険）は残る
 *
 *  使いかた： node tests/twk.cjs [場所]
 */
const fs   = require('fs');
const path = require('path');
const DIR  = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const app  = fs.readFileSync(path.join(DIR, 'js/app.js'), 'utf8');
const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const css  = fs.readFileSync(path.join(DIR, 'css/style.css'), 'utf8');

let P = 0, F = 0;
const ok = (n, c, x) => {
  if (c) { P++; console.log('  ✅ ' + n); }
  else   { F++; console.log('  ❌ ' + n + (x !== undefined ? ('  → ' + JSON.stringify(x)) : '')); }
};
/* コメント（/* … *&#47; と // …）を外した「生きているコード」だけを見ます。
   説明書きに works と書いてあるのは、消し残しではありません。 */
function live(src){
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
function liveHtml(src){
  return src.replace(/<!--[\s\S]*?-->/g, '');
}
/* ★css も、説明書きを外してから見ます。
     2026/10/1 … 外さずに見たため、「.wk-h を消しました」と書いた
     自分の説明書きを「消し残し」として拾ってしまいました。 */
const A = live(app), H = liveHtml(html), C = live(css);

console.log('\n❶ ★★ 画面そのものが無いこと');
ok('★★ s-works の画面が無い',            H.indexOf('s-works') < 0);
ok('★★ ホームのタイル（data-go="works"）が無い',
   H.indexOf('data-go="works"') < 0);
ok('★★ 画面の一覧（SCREENS）に works が無い',
   !/SCREENS\s*=\s*\[[^\]]*'works'/.test(A));
ok('★★ ログイン後の一覧（AFTER_LOGIN）に works が無い',
   !/AFTER_LOGIN\s*=\s*\{[^}]*works\s*:/.test(A));
ok('★★ 画面を出すところで loadWorks を呼んでいない',
   A.indexOf('loadWorks') < 0);
ok('★★ paintWorks が残っていない',       A.indexOf('paintWorks') < 0);
ok('★★ WK_STATE が残っていない',         A.indexOf('WK_STATE') < 0);
ok('★★ wk-body が残っていない',          A.indexOf('wk-body') < 0 && H.indexOf('wk-body') < 0);
ok('★ sendWork が残っていない',          !/function\s+sendWork\s*\(/.test(A));
ok('★ line()（修繕だけで使っていた道具）が残っていない',
   !/function\s+line\s*\(/.test(A));
ok('★★ works / workMsg の窓口を、もう呼んでいない',
   !/auth\(\s*['"]works['"]/.test(A) && !/auth\(\s*['"]workMsg['"]/.test(A));
ok('★ 画面ごとの読み込み置き場（cache.works）を使っていない',
   A.indexOf('cache.works') < 0);
ok('★ 見た目（.work .wk-h .wk-p .wk-t）が残っていない',
   !/^\.work\{/m.test(C) && C.indexOf('.wk-h') < 0 &&
   C.indexOf('.wk-p') < 0 && C.indexOf('.wk-t') < 0);

console.log('\n❷ ★消しすぎていないこと');
ok('★★ お問い合わせの画面は残っている',   H.indexOf('s-contact') >= 0);
ok('★★ お問い合わせのやりとり（吹き出し）は残っている',
   A.indexOf('bub') >= 0);
ok('★★ お問い合わせの返信（sendTalk）は残っている',
   /function\s+sendTalk\s*\(/.test(A));
ok('★ ご用件に「修繕について」は残っている（ご相談の行き先）',
   H.indexOf('修繕について') >= 0);
ok('★ .chip（確認中／回答済み）は残っている',  /^\.chip\{/m.test(C));
ok('★ .kv（火災保険で使っています）は残っている', /^\.kv\{/m.test(C));
ok('★ 火災保険の画面は残っている',        H.indexOf('s-insurance') >= 0);
ok('★ 送金明細の画面は残っている',        H.indexOf('s-papers') >= 0);
ok('★ 入居状況の画面は残っている',        H.indexOf('s-status') >= 0);
ok('★ 税理士へ送信の画面は残っている',    H.indexOf('s-accountant') >= 0);

console.log('\n❸ ホームのタイルの数');
const tiles = (H.match(/class="tile"/g) || []).length +
              (H.match(/class="tile" id=/g) || []).length;
const goes = (H.match(/data-go="([a-z-]+)"/g) || [])
               .map(s => s.replace(/.*"([a-z-]+)".*/, '$1'));
console.log('    タイルの行き先:', goes.join(' / '));
ok('★ 行き先に works が1つも無い', goes.indexOf('works') < 0);
ok('★ ホームに戻る（home）は残っている', goes.indexOf('home') >= 0);

console.log('\n❹ ?v= を上げたか（上げないと、直しが1台にも届きません）');
const mj = html.match(/js\/app\.js\?v=(\d+)/);
const mc = html.match(/css\/style\.css\?v=(\d+)/);
ok('app.js に ?v= がある',    !!mj);
ok('style.css に ?v= がある', !!mc);
if (mj && mc) console.log('    app.js ?v=' + mj[1] + ' ／ style.css ?v=' + mc[1]);

console.log('\nPASS=' + P + '  FAIL=' + F);
process.exit(F ? 1 : 0);
