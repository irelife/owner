/* 税理士へ送信の検査。
 *   ・年の取り出しと並び（acYearOf／acYears／acOfYear）
 *   ・税理士事務所へお渡しする明細データ（acCsv）
 *   ・件名と本文（acMail）
 *   ・メールソフトを開く文字（acMailto）
 *
 * ★この検査は js/app.js の2つの塊をつないで読み込みます。
 *   税理士の塊が、送金明細の塊にある ppNo / ppSort を使うためです。
 *
 * 使いかた：  node tests/tacc.cjs
 */
const fs   = require('fs');
const path = require('path');
const DIR  = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const src  = fs.readFileSync(path.join(DIR, 'js/app.js'), 'utf8');

function slice(head, tail) {
  const a = src.indexOf(head), b = src.indexOf(tail);
  return (a < 0 || b < 0 || b < a) ? null : src.slice(a, b);
}
const pp = slice(
  '  /* ===== 検査できる道具（tests/tpp.cjs が読みます）ここから =====',
  '  /* ===== 検査できる道具（送金明細）ここまで ===== */');
const ac = slice(
  '  /* ===== 検査できる道具（tests/tacc.cjs が読みます）ここから =====',
  '  /* ===== 検査できる道具（税理士へ送信）ここまで ===== */');
if (!pp || !ac) {
  console.log('❌ 検査できる道具が見つかりません（js/app.js の目印を消していませんか）');
  console.log('PASS=0 FAIL=1');
  process.exit(1);
}
const box = new Function(
  pp + ac +
  '; return { acYearOf, acYears, acOfYear, acCsv, acMail, acMailto };'
)();

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); }
                       else    { fail++; console.log('  ❌ ' + m); } };
const eq = (got, want, m) => ok(got === want, m + '（' + JSON.stringify(got) + '）');

const ITEMS = [
  { id:'p9', ym:'2026年9月', sokinDate:'2026年10月15日', total:1284000,
    rows:[{ label:'カルムコート東棟', amount:820000 },
          { label:'原状回復（207号室）', amount:-86400 }] },
  { id:'p8', ym:'2026年8月', sokinDate:'2026年9月15日', total:1180000,
    rows:[{ label:'カルムコート東棟', amount:780000 }] },
  { id:'p12', ym:'2025年12月', sokinDate:'2026年1月15日', total:1100000,
    rows:[{ label:'カルムコート東棟', amount:760000 }] }
];

console.log('\n── 年を取り出す（acYearOf）──');
eq(box.acYearOf('2026年9月'), '2026', 'ふつうの月');
eq(box.acYearOf('2026年1月'), '2026', '1月');
eq(box.acYearOf('2025年12月'), '2025', '12月');
eq(box.acYearOf('２０２６年９月'), '2026', '★全角でも読める');
eq(box.acYearOf(''), '', '空は空');
eq(box.acYearOf('調整中'), '', '★読めないものは空（推測しない）');

console.log('\n── 年の一覧（acYears）──');
eq(box.acYears(ITEMS).join('／'), '2026／2025', '★新しい年から順に');
eq(box.acYears([{ ym:'2026年9月' }, { ym:'2026年8月' }]).join('／'), '2026',
   '同じ年は1つだけ');
eq(box.acYears([{ ym:'調整中' }, { ym:'2026年9月' }]).join('／'), '2026',
   '★読めない月は入れない');
eq(box.acYears([]).length, 0, '1件も無ければ0');
eq(box.acYears(null).length, 0, '何も来なくても落ちない');

console.log('\n── その年のものを、1月から順に（acOfYear）──');
eq(box.acOfYear(ITEMS, '2026').map(x => x.ym).join('／'), '2026年8月／2026年9月',
   '★1月から順（送金明細の画面とは逆向き）');
eq(box.acOfYear(ITEMS, '2025').map(x => x.ym).join('／'), '2025年12月', '別の年');
eq(box.acOfYear(ITEMS, '2024').length, 0, '無い年は0');
{
  const before = JSON.stringify(ITEMS);
  box.acOfYear(ITEMS, '2026');
  eq(JSON.stringify(ITEMS), before, '★元の一覧を書き替えない');
}

console.log('\n── 税理士事務所へお渡しする明細データ（acCsv）──');
{
  const l = box.acCsv([ITEMS[1]]).split('\r\n');
  eq(l[0], '対象月,送金日,区分,項目,金額', '★1行目は5列（区分を入れています）');
  eq(l[1], '"2026年8月","2026年9月15日","内訳","カルムコート東棟",780000',
     '内訳の行');
  eq(l[2], '"2026年8月","2026年9月15日","ご送金額","",1180000', 'ご送金額の行');
  eq(l.length, 3, '★1か月だけなら、いちばん下の合計は付けない');
}
{
  const l = box.acCsv(box.acOfYear(ITEMS, '2026')).split('\r\n');
  eq(l[1], '"2026年8月","2026年9月15日","内訳","カルムコート東棟",780000',
     '★1月から順に並ぶ');
  eq(l[l.length - 1], '"","","合計","",2464000',
     '★2か月ぶん以上のときは、いちばん下に合計（対象月は空）');
  const naka = l.filter(x => x.indexOf('"内訳"') >= 0).length;
  eq(naka, 3, '内訳の行は3本（8月1本・9月2本）');
}
{
  const l = box.acCsv([{ ym:'2026年8月', sokinDate:'', total:null,
    rows:[{ label:'かぎ"かっこ"', amount:-1 }, { label:'カンマ,入り', amount:2 }] }])
    .split('\r\n');
  eq(l[1], '"2026年8月","","内訳","かぎ""かっこ""",-1',
     '★引用符は2つにして escape する／マイナスは負の数のまま');
  eq(l[2], '"2026年8月","","内訳","カンマ,入り",2', '★カンマで列が割れない');
  eq(l.length, 3, '★ご送金額が空なら、その行は出さない');
}
eq(box.acCsv([]), '対象月,送金日,区分,項目,金額', '1件も無ければ見出しだけ');
eq(box.acCsv(null), '対象月,送金日,区分,項目,金額', '何も来なくても落ちない');
ok(box.acCsv([ITEMS[1]]).indexOf('﻿') < 0,
   'BOM は付けない（保存するところで付けます）');

console.log('\n── 件名と本文（acMail）──');
{
  const m = box.acMail({ firm:'○○税理士事務所', name:'山田 太郎' },
                       '2026年8月', 'IREライフ株式会社', true);
  eq(m.subject, '【IREライフ株式会社】2026年8月 送金明細のご送付', '件名');
  ok(m.body.indexOf('○○税理士事務所') === 0, '★1行目が事務所名');
  ok(m.body.indexOf('山田 太郎 先生') > 0, '★先生のお名前に「先生」を付ける');
  ok(m.body.indexOf('2026年8月の送金明細') > 0, '対象が本文に入る');
}
{
  const m = box.acMail({}, '2026年分（1月〜12月）', 'IREライフ株式会社', false);
  ok(m.body.indexOf('税理士事務所') === 0, '★事務所名が空でも、宛名が崩れない');
  ok(m.body.indexOf('ご担当者様') > 0, '★お名前が空なら「ご担当者様」');
  /* ★1年ぶんは12か月を1つのPDFにまとめられないので、
       本文に「PDFを添付」と書いてはいけません。 */
  ok(m.body.indexOf('明細書（PDF）') < 0,
     '★PDFを付けられないときは、本文に「PDF」と書かない');
  ok(m.body.indexOf('明細データ（CSV）を添付') > 0, '★そのときは「表（CSV）」だけ');
}
{
  const m = box.acMail({}, '2026年8月', 'IREライフ株式会社', true);
  /* ★当社から送信する道（taxsend）で付くのは、明細書（PDF）だけです。
       CSV は付きません。本文に「CSVも添付」と書いてはいけません。 */
  ok(m.body.indexOf('明細書（PDF）を添付') > 0,
     '★PDFを付けられるときは、明細書（PDF）と書く');
  ok(m.body.indexOf('明細データ（CSV）と明細書（PDF）') < 0,
     '★実際には付かない CSV を、本文に書かない');
}
{
  const m = box.acMail(null, '2026年8月', null);
  ok(m.subject.indexOf('【当社】') === 0, '★会社名が無くても落ちない');
}

console.log('\n── メールソフトを開く文字（acMailto）──');
{
  const u = box.acMailto('tax@example.co.jp', '件名', 'あ\nい');
  ok(u.indexOf('mailto:tax@example.co.jp?') === 0, '★宛先の @ は、そのまま残す');
  ok(u.indexOf('subject=') > 0, '件名が入る');
  ok(u.indexOf('%0D%0A') > 0,
     '★改行は %0D%0A（%0A だけでは改行されないメールソフトがあります）');
  ok(u.indexOf('%0A') > 0 && u.indexOf('\n') < 0, '生の改行は入れない');
}
eq(box.acMailto('', '件', '本').indexOf('mailto:?'), 0, '宛先が空でも落ちない');

console.log('\nPASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
