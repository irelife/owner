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
  my + '; return { THEMES, thPick, thName, thOf, SIZES, szPick, szName, SZKEY,'
      + ' SKINS, skPick, skName, SKKEY,'
      + ' myNum, myTel, myZip, myMail, myCheck, myBody };'
)();

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); }
                       else    { fail++; console.log('  ❌ ' + m); } };
const eq = (got, want, m) => ok(got === want, m + '（' + JSON.stringify(got) + '）');

console.log('\n── 配色の一覧（THEMES）──');
/* ★2026/10/4 … 明るい配色（紙・台帳）を2つ足しました。
     暗い地が苦手な方・紙の明細に慣れた方のためのものです。 */
eq(box.THEMES.length, 5, '5つ（暗い3つ ＋ 明るい2つ）');
ok(box.THEMES.some(t => t.id === 'kami') && box.THEMES.some(t => t.id === 'cho'),
   '★明るい配色（紙・台帳）が一覧に入っている');
eq(box.THEMES[0].id, 'wine', '1つめは既定のワイン');
ok(box.THEMES.every(t => /^#[0-9A-F]{6}$/.test(t.bg) && /^#[0-9A-F]{6}$/.test(t.pri)),
   '★どれも色が6桁で入っている（先あての script と対になる値）');
ok(new Set(box.THEMES.map(t => t.id)).size === box.THEMES.length, 'id が重なっていない');
ok(!box.THEMES.some(t => t.id === 'indigo'),
   '★藍は取り下げ済み（2026/10/2 ご指示）。一覧に残っていない');

/* ★★ index.html の「配色の先あて」と、THEMES がずれていないか
 *
 *   先あては、app.js を読み込む前に data-theme を付けるための短い script です。
 *   ここに配色を書き忘れると、その色をお選びの方に「一瞬だけワインが見える」
 *   ことになります。画面は最後には正しくなるので、気づきにくい種類の不具合です。
 *   人が2か所を見比べるのをやめて、検査で押さえます。 */
/* ★★ 文字の大きさ（2026/10/4 追加）
 *
 *   「全体的に文字が小さい」とのご指摘から入れたものです。
 *   3段のどれを選んでも、css に受け口があり、先あての script が
 *   読む鍵の名前と、app.js が書く鍵の名前がそろっている必要があります。
 *   ずれると「選んだのに、次に開くと元に戻る」ことになります。 */
console.log('\n── ★★ 文字の大きさ（SIZES）──');
eq(box.SIZES.length, 3, '3段');
eq(box.SIZES[0].id, 'm', '1つめは「ふつう」');
ok(box.SIZES.map(z => z.id).join(',') === 'm,l,xl', '並びは ふつう → 大きい → 特大');
ok(new Set(box.SIZES.map(z => z.id)).size === box.SIZES.length, 'id が重なっていない');

/* ★★ 雰囲気（2026/10/4 追加）
 *
 *   ご指示「色合いはそれぞれのテーマでよいけれど、雰囲気が」から
 *   入れたものです。変わるのは角の丸みだけで、色には触りません。 */
console.log('\n── ★★ 雰囲気（SKINS）──');
eq(box.SKINS.length, 2, '2つ（まる・板）');
eq(box.SKINS[0].id, 'maru', '★1つめは既定の「まる」（いままでと同じ形）');
ok(box.SKINS.map(k => k.id).join(',') === 'maru,flat', '並びは まる → 板');
ok(new Set(box.SKINS.map(k => k.id)).size === box.SKINS.length, 'id が重なっていない');
ok(box.SKINS.every(k => /^\d+px$|^999px$/.test(k.r)),
   '★どちらも見本の丸みが入っている（画面に出す値）');
ok(box.SKINS[0].r === '999px' && box.SKINS[1].r !== '999px',
   '★見本の丸みが、まる型 → ひかえめ になっている');

console.log('\n── 雰囲気を選ぶ（skPick）──');
eq(box.skPick('maru'), 'maru', 'まる');
eq(box.skPick('flat'), 'flat', '板');
eq(box.skPick(''), 'maru', '★空なら既定のまる');
eq(box.skPick(null), 'maru', '★何も来なくてもまる');
eq(box.skPick('sea'), 'maru',
   '★見本にしかない「海」を選んでいても、まるに戻る（画面が壊れない）');
eq(box.skPick(' flat '), 'flat', '前後の空白は取る');
eq(box.skPick('FLAT'), 'maru', '★大文字は別物として扱う');
eq(box.skName('flat'), '板', '名前が引ける');
eq(box.skName('sea'), '', '★無いものは空');

console.log('\n── ★★ index.html の先あてと、THEMES がそろっているか ──');
const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const mTh  = html.match(/var\s+_TH\s*=\s*\{([^}]*)\}/);
ok(!!mTh, '先あての一覧（var _TH）がある');
if (mTh) {
  const pre = {};
  mTh[1].split(',').forEach(s2 => {
    const m2 = s2.match(/([A-Za-z0-9_]+)\s*:\s*'(#[0-9A-Fa-f]{6})'/);
    if (m2) pre[m2[1]] = m2[2].toUpperCase();
  });
  const need = box.THEMES.filter(t => t.id !== box.THEMES[0].id);
  ok(Object.keys(pre).length === need.length,
     '★既定以外の配色の数が合っている（先あて ' + Object.keys(pre).length +
     ' 件／THEMES ' + need.length + ' 件）');
  need.forEach(t => {
    ok(pre[t.id] === t.bg.toUpperCase(),
       '★ ' + t.name + '（' + t.id + '）… 先あての色 ' + (pre[t.id] || 'なし') +
       ' ＝ THEMES の ' + t.bg);
  });
  ok(!(box.THEMES[0].id in pre),
     '★既定のワインは先あてに入れない（入れると data-theme が要らぬ形で付く）');
}

console.log('\n── 配色を選ぶ（thPick）──');
eq(box.thPick('wine'), 'wine', 'ワイン');
eq(box.thPick('midnight'), 'midnight', 'ミッドナイト');
eq(box.thPick('charcoal'), 'charcoal', 'チャコール');
eq(box.thPick('indigo'), 'wine',
   '★藍を選んでいた方は、既定のワインに戻る（画面が壊れない）');
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
eq(box.thOf('indigo').bg, '#3E1E24',
   '★取り下げた藍は、既定のワインの色を返す');
eq(box.thName('indigo'), '',
   '★取り下げた藍は、名前を返さない（画面に出さない）');

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

/* ★★ 文字の大きさと、明るい配色が「本当に効く」か
 *
 *   ① css に受け口（html[data-size=…] / html[data-theme=…]）があるか
 *   ② 先あての script が、app.js と同じ鍵の名前を読んでいるか
 *      ずれると「選んだのに、次に開くと元に戻る」ことになります
 *   ③ 大きさが ふつう < 大きい < 特大 の順になっているか
 *   ④ 地の字が ％ で書かれているか
 *      px で書くと、端末の「文字を大きく」の設定が効かなくなります */
console.log('\n── ★★ 文字の大きさ・明るい配色が、本当に効くか ──');
{
  const css   = fs.readFileSync(path.join(DIR, 'css/style.css'), 'utf8');
  const html2 = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');

  const base = css.match(/html\{[^}]*font-size:\s*([\d.]+)%/);
  ok(!!base, '④ 地の字が ％ で書かれている（端末の文字設定が効く）');

  const got = {};
  if (base) got.m = parseFloat(base[1]);
  ['l', 'xl'].forEach(function(id){
    const m = css.match(new RegExp('html\\[data-size="' + id + '"\\]\\{[^}]*font-size:\\s*([\\d.]+)%'));
    ok(!!m, '① css に受け口がある: data-size="' + id + '"');
    if (m) got[id] = parseFloat(m[1]);
  });
  ok(got.m && got.l && got.xl && got.m < got.l && got.l < got.xl,
     '③ ふつう < 大きい < 特大 の順（' + JSON.stringify(got) + '）');

  const key = box.SZKEY || '';
  ok(!!key, 'app.js に、大きさを保存する鍵の名前がある');
  ok(key && html2.indexOf("localStorage.getItem('" + key + "')") >= 0,
     '★★ ② 先あてが読む鍵と、app.js が書く鍵が同じ（' + JSON.stringify(key) + '）');

  const mTh2 = html2.match(/var\s+_TH\s*=\s*\{([\s\S]*?)\}/);
  ok(!!(mTh2 && /kami/.test(mTh2[1]) && /cho/.test(mTh2[1])),
     '★ 明るい配色（紙・台帳）も、先あての一覧に入っている');

  ['kami', 'cho'].forEach(function(id){
    ok(css.indexOf('html[data-theme="' + id + '"]') >= 0,
       '★ css に受け口がある: data-theme="' + id + '"');
  });
}

/* ★★ 雰囲気（板）が「本当に効く」か
 *
 *   この仕組みは、角の丸みが css の 1か所（:root の --r-…）に
 *   まとまっていることだけが支えです。どこかに「border-radius:24px」と
 *   直接書かれていると、その部品だけ「板」にならず取り残されます。
 *   人が目で見つけるのは無理なので、検査で押さえます。 */
console.log('\n── ★★ 雰囲気（板）が、本当に効くか ──');
{
  const css   = fs.readFileSync(path.join(DIR, 'css/style.css'), 'utf8');
  const html2 = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  const R = ['--r-s', '--r-m', '--r-l', '--r-x', '--r-btn', '--r-tag'];

  /* ① 既定の6つが決まっているか */
  const def = {};
  R.forEach(function(k){
    const m = css.match(new RegExp('\\' + 'n\\s*' + k + ':\\s*([\\d]+)px'));
    ok(!!m, '① 既定が決まっている: ' + k);
    if (m) def[k] = parseInt(m[1], 10);
  });

  /* ② 板の受け口があり、6つぜんぶを上書きしているか */
  const fl = css.match(/html\[data-skin="flat"\]\{([\s\S]*?)\}/);
  ok(!!fl, '② css に受け口がある: html[data-skin="flat"]');
  const flat = {};
  if (fl) {
    R.forEach(function(k){
      const m = fl[1].match(new RegExp(k + ':\\s*([\\d]+)px'));
      ok(!!m, '② 板でも決めている: ' + k);
      if (m) flat[k] = parseInt(m[1], 10);
    });
    ok(R.every(k => flat[k] !== undefined && def[k] !== undefined && flat[k] <= def[k]),
       '★ 板は、どれも既定と同じか、より小さい丸み（' + JSON.stringify(flat) + '）');
    ok(flat['--r-btn'] !== undefined && flat['--r-btn'] < 999,
       '★ ボタンのまる型をやめている（' + flat['--r-btn'] + 'px）');
    ok(flat['--r-tag'] !== undefined && flat['--r-tag'] < 999,
       '★ 札のまる型をやめている（' + flat['--r-tag'] + 'px）');
  }

  /* ③ 角の丸みの直書きが残っていないか（これが取り残しの元です）
       ★のこしてよいもの … 棒の上だけ丸める／11px の見本の四角／丸 */
  const KEEP = ['4px 4px 0 0', '2px', '50%', 'inherit'];
  const bad = [];
  css.split('\n').forEach(function(line, i){
    const m = line.match(/border-radius:\s*([^;}]+)/);
    if (!m) return;
    const v = m[1].trim();
    if (v.indexOf('var(--r') === 0) return;
    if (KEEP.indexOf(v) >= 0) return;
    bad.push((i + 1) + '行: ' + v);
  });
  ok(bad.length === 0,
     '★★ ③ 角の丸みの直書きが残っていない（残り ' + bad.length + ' 件'
     + (bad.length ? '：' + bad.join(' / ') : '') + '）');

  /* ④ 上のバーのぼかしを、板ではやめているか */
  ok(/html\[data-skin="flat"\]\s*\.bar\{[^}]*backdrop-filter:\s*none/.test(css),
     '④ 板では、上のバーのすりガラスをやめている');

  /* ⑤ 先あてが読む鍵と、app.js が書く鍵が同じか */
  const kk = box.SKKEY || '';
  ok(!!kk, 'app.js に、雰囲気を保存する鍵の名前がある');
  ok(kk && html2.indexOf("localStorage.getItem('" + kk + "')") >= 0,
     '★★ ⑤ 先あてが読む鍵と、app.js が書く鍵が同じ（' + JSON.stringify(kk) + '）');
  ok(html2.indexOf("setAttribute('data-skin'") >= 0,
     '★ 先あてが data-skin を付けている（まる型が一瞬見えるのを防ぐ）');

  /* ⑥ えらびの受け皿が index.html にあるか */
  ok(html2.indexOf('id="my-skins"') >= 0, '⑥ マイアカウントに、えらびの受け皿がある');
}

console.log('\nPASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
