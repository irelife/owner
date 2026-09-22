/* 入居状況の検査。
 *   ・物件名と部屋に分ける（stSplit）
 *   ・号室の並び（stRoomNo）
 *   ・解約予定日が過ぎたら募集中にする（stPast／stGroup）★2026/9/22 決定
 *   ・物件ごとのまとめと並び（stGroup）
 *   ・まとめの一行（stSum）
 *
 * ★この検査は js/app.js の2つの塊をつないで読み込みます。
 *   入居状況の塊が、火災保険の塊にある insDue / insDays を使うためです。
 *
 * 使いかた：  node tests/tst.cjs
 */
const fs   = require('fs');
const path = require('path');
const DIR  = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const src  = fs.readFileSync(path.join(DIR, 'js/app.js'), 'utf8');

function slice(headMark, tailMark) {
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
if (!ins || !st) {
  console.log('❌ 検査できる道具が見つかりません（js/app.js の目印を消していませんか）');
  console.log('PASS=0 FAIL=1');
  process.exit(1);
}
const box = new Function(
  ins + st +
  '; return { stSplit, stRoomNo, stDueOf, stPast, stGroup, stSum, insYmd };'
)();

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); }
                       else    { fail++; console.log('  ❌ ' + m); } };
const eq = (got, want, m) => ok(got === want, m + '（' + JSON.stringify(got) + '）');

/* 検査の「今日」は 2026年9月22日に固定します */
const TODAY = new Date(2026, 8, 22);

console.log('\n── 物件名と部屋に分ける（stSplit）──');
{
  const a = box.stSplit({ prop: 'カルムコート東棟', room: '201号室' });
  eq(a.prop, 'カルムコート東棟', '★prop/room があればそれを使う');
  eq(a.room, '201号室', '部屋もそのまま');
}
{
  const a = box.stSplit({ place: 'カルムコート東棟 201号室' });
  eq(a.prop, 'カルムコート東棟', '★place を分けられる');
  eq(a.room, '201号室', '号室を取り出せる');
}
{
  const a = box.stSplit({ place: 'カルムコート東棟201号室' });
  eq(a.prop, 'カルムコート東棟', '★空白が無くても分けられる');
  eq(a.room, '201号室', '同上');
}
{
  const a = box.stSplit({ place: 'マーベラス B101号室' });
  eq(a.prop, 'マーベラス', '英字の入った号室');
  eq(a.room, 'B101号室', '同上');
}
{
  const a = box.stSplit({ place: 'グロリオサ 東棟' });
  eq(a.prop, 'グロリオサ 東棟', '★「号室」が無ければ、全部を物件名にする');
  eq(a.room, '', '★推測で部屋番号を作らない（「東棟」を部屋にしない）');
}
{
  const a = box.stSplit({ place: 'グロリオサ' });
  eq(a.prop, 'グロリオサ', '物件名だけでも落ちない');
  eq(a.room, '', '部屋は空');
}
eq(box.stSplit({}).prop, '', '何も無くても落ちない');
eq(box.stSplit(null).prop, '', 'null でも落ちない');
{
  const a = box.stSplit({ prop: 'カルムコート東棟' });
  eq(a.room, '', 'prop だけで room が無くても落ちない');
}

console.log('\n── 号室の並び（stRoomNo）──');
ok(box.stRoomNo('2号室') < box.stRoomNo('10号室'), '★2号室 は 10号室 より前');
ok(box.stRoomNo('２０１号室') === 201, '★全角の号室も数として読む');
ok(box.stRoomNo('B101号室') === 101, '英字が付いていても数を取る');
ok(box.stRoomNo('') === Number.POSITIVE_INFINITY, '数が無ければ、いちばん後ろ');

console.log('\n── 解約予定日が過ぎたら募集中（★2026/9/22 決定）──');
eq(box.stDueOf({ tag: '2026年10月31日' }), '2026年10月31日', 'tag から日付を読む');
eq(box.stDueOf({ tag: '解約予定', detail: '2026/10/31 解約予定です。' }),
   '2026/10/31 解約予定です。', '★tag が読めなければ detail から読む');
eq(box.stDueOf({ tag: '解約予定', detail: '担当までご連絡ください' }), '',
   '★どこにも日付が無ければ空（推測しない）');
eq(box.stPast({ tag: '2026年8月31日' }, TODAY), true, '★過ぎている');
eq(box.stPast({ tag: '2026年9月22日' }, TODAY), false, '当日は、過ぎていない');
eq(box.stPast({ tag: '2026年10月31日' }, TODAY), false, 'まだ先');
eq(box.stPast({ tag: '解約予定' }, TODAY), false,
   '★日付が読めないときは動かさない（解約予定のまま）');
eq(box.stPast(null, TODAY), false, '何も無くても落ちない');

{
  const r = {
    newc:  [],
    yotei: [{ place: 'グロリオサ 305号室', tag: '2026年8月31日' },
            { place: 'グロリオサ 402号室', tag: '2026年10月31日' },
            { place: 'グロリオサ 501号室', tag: '解約予定' }],
    boshu: []
  };
  const g = box.stGroup(r, TODAY);
  eq(g.length, 1, '1物件にまとまる');
  const k = g[0].rooms.map(u => u.room + ':' + u.kind).join('／');
  eq(k, '305号室:募集中／402号室:解約予定／501号室:解約予定',
     '★過ぎた305号室だけが募集中になり、上に来る');
  eq(g[0].rooms[0].moved, true, '★入れ替えた印が付く');
  eq(g[0].rooms[0].movedDate, '2026年8月31日', '★元の解約予定日を覚えている');
  eq(g[0].rooms[1].moved, false, 'まだ先のものは、そのまま');
  eq(g[0].rooms[2].moved, false, '日付が読めないものも、そのまま');
}

console.log('\n── 物件ごとのまとめと並び（stGroup）──');
{
  const r = {
    newc:  [{ place: 'あさひ荘 102号室', tag: '新規' }],
    yotei: [{ place: 'カルムコート東棟 305号室', tag: '2026年10月31日' }],
    boshu: [{ place: 'カルムコート東棟 201号室' },
            { place: 'カルムコート東棟 10号室' },
            { place: 'カルムコート東棟 2号室' }]
  };
  const g = box.stGroup(r, TODAY);
  eq(g.map(x => x.name).join('／'), 'あさひ荘／カルムコート東棟',
     '★物件は名前順に並ぶ');
  eq(g[1].rooms.map(u => u.room).join('／'),
     '2号室／10号室／201号室／305号室',
     '★募集中が先、そのなかは号室の数の順（10号室が201号室より前）');
  eq(g[1].rooms[3].kind, '解約予定', 'いちばん後ろが解約予定');
  const total = g.reduce((n, x) => n + x.rooms.length, 0);
  eq(total, 5, '★どの部屋も落としていない');
}
{
  const g = box.stGroup({
    boshu: [{ place: 'グロリオサ 201号室' }, { place: '' }]
  }, TODAY);
  eq(g[g.length - 1].name, '', '★物件名の無い箱は、いちばん下');
  eq(g.length, 2, '名無しも箱になる（消さない）');
}
eq(box.stGroup({}, TODAY).length, 0, '3つとも無ければ、箱も0');
eq(box.stGroup(null, TODAY).length, 0, '何も来なくても落ちない');
{
  const r = { boshu: [{ place: 'グロリオサ 201号室' }] };
  const before = JSON.stringify(r);
  box.stGroup(r, TODAY);
  eq(JSON.stringify(r), before, '★元のデータを書き替えない');
}

console.log('\n── まとめの一行（stSum）──');
{
  const g = box.stGroup({
    newc:  [{ place: 'A荘 101号室' }],
    yotei: [{ place: 'A荘 102号室', tag: '2026年10月31日' }],
    boshu: [{ place: 'A荘 103号室' }, { place: 'B荘 201号室' }]
  }, TODAY);
  eq(box.stSum(g), '募集中 2室　／　解約予定 1室　／　新規契約 1室',
     '★募集中から順に、室数を出す');
}
eq(box.stSum(box.stGroup({}, TODAY)), '', '0件なら空（あとで「ございません」を出す）');
eq(box.stSum(null), '', '何も来なくても落ちない');
{
  const g = box.stGroup({ boshu: [{ place: 'A荘 101号室' }] }, TODAY);
  eq(box.stSum(g), '募集中 1室', '★0件の区分は出さない');
}

console.log('\nPASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
