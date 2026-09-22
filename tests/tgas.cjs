/* `ext.gs` の直しかたの検査。
 *
 * ★この検査は docs/番号のぶつかりの直しかた.md から
 *   ```javascript の塊を切り出して、そのまま動かします。
 *   手順書に書いたコードと、検査したコードが食い違わないようにするためです。
 *   手順書のコードを直すと、この検査が落ちます。
 *
 * ★Apps Script の Utilities／SpreadsheetApp／CacheService／MailApp は、
 *   ここで作った代わりのもので動かします。
 *   表の列は ext.gs の実物どおりです。
 *
 * 使いかた：  node tests/tgas.cjs
 */
const fs   = require('fs');
const path = require('path');
const DIR  = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const doc  = fs.readFileSync(
  path.join(DIR, 'docs/番号のぶつかりの直しかた.md'), 'utf8');

const blocks = [];
const re = /```javascript\n([\s\S]*?)```/g;
let m;
while ((m = re.exec(doc)) !== null) blocks.push(m[1]);

/* 「直す前／直した後」の見本は外し、関数のある塊だけを集めます。
   ★関数名がアルファベットで始まるものだけ。「合言葉の候補を出す」は
     Apps Script で手で実行するものなので、検査には入れません。 */
const code = blocks
  .filter(b => /^function\s+[A-Za-z_]\w*\s*\(/m.test(b))
  .join('\n');
for (const need of ['newNo_', 'noRand_', 'stReply']) {
  if (!new RegExp('function\\s+' + need).test(code)) {
    console.log('❌ 手順書から ' + need + ' が取り出せません');
    console.log('PASS=0 FAIL=1');
    process.exit(1);
  }
}

/* ══════ Apps Script の代わり ══════ */
const SHEETS = {
  '問い合わせ': [
    ['日時','メール','用件','内容','状況','番号'],
    ['2026/9/1','a@x.jp','明細について','ご確認ください','回答済み','C20260901-2'],
    ['2026/9/22','b@x.jp','修繕について','お願いします','確認中','C20260922-7-K4M9QXBT']
  ],
  '工事': [
    ['番号','メール','物件','部屋','内容','着手日','完了日','金額',
     '相殺予定','状況','備考','登録日時'],
    ['W20260905-3-TTTT2222','a@x.jp','カルムコート東棟','201','原状回復',
     '','','86400','','完了','','2026/9/5']
  ]
};
const Utilities = { formatDate: (d) => {
  const p = n => String(n).padStart(2, '0');
  return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
} };
const mkSheet = (g) => ({
  getLastRow: () => g.length,
  getLastColumn: () => g[0].length,
  getRange: (r, c, nr, nc) => ({
    getValues: () => (nr === undefined ? [[g[r-1][c-1]]]
                     : g.slice(r-1, r-1+nr).map(row => row.slice(c-1, c-1+nc))),
    getValue: () => g[r-1][c-1],
    setValue: (v) => { g[r-1][c-1] = v; }
  })
});
const SpreadsheetApp = { getActiveSpreadsheet: () => ({
  getSheetByName: (n) => SHEETS[n] ? mkSheet(SHEETS[n]) : null }) };

let CACHE = {};
const CacheService = { getScriptCache: () => ({
  get: (k) => (k in CACHE ? CACHE[k] : null),
  put: (k, v) => { CACHE[k] = String(v); },
  remove: (k) => { delete CACHE[k]; } }) };

let MAILS = [];
const MailApp = { sendEmail: (o) => { MAILS.push(o); } };
let MSGS = [];
let PROPS = { ADMIN_KEY: 'x'.repeat(40), SUPPORT: 'info@ire-life.com',
              SITE_URL: 'https://irelife.github.io/owner/' };

/* ext.gs の側にあって、手順書には入っていないもの */
const helpers = `
  function prop_(k){ return PROPS[k] || ''; }
  function ng_(msg){ return { ok:false, error:'ng', message:msg }; }
  function log_(){}
  function norm_(v){ return String(v == null ? '' : v).trim().toLowerCase(); }
  function addMsg_(id, who, body){ MSGS.push({ id:id, who:who, body:body }); }
  function askSheet_(){
    return SpreadsheetApp.getActiveSpreadsheet().getSheetByName('問い合わせ');
  }
  function askRows_(){
    var sh = askSheet_(), last = sh.getLastRow();
    if(last < 2) return [];
    var v = sh.getRange(2, 1, last - 1, 6).getValues(), out = [];
    for(var i = 0; i < v.length; i++){
      var row = i + 2, no = String(v[i][5] || '').trim();
      if(!no){ no = newNo_('C', row); sh.getRange(row, 6).setValue(no); }
      out.push({ _row:row, at:v[i][0], mail:v[i][1], kind:String(v[i][2] || ''),
                 body:String(v[i][3] || ''), state:String(v[i][4] || '確認中'), no:no });
    }
    return out;
  }
  function workRows_(){
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('工事');
    var last = sh.getLastRow();
    if(last < 2) return [];
    var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var v = sh.getRange(2, 1, last - 1, head.length).getValues();
    return v.map(function(r, i){
      var x = { _row: i + 2 };
      head.forEach(function(k, j){ x[k] = r[j]; });
      if(!String(x['番号'] || '').trim()){
        var id = newNo_('W', x._row);
        sh.getRange(x._row, 1).setValue(id);
        x['番号'] = id;
      }
      return x;
    });
  }
  function stList(){ return { ok:true, list:[] }; }
  function stArea(){ return { ok:true }; }
`;

const box = new Function(
  'Utilities', 'SpreadsheetApp', 'CacheService', 'MailApp', 'PROPS', 'MSGS',
  helpers + '\n' + code +
  '; return { newNo_, noRand_, stReply, askRows_, workRows_ };'
)(Utilities, SpreadsheetApp, CacheService, MailApp, PROPS, MSGS);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); }
                       else    { fail++; console.log('  ❌ ' + m); } };

console.log('\n── 重ならない文字（noRand_）──');
ok(box.noRand_(8).length === 8, '8文字');
ok(box.noRand_(0) === '', '0文字なら空');
const many = Array.from({ length: 20000 }, () => box.noRand_(8));
ok(many.every(s => /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(s)),
   '★まぎれる 0 O 1 I l を1度も出さない（お電話で読み上げるため）');
ok(new Set(many.join('')).size >= 28, '文字が偏っていない');

console.log('\n── 番号を作る（newNo_）──');
const a = box.newNo_('C', 7);
ok(/^C\d{8}-7-[A-Z2-9]{8}$/.test(a), '形が「C＋日付－行－8文字」（' + a + '）');
ok(/^W\d{8}-3-[A-Z2-9]{8}$/.test(box.newNo_('W', 3)), '工事は W で始まる');
ok(/^C\d{8}-0-/.test(box.newNo_('C')), '行が来なくても落ちない');

console.log('\n── ★ふたりが同時に送ってもぶつからないか ──');
const oldNo = () => 'C' + Utilities.formatDate(new Date()) + '-' + 7;
ok(new Set(Array.from({ length: 1000 }, oldNo)).size === 1,
   '★直す前は1000回すべて同じ番号（これが不具合でした）');
const news = Array.from({ length: 200000 }, () => box.newNo_('C', 7));
const dup  = news.length - new Set(news).size;
ok(dup === 0, '★直した後は20万回で1件も重ならない（重なり ' + dup + '件）');
ok(box.noRand_(8).length === 8, '★8文字であること（6文字だと20万回で十数件重なる）');

console.log('\n── 古い番号も、そのまま引けるか ──');
ok(box.askRows_().filter(x => x.no === 'C20260901-2').length === 1,
   '★すでに入っている古い形の番号も引ける（表の作り直しは要らない）');
ok(box.askRows_().filter(x => x.no === 'C20260922-7-K4M9QXBT').length === 1,
   '新しい形も引ける');

console.log('\n── お返事（stReply）★あて先を番号から引き直す ──');
MAILS = []; MSGS.length = 0;
let r = box.stReply({ id:'C20260901-2', body:'承知いたしました。', mail:'まちがい@x.jp' });
ok(r.ok === true, 'お問い合わせに返せる');
ok(MAILS.length === 1 && MAILS[0].to === 'a@x.jp',
   '★画面から来た「まちがい@x.jp」ではなく、台帳の a@x.jp に送る');
ok(SHEETS['問い合わせ'][1][4] === '回答済み', '状況が「回答済み」になる');
ok(MSGS.length === 1 && MSGS[0].who === '当社', 'やりとりに1件増える');

MAILS = []; MSGS.length = 0;
r = box.stReply({ id:'W20260905-3-TTTT2222', body:'着工いたします。' });
ok(r.ok === true, '工事にも返せる');
ok(MAILS.length === 1 && MAILS[0].to === 'a@x.jp', '★工事も台帳のアドレスに送る');

MAILS = []; MSGS.length = 0;
r = box.stReply({ id:'C99999999-1-ZZZZZZZZ', body:'打ち間違えました', mail:'a@x.jp' });
ok(r.ok === false, '★台帳に無い番号は断る');
ok(MSGS.length === 0,
   '★断ったとき、やりとりに書き込まない（誰のものでもない発言を残さない）');
ok(MAILS.length === 0, '★断ったとき、メールも送らない');

r = box.stReply({ id:'', body:'本文' });
ok(r.ok === false, '番号が空なら断る');
r = box.stReply({ id:'C20260901-2', body:'   ' });
ok(r.ok === false, '本文が空白だけなら断る');

console.log('\n── ★番号がぶつかっていたら、どうなるか ──');
SHEETS['問い合わせ'].push(
  ['2026/9/22','c@x.jp','明細について','ぶつかった例','確認中','C20260901-2']);
MAILS = []; MSGS.length = 0;
box.stReply({ id:'C20260901-2', body:'お返事です' });
ok(SHEETS['問い合わせ'][1][4] === '回答済み' &&
   SHEETS['問い合わせ'][3][4] === '回答済み',
   '★ぶつかった行を両方「回答済み」にする（片方が確認中で残らない）');
console.log('  ※ ただし、どちらのオーナー様に送るかは決められません。');
console.log('     だから番号を重ならなくすること（2章）が本体です。');

console.log('\nPASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
