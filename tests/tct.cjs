/* お問い合わせの「返事の数」の検査。
 *   ・ctNew  … 返事が来ていて、まだ見ていないものの数
 *   ・ctSeen … いま見た状態（やりとりの本数）
 *
 * 使いかた：  node tests/tct.cjs
 */
const fs   = require('fs');
const path = require('path');
const DIR  = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const src  = fs.readFileSync(path.join(DIR, 'js/app.js'), 'utf8');

function slice(head, tail) {
  const a = src.indexOf(head), b = src.indexOf(tail);
  return (a < 0 || b < 0 || b < a) ? null : src.slice(a, b);
}
const ct = slice(
  '  /* ===== 検査できる道具（お問い合わせの数）ここから ===== */',
  '  /* ===== 検査できる道具（お問い合わせの数）ここまで ===== */');
if (!ct) {
  console.log('❌ 検査できる道具が見つかりません（js/app.js の目印を消していませんか）');
  console.log('PASS=0 FAIL=1');
  process.exit(1);
}
const box = new Function(ct + '; return { ctNew, ctSeen };')();

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); }
                       else    { fail++; console.log('  ❌ ' + m); } };
const eq = (got, want, m) => ok(got === want, m + '（' + JSON.stringify(got) + '）');

const own = (b) => ({ who:'オーナー', body:b });
const ire = (b) => ({ who:'当社',     body:b });

const A = { id:'C1', msgs:[own('教えてください'), ire('こちらです')] };
const B = { id:'C2', msgs:[own('お願いします')] };
const C = { id:'C3', msgs:[own('質問'), ire('回答1'), own('追加'), ire('回答2')] };

console.log('\n── 返事の数（ctNew）──');
eq(box.ctNew([A], {}), 1, '★当社の返事が来ていて、まだ見ていない → 1');
eq(box.ctNew([B], {}), 0, '★自分が送っただけ（返事待ち）→ 0');
eq(box.ctNew([A, B, C], {}), 2, '★返事が来ているのは A と C の2件');
eq(box.ctNew([A], { C1:2 }), 0, '★もう見ている（本数が同じ）→ 0');
eq(box.ctNew([A], { C1:1 }), 1, '★前は1本まで見た。2本目が来ている → 1');
eq(box.ctNew([A], { C1:5 }), 0, '★覚えている数のほうが多くても、増やさない');
eq(box.ctNew([C], { C3:3 }), 1, '★4本目の回答が来ている → 1');
eq(box.ctNew([C], { C3:4 }), 0, 'ぜんぶ見ている → 0');

console.log('\n── こわれたものが来ても落ちない ──');
eq(box.ctNew([], {}), 0, '1件も無ければ0');
eq(box.ctNew(null, null), 0, '何も来なくても落ちない');
eq(box.ctNew([{ id:'C9' }], {}), 0, '★やりとりが無いものは数えない');
eq(box.ctNew([{ id:'C9', msgs:[] }], {}), 0, 'やりとりが空でも数えない');
eq(box.ctNew([{ msgs:[ire('回答')] }], {}), 0, '★番号が無いものは数えない（取り違え防止）');
eq(box.ctNew([{ id:'C9', msgs:[{ body:'差出なし' }] }], {}), 1,
   '差出が空なら当社あつかい（オーナーの発言でないので返事と見る）');
eq(box.ctNew([A], { C1:'こわれた値' }), 1, '★覚えている値が数でなければ、0として見る');
eq(box.ctNew([A], { C1:-3 }), 1, '★マイナスでも、0として見る');
eq(box.ctNew([A, A, A], {}), 3, '同じものが3つ来れば3（重複は取り除かない）');

console.log('\n── 見た状態を作る（ctSeen）──');
eq(JSON.stringify(box.ctSeen([A, B, C])),
   JSON.stringify({ C1:2, C2:1, C3:4 }), '★番号ごとに、やりとりの本数を覚える');
eq(JSON.stringify(box.ctSeen([])), '{}', '1件も無ければ空');
eq(JSON.stringify(box.ctSeen(null)), '{}', '何も来なくても落ちない');
eq(JSON.stringify(box.ctSeen([{ id:'C9' }])), JSON.stringify({ C9:0 }),
   'やりとりが無ければ0本');
eq(JSON.stringify(box.ctSeen([{ msgs:[ire('x')] }])), '{}',
   '★番号が無いものは覚えない');

console.log('\n── ★見たあとは0になるか（通しで） ──');
{
  const list = [A, B, C];
  eq(box.ctNew(list, {}), 2, 'はじめは2件');
  const seen = box.ctSeen(list);
  eq(box.ctNew(list, seen), 0, '★お問い合わせ画面を開いたあとは0件');

  /* そのあと、当社から新しい回答が1件来た */
  const list2 = [A, B,
    { id:'C3', msgs:C.msgs.concat([ire('回答3')]) }];
  eq(box.ctNew(list2, seen), 1, '★新しい回答が来たら、また1件');

  /* オーナー様が返信した（自分の発言なので増えない） */
  const list3 = [A, B,
    { id:'C3', msgs:C.msgs.concat([ire('回答3'), own('承知しました')]) }];
  eq(box.ctNew(list3, seen), 0,
     '★自分が返信したら0件（自分の発言を「返事」と数えない）');
}

console.log('\nPASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
