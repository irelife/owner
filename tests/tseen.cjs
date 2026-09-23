/* 届いたか・見たかの記録の検査。
 *
 * ★この検査は docs/届いたか見たかの記録.md から
 *   ```javascript の塊を切り出して、そのまま動かします。
 *   手順書のコードを直すと、この検査が落ちます。
 *
 * ★SpreadsheetApp／Utilities は、ここで作った代わりのもので動かします。
 *   表の列は コード.gs ／ ext.gs の実物どおりです。
 *
 * 使いかた：  node tests/tseen.cjs
 */
const fs   = require('fs');
const path = require('path');
const DIR  = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const doc  = fs.readFileSync(
  path.join(DIR, 'docs/届いたか見たかの記録.md'), 'utf8');

const blocks = [];
const re = /```javascript\n([\s\S]*?)```/g;
let m;
while ((m = re.exec(doc)) !== null) blocks.push(m[1]);
const code = blocks
  .filter(b => /^function\s+[A-Za-z_]\w*\s*\(/m.test(b))
  .join('\n');
for (const need of ['seenSheet_', 'noteSeen_', 'ckKey_', 'seenAll_', 'loginAll_', 'stCheck']) {
  if (!new RegExp('function\\s+' + need).test(code)) {
    console.log('❌ 手順書から ' + need + ' が取り出せません');
    console.log('PASS=0 FAIL=1');
    process.exit(1);
  }
}

/* ══════ Apps Script の代わり ══════ */
let SHEETS = {};
function reset() {
  SHEETS = {
    'オーナー': [
      ['メール','氏名','宛名','塩','合言葉','初回変更','作成日時','支社'],
      ['a@x.jp','山田 太郎','山田 太郎 様','s','h','いいえ','2026/9/1','福山'],
      ['b@x.jp','鈴木 花子','鈴木 花子 様','s','h','いいえ','2026/9/1',''],
      ['c@x.jp','佐藤 一郎','佐藤 一郎 様','s','h','はい','2026/9/22','岡山']
    ],
    '明細': [
      ['メール','対象月','ファイルID','表示名','送金額','送金日','内訳','登録日時'],
      /* ★わざと「古い月を、あとの行」に置きます（送った順に増えるため） */
      ['a@x.jp','2026年9月','F_A9','','','','',''],
      ['a@x.jp','2026年8月','F_A8','','','','',''],
      ['b@x.jp','2026年9月','F_B9','','','','','']
    ],
    'ログイン試行': [
      ['日時','メール','結果'],
      ['2026/9/20 10:00','a@x.jp','ちがう'],
      ['2026/9/20 10:01','a@x.jp','ログイン'],
      ['2026/9/23 4:07','a@x.jp','ログイン'],
      ['2026/9/20 9:00','b@x.jp','ログイン'],
      ['2026/9/23 5:00','c@x.jp','ちがう']
    ],
    '閲覧': [
      ['メール','ファイルID','日時'],
      ['a@x.jp','F_A8','2026/9/21 11:00'],
      ['a@x.jp','F_A9','2026/9/23 4:10']
    ]
  };
}
reset();

const mk = (g) => ({
  getLastRow: () => g.length,
  getLastColumn: () => g[0].length,
  setFrozenRows: () => {},
  getRange: (r, c, nr, nc) => ({
    getValues: () => (nr === undefined ? [[g[r-1][c-1]]]
      : g.slice(r-1, r-1+nr).map(row => {
          const out = [];
          for (let i = 0; i < nc; i++) out.push(row[c-1+i] === undefined ? '' : row[c-1+i]);
          return out;
        })),
    getValue: () => g[r-1][c-1],
    setValue: (v) => { g[r-1][c-1] = v; },
    setValues: (vv) => { vv.forEach((row, i) => { g[r-1+i] = row.slice(); }); }
  }),
  appendRow: (row) => { g.push(row.slice()); },
  deleteRow: (r) => { g.splice(r-1, 1); }
});
const SpreadsheetApp = { getActiveSpreadsheet: () => ({
  getSheetByName: (n) => SHEETS[n] ? mk(SHEETS[n]) : null,
  insertSheet: (n) => { SHEETS[n] = [[]]; return mk(SHEETS[n]); }
}) };
const Utilities = { formatDate: (d) => {
  const t = new Date(d);
  return t.getFullYear() + '/' + (t.getMonth()+1) + '/' + t.getDate();
} };
const Logger = { log: () => {} };

/* ext.gs / コード.gs の側にあって、手順書には入っていないもの */
const helpers = `
  var COL_OWN_AREA = 8;
  function norm_(s){ return String(s == null ? '' : s).trim().toLowerCase(); }
  function extMs_(d){ try{ return new Date(d).getTime() || 0; }catch(e){ return 0; } }
  function ownSheet_(){
    return SpreadsheetApp.getActiveSpreadsheet().getSheetByName('オーナー');
  }
`;
const box = new Function('SpreadsheetApp', 'Utilities', 'Logger',
  helpers + '\n' + code +
  '; return { seenSheet_, noteSeen_, ckKey_, seenAll_, loginAll_, stCheck };'
)(SpreadsheetApp, Utilities, Logger);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); }
                       else    { fail++; console.log('  ❌ ' + m); } };
const eq = (got, want, m) => ok(got === want, m + '（' + JSON.stringify(got) + '）');
const byMail = (list, mail) => list.filter(x => x.mail === mail)[0];

console.log('\n── 対象月の数くらべ（ckKey_）──');
eq(box.ckKey_('2026年9月'), 202609, 'ふつうの月');
eq(box.ckKey_('2026年12月'), 202612, '12月');
eq(box.ckKey_('２０２６年９月'), 202609, '★全角でも読める');
eq(box.ckKey_('2026/9'), 202609, 'スラッシュ');
eq(box.ckKey_('調整中'), 0, '★読めないものは0（推測しない）');
eq(box.ckKey_(''), 0, '空は0');
eq(box.ckKey_(null), 0, '何も来なくても落ちない');
eq(box.ckKey_('2026年13月'), 0, '★13月は通さない');
eq(box.ckKey_('1800年5月'), 0, '★ありえない年は通さない');

console.log('\n── 明細を開いた記録（seenAll_）──');
{
  const s = box.seenAll_();
  eq(Utilities.formatDate(s.last['a@x.jp']), '2026/9/23',
     '★いちばん新しい閲覧日時を取る（古い行が先にあっても）');
  ok(s.ids['a@x.jp|F_A9'] === 1, '9月の明細を開いた記録がある');
  ok(s.ids['a@x.jp|F_A8'] === 1, '8月の明細を開いた記録がある');
  ok(s.ids['b@x.jp|F_B9'] === undefined, '★開いていない方の記録は無い');
  ok(s.last['b@x.jp'] === undefined, '開いていない方の日時は無い');
}

console.log('\n── 最終ログイン（loginAll_）──');
{
  const l = box.loginAll_();
  eq(Utilities.formatDate(l['a@x.jp']), '2026/9/23',
     '★いちばん新しいログインを取る');
  eq(Utilities.formatDate(l['b@x.jp']), '2026/9/20', 'もう一方');
  ok(l['c@x.jp'] === undefined,
     '★「ちがう」だけの方は、ログインしていないあつかい');
}

console.log('\n── まとめ（stCheck）──');
{
  const r = box.stCheck({});
  eq(r.list.length, 3, 'オーナー様3名');

  const a = byMail(r.list, 'a@x.jp');
  eq(a.name, '山田 太郎', 'お名前');
  eq(a.area, '福山', '支社');
  eq(a.months, 2, '明細は2か月ぶん');
  eq(a.ym, '2026年9月', '★いちばん新しい月を選ぶ（表の行の順ではなく月の数で）');
  eq(a.pdf, true, 'その月のPDFがある');
  eq(a.opened, true, '★その月の明細を開いている');
  eq(a.login, '2026/9/23', '最終ログイン');
  eq(a.seen, '2026/9/23', '最後に明細を開いた日');

  const b = byMail(r.list, 'b@x.jp');
  eq(b.ym, '2026年9月', '対象月');
  eq(b.pdf, true, 'PDFはある');
  eq(b.opened, false, '★入ったが、まだ開いていない');
  eq(b.login, '2026/9/20', 'ログインはしている');
  eq(b.seen, '', '明細は開いていない');
  eq(b.area, '', '支社が空でも落ちない');

  const c = byMail(r.list, 'c@x.jp');
  eq(c.months, 0, '★明細が1件も無い');
  eq(c.ym, '', '対象月は空');
  eq(c.pdf, false, 'PDFなし');
  eq(c.opened, false, '開いていない');
  eq(c.login, '', '★一度もログインしていない');
}

console.log('\n── 月を指定したとき ──');
{
  const r = box.stCheck({ month:'2026年8月' });
  const a = byMail(r.list, 'a@x.jp');
  eq(a.ym, '2026年8月', '指定した月になる');
  eq(a.opened, true, '8月の明細も開いている');
  const b = byMail(r.list, 'b@x.jp');
  eq(b.ym, '', '★8月が無い方は空（別の月を混ぜない）');
  eq(b.pdf, false, 'PDFもなし');
}

console.log('\n── 開いたことを記録する（noteSeen_）──');
{
  reset();
  const before = SHEETS['閲覧'].length;
  box.noteSeen_('B@X.JP', 'F_B9');
  eq(SHEETS['閲覧'].length, before + 1, '1行増える');
  eq(SHEETS['閲覧'][before][0], 'b@x.jp', '★メールは小文字にそろえる');
  eq(SHEETS['閲覧'][before][1], 'F_B9', 'ファイルID');
  const r = box.stCheck({});
  eq(byMail(r.list, 'b@x.jp').opened, true, '★記録したら「開いた」になる');
}

console.log('\n── こわれたものが来ても落ちない ──');
{
  reset();
  box.noteSeen_('', '');
  box.noteSeen_(null, null);
  ok(true, 'メールもIDも空でも落ちない');
  SHEETS['閲覧'].push(['a@x.jp','F_A9','こわれた日付']);
  const s = box.seenAll_();
  ok(s.ids['a@x.jp|F_A9'] === 1, '★日付が読めなくても、開いたことは残る');
  eq(Utilities.formatDate(s.last['a@x.jp']), '2026/9/23',
     '★読めない日付で上書きしない');

  delete SHEETS['ログイン試行'];
  eq(Object.keys(box.loginAll_()).length, 0, '★ログイン試行の表が無くても落ちない');

  reset();
  delete SHEETS['明細'];
  const r2 = box.stCheck({});
  eq(r2.list.length, 3, '★明細の表が無くても一覧は出る');
  eq(byMail(r2.list, 'a@x.jp').months, 0, '明細は0件');

  reset();
  SHEETS['オーナー'] = [SHEETS['オーナー'][0]];
  eq(box.stCheck({}).list.length, 0, 'オーナー様が0名なら空');

  SHEETS = {};
  eq(box.stCheck({}).list.length, 0, '★表が1つも無くても落ちない');
}

console.log('\nPASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
