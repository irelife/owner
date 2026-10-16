/* ★★ 満室の物件を出す検査（2026/10/15 新規）
 *
 *  【改良前】 満室の物件は、画面に1行も出ませんでした。
 *      status（Apps Script）が返すのは
 *        新規契約 ・ 解約予定 ・ 募集中 の3つだけです。
 *      満室の物件は、どれにも当てはまりません。
 *      オーナー様から見ると「うちの棟は何も書いていない」となり、
 *      調べているのか忘れられているのか分かりません。
 *
 *  【改良後】 「満室」と出します。Apps Script は足していません。
 *      unitsBy（棟ごとの総戸数・2026/10/5 に追加）に全部の棟が
 *      入っているので、「空室が0の棟＝満室」として拾えます。
 *
 *  ★この検査がいちばん見ているのは、
 *      **物件名の表記が食いちがったときに、1件も出さないか**
 *    です。「マーベラスA棟」と「マーベラスＡ棟」が混ざっていると、
 *    空室があるのに「満室です」と言ってしまいます。
 *    これはオーナー様に嘘をつくことになります。
 *    率（入居率）と同じく、迷ったら出さない作りにしてあります。
 *
 *  前半：数の正しさ（stFull）
 *  後半：画面にどう出るか（本物のブラウザ）
 *
 *  使いかた：  node tests/tfull.cjs
 */
const fs   = require('fs');
const path = require('path');
const { chromium } = (function(){
  try{ return require('playwright'); }
  catch(e){ return require('/opt/node22/lib/node_modules/playwright'); }
})();

const DIR = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const URL = 'file://' + path.join(DIR, 'index.html');
const src = fs.readFileSync(path.join(DIR, 'js/app.js'), 'utf8');

function slice(headMark, tailMark){
  const a = src.indexOf(headMark);
  const b = src.indexOf(tailMark);
  if (a < 0 || b < 0 || b < a) return null;
  return src.slice(a, b);
}
const ins = slice(
  '  /* ===== 検査できる道具（tests/tins.cjs が読みます）ここから =====',
  '  /* ===== 検査できる道具（火災保険）ここまで ===== */');
const st = slice(
  '  /* ===== 検査できる道具（tests/tst.cjs が読みます）ここから =====',
  '  /* ===== 検査できる道具（入居状況）ここまで ===== */');
if (!ins || !st){
  console.log('❌ 検査できる道具が見つかりません（js/app.js の目印を消していませんか）');
  console.log('PASS=0 FAIL=1');
  process.exit(1);
}
const { stFull, stGroup } = new Function(
  ins + st + '; return { stFull, stGroup };')();

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); }
                       else   { fail++; console.log('  ❌ ' + m); } };
const eq = (g, w, m) => ok(g === w, m + '（' + JSON.stringify(g) + '）');

/* 画面に出ている形（stGroup が返す形）を手で作ります */
const bx = (name, rooms) => ({ name:name, rooms:rooms });
const rm = (room, kind) => ({ kind:kind, room:room, place:'', tag:'',
  detail:'', tenant:'', end:'', start:'', rent:'', moved:false, movedDate:'' });

/* ───────── ① ふつうに満室 ───────── */
console.log('\n① 空室が0の棟は、満室になる');
{
  const f = stFull([], [{ prop:'A棟', units:5 }]);
  eq(Array.isArray(f), true, '配列が返る');
  eq(f.length, 1, '1棟');
  eq(f[0].prop, 'A棟', '物件名');
  eq(f[0].units, 5, '全5室');
  eq(f[0].listed, false, '★一覧に1行も出ていない（満室だけの枠を作る）');
}
{
  /* 新規契約だけの棟。契約が決まった部屋は空いていません。 */
  const boxes = [bx('A棟', [rm('101号室', '新規契約')])];
  const f = stFull(boxes, [{ prop:'A棟', units:5 }]);
  eq(f.length, 1, '★新規契約だけの棟も満室');
  eq(f[0].listed, true, '★一覧にも出ている（名前の横に札を足す）');
  eq(f[0].units, 5, '戸数は unitsBy のまま');
}

/* ───────── ② 満室にしない ───────── */
console.log('\n② 空いている棟は、満室にしない');
{
  const boxes = [bx('A棟', [rm('101号室', '募集中')])];
  const f = stFull(boxes, [{ prop:'A棟', units:5 }]);
  eq(f.length, 0, '★募集中があれば満室にしない');
}
{
  const boxes = [bx('A棟', [rm('101号室', '解約予定')])];
  const f = stFull(boxes, [{ prop:'A棟', units:5 }]);
  eq(f.length, 0, '★解約予定があれば満室にしない（空室に数えます）');
}
{
  const boxes = [bx('A棟', [rm('101号室', '募集中'), rm('102号室', '新規契約')])];
  const f = stFull(boxes, [{ prop:'A棟', units:5 }, { prop:'B棟', units:3 }]);
  eq(f.length, 1, 'A棟は満室でない／B棟は満室');
  eq(f[0].prop, 'B棟', '満室なのはB棟だけ');
}

/* ───────── ③ ★出さないと決めた場合 ───────── */
console.log('\n③ ★出さないと決めた場合（null を返す）');
eq(stFull([], null),      null, 'unitsBy が無い');
eq(stFull([], []),        null, 'unitsBy が空');
eq(stFull([], [{ prop:'A棟', units:0 }]),    null, '戸数が0');
eq(stFull([], [{ prop:'A棟', units:'—' }]),  null, '戸数が数でない');
eq(stFull([], [{ prop:'',   units:5 }]),     null, '物件名が空');
eq(stFull([], [{ prop:'A棟', units:5 }, { prop:'A棟', units:3 }]),
   null, '同じ物件名が2つ');
{
  /* いちばん危ないところ。
     一覧は「マーベラスＡ棟」（全角A）、unitsBy は「マーベラスA棟」（半角A）。
     そろえずに通すと、空室があるのに「満室です」と出ます。 */
  const boxes = [bx('マーベラスＡ棟', [rm('101号室', '募集中')])];
  const f = stFull(boxes, [{ prop:'マーベラスA棟', units:5 }]);
  eq(f, null, '★表記が食いちがったら、1件も出さない');
}
{
  const boxes = [bx('', [rm('101号室', '募集中')])];
  const f = stFull(boxes, [{ prop:'A棟', units:5 }]);
  eq(f, null, '★物件名未設定があったら、1件も出さない');
}

/* ───────── ④ 本物の明細（6棟 35室）───────── */
console.log('\n④ 実際の明細（6棟 35室・2026年9月分）');
const UNITS_BY = [
  { prop:'マーベラスA棟', units:5 }, { prop:'マーベラスB棟', units:5 },
  { prop:'カルムコート東棟', units:6 }, { prop:'カルムコート西棟', units:6 },
  { prop:'グロリオサ', units:8 },      { prop:'サンライズ', units:5 }
];
{
  /* 解約予定2件（A棟101・グロリオサ305）。ほかは満室。 */
  const boxes = [
    bx('マーベラスA棟', [rm('101号室', '解約予定')]),
    bx('グロリオサ',    [rm('305号室', '解約予定')])
  ];
  const f = stFull(boxes, UNITS_BY);
  eq(f.length, 4, '★満室は4棟（6棟のうち2棟に解約予定）');
  eq(f.map(x => x.prop).join('／'),
     'マーベラスB棟／カルムコート東棟／カルムコート西棟／サンライズ',
     '満室の4棟');
  eq(f.every(x => x.listed === false), true, 'どれも一覧には出ていない');
}
{
  const f = stFull([], UNITS_BY);
  eq(f.length, 6, '★入退去が1つも無ければ、6棟すべて満室');
  eq(f.reduce((a, x) => a + x.units, 0), 35, '合計 35室');
}

/* ───────── 後半：画面 ───────── */
const HOME = { ok:true, month:'2026年9月', total:400000,
  sokinDate:'2026年9月28日', pdfId:'F1', rows:[{ label:'マーベラスA棟', amount:400000 }],
  moves:{ newc:0, yotei:2, boshu:0 }, props:UNITS_BY.map(x => ({ name:x.prop })) };

const S = {
  /* 解約予定2件。残り4棟は満室。 */
  real: { ok:true, month:'2026年9月', units:35, unitsBy:UNITS_BY,
    newc:[], boshu:[],
    yotei:[{ place:'マーベラスA棟 101号室', tag:'2026年11月30日', detail:'' },
           { place:'グロリオサ 305号室',    tag:'2026年12月15日', detail:'' }] },
  /* 入退去ゼロ。6棟すべて満室。 */
  allfull: { ok:true, month:'2026年9月', units:35, unitsBy:UNITS_BY,
    newc:[], yotei:[], boshu:[] },
  /* ★表記違い。満室を1つも出してはいけません。 */
  bad: { ok:true, month:'2026年9月', units:35, unitsBy:UNITS_BY,
    newc:[], boshu:[],
    yotei:[{ place:'マーベラスＡ棟 101号室', tag:'2026年11月30日', detail:'' }] },
  /* unitsBy が無い（PIVOT2 が古いとき）。これまでどおりの画面。 */
  nounits: { ok:true, month:'2026年9月',
    newc:[], boshu:[],
    yotei:[{ place:'マーベラスA棟 101号室', tag:'2026年11月30日', detail:'' }] }
};
let which = 'real';

function stage(p){
  return p.route('**/macros/s/**', r => {
    const A = JSON.parse(r.request().postData() || '{}').action;
    let x = { ok:true };
    if(A === 'login' || A === 'me')
      x = { ok:true, token:'T', owner:{ name:'山田 太郎', atena:'山田 太郎 様' },
            home:HOME, status:S[which] };
    else if(A === 'home')   x = HOME;
    else if(A === 'status') x = S[which];
    else if(A === 'papers') x = { ok:true, years:[] };
    else if(A === 'insList' || A === 'talks') x = { ok:true, list:[] };
    r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(x) });
  });
}

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport:{ width:390, height:900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await stage(p);

  async function openStatus(){
    await p.goto(URL);
    await p.evaluate(() => { try{ localStorage.clear(); }catch(e){} });
    await p.goto(URL);
    await p.waitForTimeout(400);
    await p.fill('#li-mail', 'owner@example.jp');
    await p.fill('#li-pass', 'password1234');
    await p.click('#li-go');
    await p.waitForTimeout(1200);
    await p.click('[data-go="status"]');
    await p.waitForTimeout(700);
  }
  const read = () => p.evaluate(() => {
    const t = s => [...document.querySelectorAll(s)]
                     .map(e => e.textContent.trim().replace(/\s+/g, ' '));
    return {
      sum   : (document.querySelector('.st-sum') || {}).textContent || '',
      props : t('#st-body .st-pn'),
      full  : t('#st-body .st-full'),
      fulln : t('#st-body .st-fulln'),
      note  : t('#st-body .st-note'),
      body  : (document.getElementById('st-body').textContent || '')
                .replace(/\s+/g, ' ')
    };
  });

  console.log('\n⑤ 画面（解約予定2件・残り4棟は満室）');
  which = 'real'; await openStatus();
  let r = await read();
  eq(r.props.length, 6, '★6棟すべて画面に出る（改良前は2棟だけ）');
  eq(r.full.length, 4, '★「満室」の札が4つ');
  eq(r.fulln.length, 4, '満室の一行も4つ');
  ok(/全 5 室、すべてご入居いただいております。/.test(r.fulln[0]),
     '戸数を添える（' + r.fulln[0] + '）');
  ok(/入居率 94\.3％/.test(r.sum), 'まとめの一行は 94.3％のまま（' +
     r.sum.slice(0, 30) + '…）');
  ok(r.body.indexOf('マーベラスB棟') >= 0, '満室のB棟が出る');
  eq(r.note.length, 0, '入退去があるので、ことわり書きは出さない');

  console.log('\n⑥ 画面（入退去ゼロ・6棟すべて満室）');
  which = 'allfull'; await openStatus();
  r = await read();
  eq(r.full.length, 6, '★6棟とも「満室」');
  eq(r.note.length, 1, '★「今月、入退去のご予定はございません。」を1行添える');
  ok(/入退去のご予定はございません/.test(r.note[0]), '文面（' + r.note[0] + '）');
  ok(/入居率 100％|入居率 100\.0％/.test(r.sum),
     '入居率は100％（' + r.sum.slice(0, 30) + '…）');

  console.log('\n⑦ ★表記が食いちがうとき（満室を1つも出さない）');
  which = 'bad'; await openStatus();
  r = await read();
  eq(r.full.length, 0, '★「満室」の札は0。嘘をつかない');
  eq(r.fulln.length, 0, '満室の一行も0');
  eq(r.props.length, 1, '一覧は、これまでどおり1棟だけ');
  ok(r.body.indexOf('マーベラスＡ棟') >= 0, '出ている棟はそのまま');

  console.log('\n⑧ unitsBy が無いとき（PIVOT2 が古い）');
  which = 'nounits'; await openStatus();
  r = await read();
  eq(r.full.length, 0, '★満室は出さない');
  eq(r.props.length, 1, 'これまでどおりの画面');
  ok(r.body.indexOf('101号室') >= 0, '解約予定はちゃんと出る');

  console.log('\n⑨ JavaScript の誤り');
  ok(errs.length === 0, 'ページの誤りが 0 件' +
     (errs.length ? '（' + errs.join(' / ') + '）' : ''));

  await b.close();
  console.log('\nPASS=' + pass + '  FAIL=' + fail);
  process.exit(fail ? 1 : 0);
})();
