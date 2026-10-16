/* ★ 検査をまとめて走らせる係
 *
 *   使いかた：
 *     node tests/run-all.cjs              … このリポジトリを検査します
 *     node tests/run-all.cjs /別の/場所    … よその場所を検査します
 *
 *   1件でも失敗したら、終了コード 1 で終わります。
 *   GitHub Actions は、これを見て「赤」にします。
 *
 *   ★ 2026/10/16 新設
 *     これまで 22件を1つずつ手で走らせていました。
 *     「直したら必ず検査を通す」という決まりがあるのに、
 *     まとめて走らせる仕組みだけ、ここにはありませんでした。
 *     （PIVOT2・PIVOT3 には前からあります）
 */
const { execFileSync } = require('child_process');
const path = require('path');

/* ★ playwright が「端末全体」にだけ入っているときでも、検査が動くようにします。
 *
 *  tests/ の下に node_modules を置いていない端末では、
 *  playwright も playwright-core も見つからず、1件も動きません。
 *  中身の不具合ではなく、置き場所の問題です。
 *
 *  node が既定で見る場所に、全体の node_modules を足します。
 *  各検査は子プロセスなので、この環境変数をそのまま引き継ぎます。   */
(function(){
  try{ require.resolve('playwright'); return; }catch(e){}
  try{ require.resolve('playwright-core'); return; }catch(e){}
  const fs = require('fs');
  const cand = [];
  try{ cand.push(path.join(path.dirname(path.dirname(process.execPath)), 'lib', 'node_modules')); }catch(e){}
  try{ (require('module').globalPaths || []).forEach(function(p){ cand.push(p); }); }catch(e){}
  const add = cand.filter(function(p){
    try{ return !!p && fs.existsSync(path.join(p, 'playwright')); }catch(e){ return false; }
  });
  if(add.length){
    process.env.NODE_PATH = [process.env.NODE_PATH].concat(add).filter(Boolean).join(path.delimiter);
    try{ require('module').Module._initPaths(); }catch(e){}
    console.log('playwright は端末全体の場所から使います: ' + add[0]);
  }else{
    console.log('⚠ playwright が見つかりません。tests/ で  npm i  を実行してください。');
  }
})();

const DIR = path.resolve(process.argv[2] || path.join(__dirname, '..'));

const SUITES = [
  /* ── 入口（ログイン・パスワード） ── */
  ['tlogin',  'ログイン'],
  ['treset',  'メールのリンクからの、パスワード再設定'],
  ['tidle',   '動きが無ければ、ひとりでに降りる'],
  ['tmy',     'マイアカウント'],

  /* ── 送金明細 ── */
  ['tpp',     '送金明細'],
  ['tpap',    '送金明細のカードで、金額が切れない'],
  ['tnote',   'その月のひとこと（明細の備考）'],

  /* ── 物件・入居 ── */
  ['tst',     '入居状況'],
  ['tocc',    '入居率'],
  ['tfull',   '満室の物件を出す'],
  ['tdiff',   '前月比'],
  ['tins',    '火災保険'],
  ['twk',     '「原状回復・修繕」の画面が、取り下げられている'],

  /* ── お問い合わせ ── */
  ['tct',     'お問い合わせの「返事の数」'],
  ['tctq',    'お問い合わせ履歴の「検索」'],
  ['tarea2',  'お問い合わせの「物件の所在地」'],

  /* ── 税理士先生へ ── */
  ['tacc',    '税理士へ送信'],
  ['ttax',    '税理士先生へ「1年分（12か月）」をお送りできる'],

  /* ── 見た目・読みやすさ ── */
  ['tbg',     'ログイン画面の背景'],
  ['tfont',   '見出しの明朝（Shippori Mincho B1）'],
  ['ttile',   'ホームのタイルが「そろって見える」'],
  ['tsize',   '指でふれる的の大きさ・はみ出し・ボタンの重なり'],
];

let ngList = [];
let totalPass = 0;
console.log('検査する場所: ' + DIR);
console.log('');

for (const [name, what] of SUITES) {
  process.stdout.write('▶ ' + name + '  ' + what + ' … ');
  let out = '';
  let ng = false;
  try {
    out = execFileSync(process.execPath, [path.join(__dirname, name + '.cjs'), DIR],
                       { encoding: 'utf8', timeout: 5 * 60 * 1000 });
  } catch (e) {
    out = (e.stdout || '') + (e.stderr || '');
    ng = true;
  }
  const m = out.match(/PASS=(\d+)\s+(?:❌\s*)?FAIL=(\d+)/);
  const pass = m ? Number(m[1]) : 0;
  const fail = m ? Number(m[2]) : -1;
  if (fail !== 0) ng = true;
  totalPass += pass;

  console.log(ng ? ('❌ 合格' + pass + ' / 失敗' + (fail < 0 ? '?' : fail))
                 : ('✅ 合格' + pass));
  if (ng) {
    ngList.push(name);
    console.log('--- ' + name + ' の中身 ---');
    console.log(out.split('\n').filter(l => /❌|✗|PASS=|エラー|Error/.test(l)).join('\n'));
    console.log('--- ここまで ---');
  }
}

console.log('');
console.log('合格の合計: ' + totalPass + ' 件');
if (ngList.length === 0) {
  console.log('✅ すべて合格しました。');
  process.exit(0);
}
console.log('❌ 失敗した検査: ' + ngList.join(', '));
process.exit(1);
