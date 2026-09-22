/* 火災保険の検査。
 *   ・物件名のそろえかた（insNorm）
 *   ・満期日の読み解き（insDue／insDays／insYmd）
 *   ・連絡先から電話番号を取り出す（insTel）
 *   ・1物件＝1つの箱にまとめる（insGroup／insRank）
 *
 * 使いかた：  node tests/tins.cjs
 */
const fs   = require('fs');
const path = require('path');
const DIR  = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const src  = fs.readFileSync(path.join(DIR, 'js/app.js'), 'utf8');

const HEAD = '  /* ===== 検査できる道具（tests/tins.cjs が読みます）ここから =====';
const TAIL = '  /* ===== 検査できる道具（火災保険）ここまで ===== */';
const a = src.indexOf(HEAD);
const b = src.indexOf(TAIL);
if (a < 0 || b < 0 || b < a) {
  console.log('❌ 検査できる道具が見つかりません（js/app.js の目印を消していませんか）');
  console.log('PASS=0 FAIL=1');
  process.exit(1);
}
const box = new Function(
  src.slice(a, b) +
  '; return { insNorm, insDayNo, insDue, insDays, insYmd, insTel, insGroup, insRank };'
)();

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); }
                       else    { fail++; console.log('  ❌ ' + m); } };
const eq = (got, want, m) => ok(got === want, m + '（' + JSON.stringify(got) + '）');

/* 検査の「今日」は 2026年9月22日に固定します。
   本当の今日を使うと、明日になった途端に検査が落ちるためです。 */
const TODAY = new Date(2026, 8, 22);

console.log('\n── 物件名をそろえる（insNorm）──');
eq(box.insNorm('カルムコート東棟'),   'カルムコート東棟', 'そのままのものは、そのまま');
eq(box.insNorm('カルムコート 東棟'),  'カルムコート東棟', '★半角の空白を取る');
eq(box.insNorm('カルムコート　東棟'), 'カルムコート東棟', '★全角の空白も取る');
eq(box.insNorm('ｶﾙﾑｺｰﾄ東棟'),        'カルムコート東棟', '★半角カナも同じと見る');
eq(box.insNorm('ＡＢＣ'),             'abc',              '★全角英字は半角の小文字に');
eq(box.insNorm('abc'),                'abc',              '大文字小文字は区別しない');
eq(box.insNorm(''),                   '',                 '空はそのまま空');
eq(box.insNorm(null),                 '',                 '何も無くても落ちない');
ok(box.insNorm('カルムコート東棟') !== box.insNorm('カルムコート西棟'),
   '東棟と西棟は、別の物件として見る');

console.log('\n── 満期日を読む（insDue）──');
const d1 = box.insDue('2028-03-31');
ok(d1 && d1.y === 2028 && d1.m === 3 && d1.d === 31, '2028-03-31 を読める');
const d2 = box.insDue('2028年3月31日');
ok(d2 && d2.y === 2028 && d2.m === 3 && d2.d === 31, '★2028年3月31日（前の書きかた）も読める');
const d3 = box.insDue('2028/3/31');
ok(d3 && d3.y === 2028 && d3.m === 3 && d3.d === 31, '2028/3/31 も読める');
const d4 = box.insDue('20280331');
ok(d4 && d4.y === 2028 && d4.m === 3 && d4.d === 31, '20280331 も読める');
const d5 = box.insDue('2028年2月');
ok(d5 && d5.y === 2028 && d5.m === 2 && d5.d === 0, '日が無いときは、日を 0 にする');
eq(box.insDue('2028年2月').n, box.insDue('2028-02-29').n,
   '★日が無いときは、その月の末日として扱う（2028年はうるう年）');
eq(box.insDue('2028-02-30'), null, '★ありえない日（2月30日）は読まない');
eq(box.insDue('2028-13-01'), null, '★ありえない月（13月）は読まない');
eq(box.insDue('1800-01-01'), null, '遠すぎる年は読まない');
eq(box.insDue(''),           null, '空は読まない');
eq(box.insDue(null),         null, '何も無くても落ちない');
eq(box.insDue('来年の3月'),  null, '★年が書いていないものは、推測しない');
eq(box.insDue('令和10年3月31日'), null, '★元号は読まない（推測しない）');
eq(box.insDue('1234-5678'),  null, '★証券番号のような文字を、日付と間違えない');

console.log('\n── 満期まであと何日か（insDays）──');
eq(box.insDays('2026-09-22', TODAY),   0,    '当日は 0 日');
eq(box.insDays('2026-09-23', TODAY),   1,    '翌日は 1 日');
eq(box.insDays('2026-12-21', TODAY),  90,    '90日後は 90');
eq(box.insDays('2026-12-22', TODAY),  91,    '91日後は 91');
eq(box.insDays('2026-09-21', TODAY),  -1,    '★過ぎていれば負の数');
eq(box.insDays('2028-03-31', TODAY), 556,    'ずっと先でも数えられる');
eq(box.insDays('', TODAY),           null,   '読めないものは null');

console.log('\n── 満期の近さを分ける（insRank）──');
eq(box.insRank(null), 'none', '満期が分からない → none');
eq(box.insRank(-1),   'over', '過ぎている → over');
eq(box.insRank(0),    'soon', '本日が満期 → soon');
eq(box.insRank(90),   'soon', '90日以内 → soon');
eq(box.insRank(91),   'ok',   '91日より先 → ok');

console.log('\n── お読みいただく形（insYmd）──');
eq(box.insYmd('2028-03-31'), '2028年3月31日', '日付を日本語にする');
eq(box.insYmd('2028年3月31日'), '2028年3月31日', '前の書きかたも同じ形に');
eq(box.insYmd('2028-03'),    '2028年3月末日', '日が無ければ「末日」と出す');
eq(box.insYmd('満期は代理店に確認中'), '満期は代理店に確認中',
   '★読めないものは、書かれたとおりに出す（消さない）');
eq(box.insYmd(''),           '',            '空は空');

console.log('\n── 連絡先から電話番号（insTel）──');
eq(box.insTel('0120-000-000'), '0120000000', 'ふつうの番号');
eq(box.insTel('0120-000-000／代理店 ○○（担当 △△）'), '0120000000',
   '★うしろに文字が続いていても取り出せる');
eq(box.insTel('084-000-0000'),   '0840000000',  '市外局番から');
eq(box.insTel('090-1234-5678'),  '09012345678', '携帯（11桁）');
eq(box.insTel('０９０－１２３４－５６７８'), '09012345678', '★全角でも取り出せる');
eq(box.insTel('代理店 ○○（担当 △△）'), '', '★番号が無ければ空（押せない電話は出さない）');
eq(box.insTel('03-1234'),        '',  '桁が足りないものは使わない');
eq(box.insTel('1234-5678'),      '',  '0 から始まらないものは使わない');
eq(box.insTel(''),               '',  '空は空');
eq(box.insTel(null),             '',  '何も無くても落ちない');

console.log('\n── 1物件＝1つの箱（insGroup）──');
{
  const L = [
    { id:'1', prop:'カルムコート東棟',  maker:'あ海上', until:'2028-03-31', label:'証券A' },
    { id:'2', prop:'カルムコート 東棟', maker:'い海上', until:'2027-01-10', label:'証券B' },
    { id:'3', prop:'グロリオサ',        maker:'う海上', until:'',           label:'証券C' },
    { id:'4', prop:'',                  maker:'',       until:'',           label:'証券D' }
  ];
  const g = box.insGroup(L, TODAY);

  eq(g.length, 3, '★4件の証券が、3つの箱になる（東棟の2件が1つに）');
  eq(g[0].name, 'カルムコート東棟', '満期のいちばん近い箱が、上に来る');
  eq(g[0].items.length, 2, '★空白の入った物件名も、同じ箱に入る');
  eq(g[0].maker, 'い海上', '★保険会社は、いちばん後に預けたものを出す');
  eq(g[0].until, '2027-01-10', '★箱の満期は、その箱の中でいちばん近いもの');
  eq(g[0].days, 110, '満期まで110日');
  eq(g[1].name, 'グロリオサ', '満期の分からない箱は、そのあと');
  eq(g[1].days, null, '満期が分からなければ null');
  eq(g[2].name, '', '★物件名の無い箱は、いちばん下');
  eq(g[2].items.length, 1, '物件名の無い証券も、消えずに残る');

  const total = g.reduce((n, x) => n + x.items.length, 0);
  eq(total, L.length, '★どの証券も、箱に入れ忘れていない');
}
{
  const g = box.insGroup([
    { id:'1', prop:'先の物件',   until:'2027-06-30' },
    { id:'2', prop:'近い物件',   until:'2026-10-22' },
    { id:'3', prop:'過ぎた物件', until:'2026-08-31' }
  ], TODAY);
  eq(g.map(x => x.name).join('／'), '過ぎた物件／近い物件／先の物件',
     '★過ぎたもの → 近いもの → 先のもの の順に並ぶ');
  eq(box.insRank(g[0].days), 'over', '過ぎた物件は over');
  eq(box.insRank(g[1].days), 'soon', '30日後の物件は soon');
  eq(box.insRank(g[2].days), 'ok',   '先の物件は ok');
}
{
  const g = box.insGroup([
    { id:'1', prop:'いろは荷', until:'' },
    { id:'2', prop:'あさひ荘', until:'' }
  ], TODAY);
  eq(g.map(x => x.name).join('／'), 'あさひ荘／いろは荷',
     '満期がどちらも分からないときは、名前の順');
}
eq(box.insGroup([], TODAY).length, 0, '1件も無ければ、箱も0');
eq(box.insGroup(null, TODAY).length, 0, '一覧が来なくても落ちない');
{
  const L = [{ id:'1', prop:'カルムコート東棟', until:'2028-03-31' }];
  const before = JSON.stringify(L);
  box.insGroup(L, TODAY);
  eq(JSON.stringify(L), before, '★元の一覧を書き替えない');
}

console.log('\nPASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
