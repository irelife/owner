/* 送金明細の検査。
 *   ・月で並べ替える（ppNo／ppSort）
 *   ・CSV の中身（csvOf）
 *
 * いただいた React（base44）版 Papers.jsx から取り込んだ仕様を、
 * 1件ずつ突き合わせています。
 *
 * 使いかた：  node tests/tpp.cjs
 */
const fs   = require('fs');
const path = require('path');
const DIR  = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const src  = fs.readFileSync(path.join(DIR, 'js/app.js'), 'utf8');

const HEAD = '  /* ===== 検査できる道具（tests/tpp.cjs が読みます）ここから =====';
const TAIL = '  /* ===== 検査できる道具（送金明細）ここまで ===== */';
const a = src.indexOf(HEAD);
const b = src.indexOf(TAIL);
if (a < 0 || b < 0 || b < a) {
  console.log('❌ 検査できる道具が見つかりません（js/app.js の目印を消していませんか）');
  console.log('PASS=0 FAIL=1');
  process.exit(1);
}
const box = new Function(src.slice(a, b) + '; return { ppNo, ppSort, csvOf, ppShort };')();

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); }
                       else    { fail++; console.log('  ❌ ' + m); } };
const eq = (got, want, m) => ok(got === want, m + '（' + JSON.stringify(got) + '）');

console.log('\n── 月を数に直す（ppNo）──');
eq(box.ppNo('2026年8月'),   202608, 'ふつうの月');
eq(box.ppNo('2026年12月'),  202612, '12月');
eq(box.ppNo('2026年 8 月'), 202608, '空白が入っていても読める');
eq(box.ppNo('２０２６年８月'), 202608, '★全角でも読める');
eq(box.ppNo('2026年8月分'),  202608, '「分」が付いていても読める');
eq(box.ppNo('2026年8月・2026年9月'), 202608,
   '★2か月ぶんがまとまっているときは、先の月で見る');
eq(box.ppNo('2026-08'),     202608, '2026-08 も読める');
eq(box.ppNo(''),            null,   '空は読まない');
eq(box.ppNo(null),          null,   '何も無くても落ちない');
eq(box.ppNo('8月'),         null,   '★年が無いものは、推測しない');
eq(box.ppNo('2026年13月'),  null,   'ありえない月は読まない');
eq(box.ppNo('1800年8月'),   null,   '遠すぎる年は読まない');
eq(box.ppNo('1234-5678'),   null,   '★証券番号のような文字を、月と間違えない');
ok(box.ppNo('2026年12月') > box.ppNo('2026年8月'), '12月は8月より大きい');
ok(box.ppNo('2027年1月')  > box.ppNo('2026年12月'), '年をまたいでも大小が合う');

console.log('\n── 新しい月から順に（ppSort）──');
{
  const L = [{ ym:'2026年7月' }, { ym:'2026年9月' }, { ym:'2026年8月' }];
  eq(box.ppSort(L).map(x => x.ym).join('／'), '2026年9月／2026年8月／2026年7月',
     '★新しい月が先に来る');
  eq(L.map(x => x.ym).join('／'), '2026年7月／2026年9月／2026年8月',
     '★元の一覧を書き替えない');
}
{
  const L = [{ ym:'2026年12月' }, { ym:'2027年1月' }];
  eq(box.ppSort(L).map(x => x.ym).join('／'), '2027年1月／2026年12月',
     '年をまたいでも正しく並ぶ');
}
{
  /* ★React 版は読めない月を 0 にしていたため、読めないものが2つ以上あると
       並びが不定になり、いちばん大きなカードに違う月が出る恐れがあった。
       こちらは「1つでも読めなければ並べ替えない」ことで、
       サーバーが返した順のままにする。 */
  const L = [{ ym:'2026年7月' }, { ym:'調整中' }, { ym:'2026年9月' }];
  eq(box.ppSort(L).map(x => x.ym).join('／'), '2026年7月／調整中／2026年9月',
     '★読めない月が1つでもあれば、並べ替えない（勝手に動かさない）');
}
eq(box.ppSort([]).length,   0, '1件も無くても落ちない');
eq(box.ppSort(null).length, 0, '一覧が来なくても落ちない');

console.log('\n── CSV の中身（csvOf）──');
{
  const IT = {
    ym: '2026年8月', sokinDate: '2026年9月25日', total: 1284000,
    rows: [{ label:'カルムコート東棟', amount:820000 },
           { label:'グロリオサ',       amount:550400 },
           { label:'原状回復（207号室）', amount:-86400 }]
  };
  const lines = box.csvOf(IT).split('\r\n');

  eq(lines[0], '対象月,送金日,項目,金額',
     '★1行目は4列（React 版から取り込んだところ）');
  eq(lines[1], '"2026年8月","2026年9月25日","カルムコート東棟",820000',
     '★どの行にも対象月と送金日が入る');
  eq(lines[3], '"2026年8月","2026年9月25日","原状回復（207号室）",-86400',
     '★マイナスは −ではなく、負の数のまま入れる（表計算で足せるように）');
  eq(lines[4], '"","","ご送金額",1284000',
     '★合計の行は、対象月・送金日を空にする（月で絞ったとき二重に足さないため）');
  eq(lines.length, 5, '行数は 見出し1＋内わけ3＋合計1');
  ok(box.csvOf(IT).indexOf('\r\n') > 0, '改行は CRLF（Excel のため）');
  ok(box.csvOf(IT).indexOf('﻿') < 0,
     'BOM は、ここでは付けない（保存するところで付ける）');
}
{
  const s2 = box.csvOf({ ym:'2026年8月', sokinDate:'', total:100,
    rows:[{ label:'かぎ"かっこ"入り', amount:1 },
          { label:'カンマ,入り',      amount:2 }] });
  const l = s2.split('\r\n');
  eq(l[1], '"2026年8月","","かぎ""かっこ""入り",1', '★引用符は2つにして escape する');
  eq(l[2], '"2026年8月","","カンマ,入り",2',        '★カンマが入っていても列が割れない');
}
eq(box.csvOf({ ym:'2026年8月', rows:[], total:null }), '対象月,送金日,項目,金額',
   '★内わけも合計も無ければ、見出しだけ（0円と書かない）');
eq(box.csvOf({ ym:'2026年8月', rows:[{ label:'家賃', amount:null }], total:0 }),
   '対象月,送金日,項目,金額\r\n"2026年8月","","家賃",0\r\n"","","ご送金額",0',
   '★金額が空なら 0。合計が 0 のときは、0 として出す（行を消さない）');
eq(box.csvOf(null), '', '明細が無ければ空');

console.log('\n── 送金日を短くする（ppShort）──');
eq(box.ppShort('2026年8月15日'),   '8月15日', '年を外す');
eq(box.ppShort('2026年12月5日'),   '12月5日', '2けたの月');
eq(box.ppShort('2026 年 8 月 15 日'), '8月15日', '空白が入っていても読める');
eq(box.ppShort('２０２６年８月１５日'), '8月15日', '★全角でも読める');
eq(box.ppShort('2026/09/25'),      '9/25',    'スラッシュの形も短くする');
eq(box.ppShort('2026-09-25'),      '9/25',    'ハイフンの形も短くする');
eq(box.ppShort('9月25日'),         '9月25日', '★もう年が無いものは、触らない');
eq(box.ppShort('未定'),            '未定',    '★読めない形は、そのまま出す（作り替えない）');
eq(box.ppShort('2026年8月'),       '2026年8月',
   '★日が無いものは、そのまま出す（勝手に日を足さない）');
eq(box.ppShort(''),                '',        '空は空');
eq(box.ppShort(null),              '',        '無いものは空');
eq(box.ppShort('2026年8月15日 予定'), '2026年8月15日 予定',
   '★ことばが付いているものは、削らない（意味が消えるため）');

console.log('\nPASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
