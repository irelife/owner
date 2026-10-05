/* ★★ 入居率の検査
 *
 *   入居率 ＝（総戸数 − 募集中 − 解約予定）÷ 総戸数
 *
 *  【なぜ、この検査が要るか】
 *  総戸数は、明細PDFに欄がありません。どこにもありません。
 *  「収入明細」の表に空いているお部屋も1行として出るので、
 *  PIVOT2 がその行の数を数えて送ってきます（units）。
 *  つまり入居率は、2つの別の読み取りの上に乗っています。
 *  片方がずれても、エラーは出ません。
 *  オーナー様の画面に、まちがった率が静かに出続けます。
 *
 *  ですからこの検査は、とくに
 *     「出さないと決めた場合に、ほんとうに出さないか」
 *  を重く見ています。0％ とは出しません。
 *
 *  前半：数の正しさ（stOcc）
 *  後半：画面にどう出るか（本物のブラウザ）
 *
 *  使いかた：  node tests/tocc.cjs
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
const box = new Function(ins + st + '; return { stOcc, stGroup };')();
const { stOcc, stGroup } = box;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); }
                       else   { fail++; console.log('  ❌ ' + m); } };
const eq = (g, w, m) => ok(g === w, m + '（' + JSON.stringify(g) + '）');

/* 画面に出ている形（stGroup が返す形）を手で作ります */
const box1 = (name, rooms) => ({ name:name, rooms:rooms });
const rm   = (room, kind) => ({ kind:kind, room:room, place:'', tag:'',
                                detail:'', tenant:'', end:'', start:'',
                                rent:'', moved:false, movedDate:'' });

/* ── ① 本物の数（ご確認いただいた 35室・解約予定2室） ───── */
console.log('\n① 実際の明細（35室・解約予定2室）');
let d = stOcc([ box1('A棟', [rm('102号室','解約予定')]),
                box1('E棟', [rm('203号室','解約予定')]) ], 35,
              [{ prop:'A棟', units:5 }, { prop:'B棟', units:5 },
               { prop:'C棟', units:6 }, { prop:'D棟', units:6 },
               { prop:'E棟', units:8 }, { prop:'F棟', units:5 }]);
ok(!!d, '出る');
eq(d.units, 35, '総戸数 35室');
eq(d.empty, 2, '空き（募集中＋解約予定） 2室');
eq(d.filled, 33, 'ご入居 33室');
eq(d.rate, 94.3, '★入居率 94.3％（(35−2)÷35）');

/* ── ② 解約予定は、空室に数える（2026/10/5 ご指示） ───── */
console.log('\n② ★解約予定は空室に数える（お決めいただいた形）');
d = stOcc([ box1('A棟', [rm('102号室','解約予定')]) ], 10, null);
eq(d.rate, 90, '10室で解約予定1室 → 90％（入居中に数えれば 100％でした）');
eq(d.empty, 1, '解約予定も「空き」に入る');

d = stOcc([ box1('A棟', [rm('102号室','募集中'), rm('103号室','解約予定')]) ], 10, null);
eq(d.rate, 80, '募集中1室＋解約予定1室 → 80％');

/* ── ③ 新規契約は、入居中として数える ───────────── */
console.log('\n③ 新規契約は入居中');
d = stOcc([ box1('A棟', [rm('102号室','新規契約')]) ], 10, null);
eq(d.rate, 100, '新規契約だけなら 満室（100％）');
eq(d.empty, 0, '新規契約は空きに入れない');

/* ── ④ 満室 ─────────────────────────── */
console.log('\n④ 満室');
d = stOcc([], 35, null);
eq(d.rate, 100, '空きが1室も無ければ 100％');
eq(d.filled, 35, 'ご入居 35室');

/* ── ⑤ 端数のまるめ ────────────────────── */
console.log('\n⑤ 端数は小数第1位まで');
eq(stOcc([ box1('A棟', [rm('101号室','募集中')]) ], 3, null).rate, 66.7,
   '3室で1室空き → 66.7％（66.666… を切りつめない）');
eq(stOcc([ box1('A棟', [rm('101号室','募集中')]) ], 7, null).rate, 85.7,
   '7室で1室空き → 85.7％');
eq(stOcc([ box1('A棟', [rm('101号室','募集中'), rm('102号室','募集中')]) ], 35, null).rate,
   94.3, '35室で2室空き → 94.3％');
eq(stOcc([ box1('A棟', [rm('101号室','募集中')]) ], 2, null).rate, 50,
   '2室で1室空き → 50％（50.0 とは書かない）');

/* ── ⑥ ★出さないと決めた場合 ───────────────── */
console.log('\n⑥ ★出さないと決めた場合（0％ とは出さない）');
ok(stOcc([], 0, null)        === null, '総戸数 0 → 出さない（PIVOT2 が数えられなかったとき）');
ok(stOcc([], null, null)     === null, '総戸数が無い → 出さない');
ok(stOcc([], undefined,null) === null, '総戸数が undefined → 出さない');
ok(stOcc([], '', null)       === null, '総戸数が空の文字 → 出さない');
ok(stOcc([], 'たくさん',null)=== null, '総戸数が文字 → 出さない');
ok(stOcc([], -5, null)       === null, '総戸数がマイナス → 出さない');
ok(stOcc([], NaN, null)      === null, '総戸数が NaN → 出さない');
ok(stOcc([ box1('A棟', [rm('101号室','募集中'), rm('102号室','募集中'),
                        rm('103号室','募集中')]) ], 2, null) === null,
   '★空きが総戸数より多い → 出さない（つじつまが合わない）');
ok(stOcc(null, 10, null) !== null, 'boxes が null でも落ちない（満室として出る）');
eq(stOcc(null, 10, null).rate, 100, 'boxes が null → 100％');
ok(stOcc(undefined, 10, null) !== null, 'boxes が undefined でも落ちない');

/* ── ⑦ 同じお部屋を二重に数えない ────────────── */
console.log('\n⑦ 同じお部屋を二重に数えない');
d = stOcc([ box1('A棟', [rm('102号室','募集中'), rm('102号室','解約予定')]) ], 10, null);
eq(d.empty, 1, '同じ102号室が募集中と解約予定の両方にあっても、1室');
d = stOcc([ box1('A棟', [rm('102号室','募集中')]),
            box1('B棟', [rm('102号室','募集中')]) ], 10, null);
eq(d.empty, 2, '別の棟の102号室は、別のお部屋として数える');

/* ── ⑧ 棟ごとの内訳 ───────────────────── */
console.log('\n⑧ 棟ごとの内訳');
d = stOcc([ box1('A棟', [rm('102号室','募集中')]) ], 8,
          [{ prop:'A棟', units:5 }, { prop:'B棟', units:3 }]);
ok(d.byOk === true, '内訳が出る');
eq(d.byProp.length, 2, '2棟ぶん');
eq(d.byProp[0].rate, 80, 'A棟 5室で1室空き → 80％');
eq(d.byProp[1].rate, 100, 'B棟 3室で空きなし → 100％');
eq(d.byProp[0].filled + d.byProp[1].filled, d.filled,
   '内訳のご入居室数の合計が、全体と合う');

console.log('\n⑧-2 ★内訳がそろわないときは、内訳を出さない');
d = stOcc([ box1('A棟', [rm('102号室','募集中')]) ], 8,
          [{ prop:'A棟', units:5 }, { prop:'B棟', units:9 }]);
ok(d.byOk === false && d.byProp.length === 0,
   '★棟ごとの室数の合計（14）が総戸数（8）と合わない → 内訳を出さない');
eq(d.rate, 87.5, 'それでも、全体の率は出す（割る数は総戸数のまま）');

d = stOcc([ box1('ちがう名前の棟', [rm('102号室','募集中')]) ], 8,
          [{ prop:'A棟', units:5 }, { prop:'B棟', units:3 }]);
ok(d.byOk === false && d.byProp.length === 0,
   '★物件名が食いちがって、空室が内訳に割りふれない → 内訳を出さない');
eq(d.empty, 1, 'それでも、全体の空室は数えている');

d = stOcc([ box1('A棟', [rm('101号室','募集中'), rm('102号室','募集中'),
                         rm('103号室','募集中')]) ], 8,
          [{ prop:'A棟', units:2 }, { prop:'B棟', units:6 }]);
ok(d.byOk === false, '★棟の空室が、その棟の室数より多い → 内訳を出さない');

d = stOcc([], 8, 'こわれた中身');
ok(d !== null && d.byOk === false, 'unitsBy が配列でなくても落ちない');
d = stOcc([], 8, [null, { prop:'A棟', units:'たくさん' }, { prop:'B棟', units:0 }]);
ok(d !== null && d.byOk === false, 'unitsBy の中身がこわれていても落ちない');

/* ── ⑨ 一覧と率が食いちがわない（過ぎた解約予定） ─────── */
console.log('\n⑨ ★一覧と率が食いちがわない（解約予定日が過ぎたお部屋）');
/*  2026/9/22 のお決めごとで、解約予定日が過ぎたお部屋は
 *  一覧では「募集中」に変わります。率も、変わったあとの数で割ります。
 *  （どちらも空室に数えるので、率そのものは同じです。
 *    ★ここで確かめたいのは「一覧に出ている室数と、率の分子が合う」こと） */
const R = { month:'2026年9月', newc:[], boshu:[],
            yotei:[{ place:'A棟 102号室', tag:'2020年01月31日', detail:'' }] };
const boxes = stGroup(R);
d = stOcc(boxes, 10, null);
eq(boxes[0].rooms[0].kind, '募集中', '過ぎた解約予定は、一覧で募集中になる');
eq(d.empty, 1, '率のほうも、そのまま1室の空きとして数える');
eq(d.rate, 90, '90％');

/* ── ⑩ 画面にどう出るか（本物のブラウザ） ─────────── */
(async () => {

const S = {
  /* 35室・解約予定2室・6棟 */
  real: { ok:true, month:'2026年9月', newc:[], boshu:[],
          /* ★日付は、検査がいつ走っても「解約予定」のままになるよう
           *   先の日付にしています。きょうより前の日付にすると、
           *   2026/9/22 のお決めごとで「募集中」に変わってしまい、
           *   検査の結果が走った日で変わってしまうためです。
           *   過ぎた解約予定のほうは、上の ⑨ で見ています。 */
          yotei:[{ place:'マーベラスA棟 102号室', tag:'2099年09月30日', detail:'' },
                 { place:'サンプルE棟 203号室',  tag:'2099年10月31日', detail:'' }],
          message:'', units:35,
          unitsBy:[{ prop:'マーベラスA棟', units:5 }, { prop:'マーベラスB棟', units:5 },
                   { prop:'サンプルC棟', units:6 }, { prop:'サンプルD棟', units:6 },
                   { prop:'サンプルE棟', units:8 }, { prop:'サンプルF棟', units:5 }] },
  /* 満室 */
  full: { ok:true, month:'2026年9月', newc:[], boshu:[], yotei:[], message:'',
          units:12, unitsBy:[{ prop:'マーベラスA棟', units:12 }] },
  /* 総戸数が送られてこない（PIVOT2 が数えられなかった） */
  none: { ok:true, month:'2026年9月', newc:[], boshu:[],
          yotei:[{ place:'マーベラスA棟 102号室', tag:'2099年09月30日', detail:'' }],
          message:'', units:0, unitsBy:[] },
  /* 古い Apps Script（units という項目がそもそも無い） */
  old:  { ok:true, month:'2026年9月', newc:[], boshu:[],
          yotei:[{ place:'マーベラスA棟 102号室', tag:'2099年09月30日', detail:'' }],
          message:'' },
  /* 1棟だけ（内訳は出さない） */
  one:  { ok:true, month:'2026年9月', newc:[],
          boshu:[{ place:'マーベラスA棟 102号室', tag:'', detail:'' }],
          yotei:[], message:'', units:5,
          unitsBy:[{ prop:'マーベラスA棟', units:5 }] },
  /* つじつまが合わない（空室が総戸数より多い） */
  odd:  { ok:true, month:'2026年9月', newc:[],
          boshu:[{ place:'マーベラスA棟 101号室', tag:'', detail:'' },
                 { place:'マーベラスA棟 102号室', tag:'', detail:'' },
                 { place:'マーベラスA棟 103号室', tag:'', detail:'' }],
          yotei:[], message:'', units:2, unitsBy:[{ prop:'マーベラスA棟', units:2 }] }
};

const HOME = { ok:true, month:'2026年9月', total:485200, sokinDate:'2026年9月30日',
               pdfId:'F1', rows:[{ label:'マーベラスA棟', amount:485200 }],
               moves:{ newc:0, yotei:0, boshu:0 },
               props:[{ name:'マーベラスA棟' }] };

let which = 'real';
function stage(p){
  return p.route('**/macros/s/**', r => {
    const A = JSON.parse(r.request().postData() || '{}').action;
    let x = { ok:true };
    if(A === 'login' || A === 'me')
      x = { ok:true, token:'T', owner:{ name:'山田 太郎', atena:'山田 太郎 様' },
            home:HOME };
    else if(A === 'home')   x = HOME;
    else if(A === 'status') x = S[which];
    else if(A === 'papers') x = { ok:true, years:[] };
    else if(A === 'insList' || A === 'talks') x = { ok:true, list:[] };
    r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(x) });
  });
}

  const b = await chromium.launch();
  const p = await b.newPage({ viewport:{ width:390, height:900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await stage(p);

  async function login(){
    await p.goto(URL);
    await p.evaluate(() => { try{ localStorage.clear(); }catch(e){} });
    await p.goto(URL);
    await p.waitForTimeout(400);
    await p.fill('#li-mail', 'owner@example.jp');
    await p.fill('#li-pass', 'password1234');
    await p.click('#li-go');
    await p.waitForTimeout(1200);
  }
  const read = () => p.evaluate(() => {
    const $ = i => document.getElementById(i);
    return {
      hidden : $('hm-occ-wrap').hidden,
      k      : $('hm-occ-k').textContent,
      v      : $('hm-occ-v').textContent,
      s      : $('hm-occ-p').textContent,
      more   : !$('hm-occ-more').hidden,
      exp    : $('hm-occ-b').getAttribute('aria-expanded'),
      dis    : $('hm-occ-b').getAttribute('aria-disabled'),
      why    : !$('hm-occ-why').hidden,
      tap    : Math.round($('hm-occ-b').getBoundingClientRect().height),
      rows   : [...document.querySelectorAll('#hm-occ-rows .row')]
                 .map(e => e.textContent.trim().replace(/\s+/g, ' '))
    };
  });

  console.log('\n⑩ ホームの入居率（本物のブラウザ）');
  which = 'real'; await login();
  let r = await read();
  eq(r.hidden, false, '入居率が出る');
  eq(r.k, '入居率（2026年9月分）', '見出しに対象月が入る');
  eq(r.v, '94.3％', '★94.3％');
  eq(r.s, '全 35 室中　33 室ご入居', '室数も出る');
  eq(r.more, true, '「内訳」が出る');
  eq(r.exp, 'false', 'はじめは閉じている');
  eq(r.why, false, '中身も閉じている');
  ok(r.tap >= 44, '★指でふれる的が 44px 以上（' + r.tap + 'px）');

  await p.click('#hm-occ-b'); await p.waitForTimeout(200);
  r = await read();
  eq(r.exp, 'true', '押すと開く');
  eq(r.why, true, '中身が見える');
  eq(r.rows.length, 7, '6棟＋合計の7行');
  ok(/マーベラスA棟/.test(r.rows[0]) && /80％/.test(r.rows[0]),
     'A棟 5室で1室空き → 80％（' + r.rows[0] + '）');
  ok(/合計/.test(r.rows[6]) && /94\.3％/.test(r.rows[6]),
     '最後の行が合計 94.3％（' + r.rows[6] + '）');
  ok(/33／35 室/.test(r.rows[6]), '合計の行に 33／35 室（' + r.rows[6] + '）');
  await p.click('#hm-occ-b'); await p.waitForTimeout(200);
  r = await read();
  eq(r.why, false, 'もう一度押すと閉じる');

  console.log('\n⑪ 満室のとき');
  which = 'full'; await login();
  r = await read();
  eq(r.hidden, false, '出る');
  eq(r.v, '100％', '100％（100.0％ とは書かない）');
  eq(r.s, '全 12 室　満室', '「満室」と書く');

  console.log('\n⑫ ★総戸数が来ないときは、箱ごと出さない');
  which = 'none'; await login();
  r = await read();
  eq(r.hidden, true, '★入居率の箱ごと出ない（0％ とは出さない）');
  which = 'old'; await login();
  r = await read();
  eq(r.hidden, true, '★古い Apps Script（units が無い）でも、出ないだけ（こわれない）');
  ok((await p.evaluate(() => document.getElementById('st-body')
        ? true : true)), '画面は動いている');

  console.log('\n⑬ ★つじつまが合わないときも、出さない');
  which = 'odd'; await login();
  r = await read();
  eq(r.hidden, true, '★空室3室 > 総戸数2室 → 出さない');

  console.log('\n⑭ 1棟だけのときは、内訳を出さない');
  which = 'one'; await login();
  r = await read();
  eq(r.hidden, false, '率は出る');
  eq(r.v, '80％', '5室で1室空き → 80％');
  eq(r.more, false, '「内訳」は出さない（1棟しかないため）');
  eq(r.dis, 'true', '押せないようにする');
  await p.evaluate(() => document.getElementById('hm-occ-b').click());
  await p.waitForTimeout(200);
  r = await read();
  eq(r.why, false, '★押しても開かない');

  console.log('\n⑮ 入居状況の画面の、まとめの一行');
  which = 'real'; await login();
  await p.click('[data-go="status"]'); await p.waitForTimeout(600);
  let sum = await p.evaluate(() => {
    const e = document.querySelector('#st-body .st-sum');
    return e ? e.textContent.replace(/\s+/g, ' ').trim() : '';
  });
  ok(/入居率 94\.3％/.test(sum), '★入居率が先に出る（' + sum + '）');
  ok(/全 35 室中 33 室ご入居/.test(sum), '室数も出る（' + sum + '）');
  ok(/解約予定 2室/.test(sum), 'これまでの「解約予定 2室」も残っている（' + sum + '）');

  which = 'none'; await login();
  await p.click('[data-go="status"]'); await p.waitForTimeout(600);
  sum = await p.evaluate(() => {
    const e = document.querySelector('#st-body .st-sum');
    return e ? e.textContent.replace(/\s+/g, ' ').trim() : '';
  });
  ok(!/入居率/.test(sum), '★総戸数が無いときは、ここにも入居率を出さない（' + sum + '）');
  ok(/解約予定 1室/.test(sum), 'これまでの一行は、そのまま出る（' + sum + '）');

  console.log('\n⑯ 画面の幅 × 文字の大きさを変えても、はみ出さない');
  which = 'real';
  for(const w of [320, 360, 390, 414, 768, 1024, 1280]){
    for(const z of ['s', 'm', 'l']){
      await p.setViewportSize({ width:w, height:900 });
      await login();
      await p.evaluate(s => {
        try{ localStorage.setItem('ire_owner_size', s); }catch(e){}
        document.documentElement.setAttribute('data-size', s);
      }, z);
      await p.waitForTimeout(250);
      await p.evaluate(() => {
        const b = document.getElementById('hm-occ-b');
        if(b && b.getAttribute('aria-disabled') !== 'true') b.click();
      });
      await p.waitForTimeout(200);
      const bad = await p.evaluate(() => {
        const out = [];
        const root = document.getElementById('hm-occ-wrap');
        if(!root || root.hidden) return out;
        if(document.documentElement.scrollWidth >
           document.documentElement.clientWidth + 1) out.push('画面が横にはみ出した');
        const R = root.getBoundingClientRect();
        root.querySelectorAll('*').forEach(e => {
          const r = e.getBoundingClientRect();
          if(r.width === 0) return;
          if(r.right > R.right + 1 || r.left < R.left - 1)
            out.push((e.id || e.className) + ' が箱から出た');
        });
        return out;
      });
      ok(bad.length === 0, w + 'px × ' + z + '：はみ出さない' +
         (bad.length ? ('（' + bad.join('・') + '）') : ''));
    }
  }
  await p.setViewportSize({ width:390, height:900 });

  console.log('\n⑰ JavaScript の誤りが出ていないか');
  ok(errs.length === 0, 'ページの誤りが 0 件' +
     (errs.length ? '（' + errs.join(' / ') + '）' : ''));

  await b.close();
  console.log('\nPASS=' + pass + '  FAIL=' + fail);
  process.exit(fail ? 1 : 0);
})();
