/* マイアカウントの検査。
 *   ・配色の選びかた（thPick／thName／thOf）
 *   ・全角の直し（myNum）
 *   ・お電話番号・郵便番号・メールアドレスの読み（myTel／myZip／myMail）
 *   ・入力の確かめ（myCheck）
 *   ・お問い合わせへ送る本文（myBody）
 *
 * 使いかた：  node tests/tmy.cjs
 */
const fs   = require('fs');
const path = require('path');
const DIR  = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const src  = fs.readFileSync(path.join(DIR, 'js/app.js'), 'utf8');

function slice(head, tail) {
  const a = src.indexOf(head), b = src.indexOf(tail);
  return (a < 0 || b < 0 || b < a) ? null : src.slice(a, b);
}
const my = slice(
  '  /* ===== 検査できる道具（マイアカウント）ここから ===== */',
  '  /* ===== 検査できる道具（マイアカウント）ここまで ===== */');
if (!my) {
  console.log('❌ 検査できる道具が見つかりません（js/app.js の目印を消していませんか）');
  console.log('PASS=0 FAIL=1');
  process.exit(1);
}
const box = new Function(
  my + '; return { THEMES, thPick, thName, thOf, myNum, myTel, myZip, myMail, myCheck, myBody };'
)();

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); }
                       else    { fail++; console.log('  ❌ ' + m); } };
const eq = (got, want, m) => ok(got === want, m + '（' + JSON.stringify(got) + '）');

console.log('\n── 配色の一覧（THEMES）──');
eq(box.THEMES.length, 3, '3つ');
eq(box.THEMES[0].id, 'wine', '1つめは既定のワイン');
ok(box.THEMES.every(t => /^#[0-9A-F]{6}$/.test(t.bg) && /^#[0-9A-F]{6}$/.test(t.pri)),
   '★どれも色が6桁で入っている（先あての script と対になる値）');
ok(new Set(box.THEMES.map(t => t.id)).size === 3, 'id が重なっていない');

console.log('\n── 配色を選ぶ（thPick）──');
eq(box.thPick('wine'), 'wine', 'ワイン');
eq(box.thPick('midnight'), 'midnight', 'ミッドナイト');
eq(box.thPick('charcoal'), 'charcoal', 'チャコール');
eq(box.thPick(''), 'wine', '★空なら既定のワイン');
eq(box.thPick(null), 'wine', '★何も来なくてもワイン');
eq(box.thPick('sakura'), 'wine', '★一覧に無いものはワイン（当てずっぽうにしない）');
eq(box.thPick(' midnight '), 'midnight', '前後の空白は取る');
eq(box.thPick('MIDNIGHT'), 'wine', '★大文字は別物として扱う（保存した値と厳密に合わせる）');

console.log('\n── 配色の名前（thName）──');
eq(box.thName('midnight'), 'ミッドナイト', '名前が引ける');
eq(box.thName('sakura'), '', '★無いものは空');
eq(box.thOf('sakura').id, 'wine', 'thOf も無いものはワインに戻す');
eq(box.thOf('charcoal').bg, '#23211F', 'チャコールの地の色');

console.log('\n── 全角を直す（myNum）──');
eq(box.myNum('０９０－１２３４－５６７８'), '090-1234-5678', '★全角の数字とハイフン');
eq(box.myNum(' 730-0011 '), '730-0011', '前後の空白');
eq(box.myNum('730　0011'), '7300011', '★全角の空白も取る');
eq(box.myNum(null), '', '何も来なくても空');

console.log('\n── お電話番号（myTel）──');
eq(box.myTel('090-1234-5678'), '090-1234-5678', '携帯');
eq(box.myTel('082-123-4567'), '082-123-4567', '固定（10桁）');
eq(box.myTel('０９０１２３４５６７８'), '09012345678', '★全角・ハイフンなし');
eq(box.myTel('090(1234)5678'), '090-1234-5678', '丸かっこはハイフンに');
eq(box.myTel('090−1234−5678'), '090-1234-5678', '全角マイナスもハイフンに');
eq(box.myTel('03-1234-567'), '', '★9桁は通さない');
eq(box.myTel('090-1234-56789'), '', '★12桁は通さない');
eq(box.myTel('090-1234-567a'), '', '★数字以外が入っていたら通さない');
eq(box.myTel('お昼にお願いします'), '', '★文章は通さない');
eq(box.myTel(''), '', '空は空');

console.log('\n── 郵便番号（myZip）──');
eq(box.myZip('7300011'), '730-0011', '★7桁ならハイフンを入れる');
eq(box.myZip('730-0011'), '730-0011', 'すでにハイフン入り');
eq(box.myZip('〒730-0011'), '730-0011', '★〒は取る');
eq(box.myZip('７３０００１１'), '730-0011', '全角');
eq(box.myZip('73000'), '', '★5桁は通さない（足して作らない）');
eq(box.myZip('73000110'), '', '★8桁は通さない');
eq(box.myZip(''), '', '空は空');

console.log('\n── メールアドレス（myMail）──');
eq(box.myMail('owner@example.jp'), 'owner@example.jp', 'ふつうのもの');
eq(box.myMail(' owner@example.co.jp '), 'owner@example.co.jp', '前後の空白は取る');
eq(box.myMail('ｏｗｎｅｒ@example.jp'), 'owner@example.jp', '★全角も直す');
eq(box.myMail('owner@example'), '', '★点が無いものは通さない');
eq(box.myMail('owner example.jp'), '', '★@が無いものは通さない');
eq(box.myMail('a@b@c.jp'), '', '★@が2つは通さない');
eq(box.myMail('@example.jp'), '', '★手前が無いものは通さない');
eq(box.myMail('a@' + 'x'.repeat(300) + '.jp'), '', '★長すぎるものは通さない');
eq(box.myMail(''), '', '空は空');

console.log('\n── 入力の確かめ（myCheck）──');
eq(box.myCheck({}), '変更をご希望の項目をご入力ください。', '★1つも入っていなければ止める');
eq(box.myCheck(null), '変更をご希望の項目をご入力ください。', '何も来なくても落ちない');
eq(box.myCheck({ mail:'owner@example.jp' }), null, 'メールアドレスだけでも通る');
eq(box.myCheck({ tel:'090-1234-5678' }), null, 'お電話番号だけでも通る');
eq(box.myCheck({ zip:'730-0011' }), null, '郵便番号だけでも通る');
eq(box.myCheck({ addr:'広島市中区基町10-1' }), null, 'ご住所だけでも通る');
eq(box.myCheck({ note:'名前の漢字を直してください' }), null, '補足だけでも通る');
eq(box.myCheck({ mail:'こわれた' }), 'メールアドレスの形をご確認ください。',
   '★読めないメールアドレスは止める');
eq(box.myCheck({ tel:'090-1' }), 'お電話番号は市外局番から、10桁または11桁でご入力ください。',
   '★桁の足りないお電話番号は止める');
eq(box.myCheck({ zip:'730' }), '郵便番号は7桁でご入力ください。', '★桁の足りない郵便番号は止める');
eq(box.myCheck({ note:'あ'.repeat(2001) }),
   '文字数が上限を超えています。2,000文字以内でご入力ください。', '★長すぎる補足は止める');
eq(box.myCheck({ note:'あ'.repeat(2000) }), null, 'ちょうど2000文字は通る');
eq(box.myCheck({ addr:'あ'.repeat(201) }), 'ご住所が長すぎます。200文字以内でご入力ください。',
   '★長すぎるご住所は止める');

console.log('\n── お問い合わせへ送る本文（myBody）──');
{
  const b = box.myBody('old@example.jp', { mail:'new@example.jp' });
  ok(b.indexOf('old@example.jp　→　new@example.jp') >= 0,
     '★メールアドレスは「前 → 後」で書く（当社が見分けられるように）');
  ok(b.indexOf('お電話番号') < 0, '★入っていない項目は書かない');
}
{
  const b = box.myBody('', { mail:'new@example.jp' });
  ok(b.indexOf('（不明）　→　new@example.jp') >= 0,
     '★いまのアドレスが分からないときは「（不明）」（勝手に埋めない）');
}
{
  const b = box.myBody('old@example.jp', {
    tel:'０９０１２３４５６７８', zip:'７３０００１１',
    addr:' 広島市中区基町10-1 ', note:' 平日の日中にお願いします ' });
  ok(b.indexOf('お電話番号： 09012345678') >= 0, '★お電話番号は半角に直して書く');
  ok(b.indexOf('郵便番号： 730-0011') >= 0, '★郵便番号はハイフン入りで書く');
  ok(b.indexOf('ご住所： 広島市中区基町10-1') >= 0, 'ご住所は前後の空白を取る');
  ok(b.indexOf('補足：\n平日の日中にお願いします') >= 0, '補足は見出しを付けて書く');
  ok(b.indexOf('メールアドレス') < 0, '★メールアドレスの行は出さない');
}
eq(box.myBody('a@b.jp', {}), 'ご登録内容の変更をお願いいたします。\n',
   '1つも無ければ、見出しだけ');
ok(box.myBody(null, null).length > 0, '何も来なくても落ちない');

console.log('\nPASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
