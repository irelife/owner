/* `ext.gs` の直しかたの検査。
 *
 * ★この検査は docs/番号のぶつかりの直しかた.md から
 *   ```javascript の塊を切り出して、そのまま動かします。
 *   手順書に書いたコードと、検査したコードが食い違わないようにするためです。
 *   手順書を直したら、この検査が落ちます。
 *
 * ★Apps Script の Utilities と SpreadsheetApp は、ここで作った
 *   代わりのもので動かします。表の列は docs/引き継ぎ書.md 4章どおりです。
 *
 * 使いかた：  node tests/tgas.cjs
 */
const fs   = require('fs');
const path = require('path');
const DIR  = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const doc  = fs.readFileSync(
  path.join(DIR, 'docs/番号のぶつかりの直しかた.md'), 'utf8');

/* 手順書から JavaScript の塊を全部取り出します */
const blocks = [];
const re = /```javascript\n([\s\S]*?)```/g;
let m;
while ((m = re.exec(doc)) !== null) blocks.push(m[1]);

/* 「直す前／直した後」の見本（function が入っていない塊）は外します */
const code = blocks.filter(b => /function\s+\w+_\s*\(/.test(b)).join('\n');
if (!/function newNo_/.test(code) || !/function rand_/.test(code) ||
    !/function ownNo_/.test(code)) {
  console.log('❌ 手順書から newNo_／rand_／ownNo_ が取り出せません');
  console.log('PASS=0 FAIL=1');
  process.exit(1);
}

/* ── Apps Script の代わり ───────────────────── */
const SHEETS = {
  '問い合わせ': [
    ['日時','メール','用件','内容','状況','番号'],
    ['2026/9/1','a@x.jp','明細について','ご確認ください','回答済み','C20260901-2'],
    ['2026/9/22','b@x.jp','修繕について','お願いします','確認中','C20260922-7-K4M9QXBT'],
    ['2026/9/22','B@X.JP','その他','大文字で入った例','確認中','C20260922-9-AAAA1111']
  ],
  '工事': [
    ['番号','メール','物件','部屋'],
    ['W20260905-3-TTTT2222','a@x.jp','カルムコート東棟','201']
  ]
};
const Utilities = { formatDate: (d) => {
  const p = n => String(n).padStart(2, '0');
  return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
} };
const SpreadsheetApp = { getActive: () => ({ getSheetByName: (n) => {
  const g = SHEETS[n];
  if (!g) return null;
  return {
    getLastRow: () => g.length,
    getLastColumn: () => g[0].length,
    getRange: (r, c, nr, nc) => ({ getValues: () =>
      g.slice(r - 1, r - 1 + nr).map(row => row.slice(c - 1, c - 1 + nc)) })
  };
} }) };

const box = new Function('Utilities', 'SpreadsheetApp',
  code + '; return { newNo_, rand_, ownNo_ };')(Utilities, SpreadsheetApp);
const { newNo_, rand_, ownNo_ } = box;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); }
                       else    { fail++; console.log('  ❌ ' + m); } };

console.log('\n── 重ならない文字（rand_）──');
ok(rand_(8).length === 8, '8文字');
ok(rand_(0) === '', '0文字なら空');
const many = Array.from({ length: 20000 }, () => rand_(8));
ok(many.every(s => /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(s)),
   '★まぎれる 0 O 1 I l を1度も出さない（お電話で読み上げるため）');
ok(new Set(many.join('')).size >= 28, '文字が偏っていない');

console.log('\n── 番号を作る（newNo_）──');
const sh = { getLastRow: () => 6 };
const a = newNo_('C', sh);
ok(/^C\d{8}-7-[A-Z2-9]{8}$/.test(a), '形が「C＋日付－行－8文字」（' + a + '）');
ok(/^W\d{8}-7-[A-Z2-9]{8}$/.test(newNo_('W', sh)), '工事は W で始まる');
ok(/^C\d{8}-0-/.test(newNo_('C', null)), 'シートが来なくても落ちない');

console.log('\n── ★ふたりが同じ秒に送ってもぶつからないか ──');
const oldNo = () => 'C' + Utilities.formatDate(new Date()) + '-' + 7;
ok(new Set(Array.from({ length: 1000 }, oldNo)).size === 1,
   '★直す前は1000回すべて同じ番号（これが不具合でした）');
const news = Array.from({ length: 200000 }, () => newNo_('C', sh));
const dup  = news.length - new Set(news).size;
ok(dup === 0, '★直した後は20万回で1件も重ならない（重なり ' + dup + '件）');
ok(rand_(8).length === 8,
   '★8文字であること（6文字だと20万回で十数件重なります）');

console.log('\n── 古い番号も、そのまま引けるか ──');
const look = (rows, no) =>
  rows.filter(r => String(r.no).trim() === String(no).trim());
const rows = [{ no:'C20260901-2' }, { no:'C20260922-7-K4M9QXBT' }];
ok(look(rows, 'C20260901-2').length === 1,
   '★すでに入っている番号も引ける（表の作り直しは要らない）');
ok(look(rows, 'C20260922-7-K4M9QXBT').length === 1, '新しい形も引ける');

console.log('\n── ご本人のものか確かめる（ownNo_）──');
ok(ownNo_('a@x.jp', 'C20260901-2') === true, '自分のお問い合わせ（古い形）');
ok(ownNo_('b@x.jp', 'C20260922-7-K4M9QXBT') === true, '自分のお問い合わせ（新しい形）');
ok(ownNo_('a@x.jp', 'W20260905-3-TTTT2222') === true, '自分の工事');
ok(ownNo_('B@x.JP', 'C20260922-9-AAAA1111') === true, '★大文字・小文字の違いは通す');
ok(ownNo_(' a@x.jp ', 'C20260901-2') === true, '前後の空白は通す');

console.log('\n── ★他の方のものは止める ──');
ok(ownNo_('a@x.jp', 'C20260922-7-K4M9QXBT') === false, '★他の方のお問い合わせ');
ok(ownNo_('b@x.jp', 'W20260905-3-TTTT2222') === false, '★他の方の工事');
ok(ownNo_('c@x.jp', 'C20260901-2') === false, '★表にいない方');
ok(ownNo_('a@x.jp', 'C20260901') === false, '★番号の一部だけでは通さない');

console.log('\n── こわれたものが来ても落ちない ──');
ok(ownNo_('', 'C20260901-2') === false, 'メールが空');
ok(ownNo_('a@x.jp', '') === false, '番号が空');
ok(ownNo_(null, null) === false, '両方なし');
ok(ownNo_('a@x.jp', 'C20260901-2 ') === true, '番号の後ろの空白は許す');

console.log('\n── ★なぜ①と②の両方が必要か ──');
SHEETS['問い合わせ'].push(
  ['2026/9/22','c@x.jp','明細について','ぶつかった例','確認中','C20260901-2']);
ok(ownNo_('a@x.jp', 'C20260901-2') === true, 'Aさんは自分のぶんとして通る');
ok(ownNo_('c@x.jp', 'C20260901-2') === true, 'Cさんも自分のぶんとして通る');
console.log('  ※ ②だけでは、ぶつかった番号を両方が「自分のもの」として通します。');
console.log('     だから①（番号を重ならなくする）も必要です。');

console.log('\nPASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
