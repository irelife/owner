/* ★★ 動きが無ければ、ひとりでに降りるか（2026/10/2）
 *
 *  ご指示：
 *    「一回ログインするとずっとログイン状態です」
 *    「動きがなければ、1時間で自動でログアウトするようにしてください。
 *      いつでも見られるのが良いわけですから、月一とは限りません」
 *
 *  【改良前】 入館証は14日もちました。一度ログインすると2週間、
 *            ずっと入ったままです。ご家族と同じ端末をお使いの方や、
 *            外で開いたまま置かれた方を守れませんでした。
 *  【改良後】 最後に触ってから60分で、ひとりでに降ります。
 *
 *  ★この検査でいちばん大事なのは ❹ です。
 *    「閉じて開き直しても効く」こと。画面の中だけで数えると、
 *    閉じたとたんに時計が消え、いつまでも入ったままになります。
 *
 *  使いかた： node tests/tidle.cjs [場所]
 */
const path = require('path');
const { chromium } = (function(){
  try{ return require('playwright'); }
  catch(e){ return require('/opt/node22/lib/node_modules/playwright'); }
})();
const DIR = path.resolve(process.argv[2] || path.join(__dirname, '..'));

let P = 0, F = 0;
const ok = (c, m, x) => {
  if (c) { P++; console.log('  ✅ ' + m); }
  else   { F++; console.log('  ❌ ' + m + (x !== undefined ? ('  → ' + JSON.stringify(x)) : '')); }
};

const SKEY = 'ire_owner_seen';
const TKEY = 'ire_owner_token';

/* にせサーバー。logout を呼んだ回数も数えます。 */
async function fake(p){
  await p.route('**/macros/s/**', r => {
    const B = JSON.parse(r.request().postData() || '{}');
    let x = { ok:true };
    if (B.action === 'login'){
      x = { ok:true, token:'T1', owner:{ name:'テスト', atena:'テスト 様' },
            home:{ ok:true, month:'2026年9月', total:0, rows:[],
                   moves:{newc:0,yotei:0,boshu:0}, props:[] } };
    }else if (B.action === 'me'){
      x = { ok:true, owner:{ name:'テスト', atena:'テスト 様' },
            home:{ ok:true, month:'2026年9月', total:0, rows:[],
                   moves:{newc:0,yotei:0,boshu:0}, props:[] } };
    }else if (B.action === 'logout'){ x = { ok:true }; }
    r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(x) });
  });
}

/* ★画面は #s-login / #s-home … の hidden で切り替わります。
     .screen.on というクラスはありません（ここで一度まちがえました）。 */
const 画面 = (p) => p.evaluate(() => {
  var ids = ['login','forgot','newpass','home','status','papers','contact',
             'accountant','insurance','account','myinfo'];
  for (var i = 0; i < ids.length; i++){
    var el = document.getElementById('s-' + ids[i]);
    if (el && !el.hidden) return ids[i];
  }
  return '(不明)';
});
const SCR = "(function(){var ids=['login','forgot','newpass','home','status'," +
  "'papers','contact','accountant','insurance','account','myinfo'];" +
  "for(var i=0;i<ids.length;i++){var el=document.getElementById('s-'+ids[i]);" +
  "if(el&&!el.hidden)return ids[i];}return '(不明)';})()";

const ログイン = async (p) => {
  await p.fill('#li-mail', 'owner@example.jp');
  await p.fill('#li-pass', 'password1234');
  await p.click('#li-go');
  await p.waitForTimeout(900);
};

/* 最後に触った時刻を「◯分前」に書き換えます */
const 時間をすすめる = (p, min) => p.evaluate((a) => {
  localStorage.setItem('ire_owner_seen', String(Date.now() - a * 60000));
}, min);

(async () => {
  const b = await chromium.launch();
  const errs = [];

  /* ── ❶ ログインすると、動きの時刻が記録されるか ── */
  console.log('\n❶ ログインした瞬間を、動きの起点にするか');
  let p = await b.newPage({ viewport:{ width:390, height:844 } });
  p.on('pageerror', e => errs.push(e.message));
  await fake(p);
  await p.goto('file://' + path.join(DIR, 'index.html'));
  await p.waitForTimeout(400);
  await ログイン(p);

  let v = {
    scr : await 画面(p),
    seen: await p.evaluate((k) => localStorage.getItem(k) || '', SKEY),
    tk  : await p.evaluate((k) => localStorage.getItem(k) || '', TKEY)
  };
  console.log('   画面: ' + v.scr + ' ／ 入館証: ' + (v.tk ? 'あり' : 'なし'));
  ok(v.tk === 'T1', 'ログインできる', v.tk);
  ok(!!v.seen && Number(v.seen) > 0,
     '★★ログインした時刻が記録される（前の方の時刻で数え始めないため）', v.seen);
  ok(Date.now() - Number(v.seen) < 10000, '★その時刻は「いま」である');

  /* ── ❷ 59分では降りない ── */
  console.log('\n❷ まだ1時間たっていないとき');
  await 時間をすすめる(p, 59);
  await p.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await p.waitForTimeout(300);
  v = { scr: await 画面(p),
        tk : await p.evaluate((k) => localStorage.getItem(k) || '', TKEY) };
  console.log('   59分後の画面: ' + v.scr);
  ok(v.tk === 'T1', '★59分では降りない（読んでいる途中で切られては困ります）', v);

  /* ── ❸ 61分で降りる ── */
  console.log('\n❸ 1時間をすぎたとき');
  let logouts = 0;
  p.on('request', r => {
    if (!/macros\/s/.test(r.url())) return;
    try{ if (JSON.parse(r.postData() || '{}').action === 'logout') logouts++; }catch(e){}
  });
  await 時間をすすめる(p, 61);
  await p.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(600);
  v = {
    scr  : await 画面(p),
    tk   : await p.evaluate((k) => localStorage.getItem(k) || '', TKEY),
    seen : await p.evaluate((k) => localStorage.getItem(k) || '', SKEY),
    toast: await p.evaluate(() => (document.getElementById('toast')||{}).textContent || '')
  };
  console.log('   61分後の画面: ' + v.scr + ' ／ お知らせ: ' + v.toast);
  ok(v.scr === 'login', '★★★1時間をすぎたら、ログイン画面に戻る', v.scr);
  ok(v.tk === '', '★★入館証を端末から消す', v.tk);
  ok(v.seen === '', '★動きの時刻も消す（次の方が前の時刻で始まらないため）', v.seen);
  ok(/自動でログアウト/.test(v.toast),
     '★★なぜ降りたのかを伝える（黙って戻ると不具合に見えます）', v.toast);
  ok(logouts === 1, '★★クラウド側の入館証も切る（端末だけ消しても残ります）', logouts);
  await p.close();

  /* ── ❹ ★★★閉じて開き直しても効くか ── */
  console.log('\n❹ ★★★閉じて開き直したとき（いちばん大事なところ）');
  p = await b.newPage({ viewport:{ width:390, height:844 } });
  p.on('pageerror', e => errs.push(e.message));
  await fake(p);
  await p.goto('file://' + path.join(DIR, 'index.html'));
  await p.waitForTimeout(400);
  await ログイン(p);
  await 時間をすすめる(p, 61);
  /* ★ここで閉じたことにして、開き直します */
  await p.goto('file://' + path.join(DIR, 'index.html'));
  await p.waitForTimeout(900);
  v = { scr: await 画面(p),
        tk : await p.evaluate((k) => localStorage.getItem(k) || '', TKEY) };
  console.log('   開き直したあと: ' + v.scr);
  ok(v.scr === 'login',
     '★★★閉じて1時間おいて開き直しても、ログイン画面（時刻を端末に書くため）', v.scr);
  ok(v.tk === '', '★入館証も消えている', v.tk);

  /* ── ❺ 閉じてすぐ開き直したら、入ったまま ── */
  console.log('\n❺ 閉じてすぐ開き直したとき');
  await ログイン(p);
  await p.goto('file://' + path.join(DIR, 'index.html'));
  await p.waitForTimeout(900);
  v = await 画面(p);
  console.log('   すぐ開き直したあと: ' + v);
  ok(v === 'home', '★すぐ開き直したときは、入ったまま（毎回求めては使われません）', v);

  /* ── ❻ 触れば、また1時間のばる ── */
  console.log('\n❻ 触ったら、数え直すか');
  await 時間をすすめる(p, 59);
  await p.evaluate(() => {
    /* ★document ではなく body に出します。document には closest が無く、
         本物の画面では起きない誤りが出てしまいます。 */
    document.body.dispatchEvent(new MouseEvent('click', { bubbles:true }));
  });
  await p.waitForTimeout(200);
  await 時間をすすめる(p, 0);          /* 触ったので、いまが起点 */
  await p.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(400);
  v = await 画面(p);
  ok(v === 'home', '★触ったあとは、そこから1時間数える', v);

  /* ── ❼ これまでお使いの方を、入れ替えの日に追い出さないか ── */
  console.log('\n❼ ★入れ替えの日の手当て（入館証はあるが、時刻がまだ無い方）');
  await p.evaluate((k) => {
    localStorage.setItem(k[0], 'T1');   /* 古い版で入った状態 */
    localStorage.removeItem(k[1]);      /* 時刻はまだ無い */
  }, [TKEY, SKEY]);
  await p.goto('file://' + path.join(DIR, 'index.html'));
  await p.waitForTimeout(900);
  v = { scr : await 画面(p),
        seen: await p.evaluate((k) => localStorage.getItem(k) || '', SKEY) };
  console.log('   入れ替え直後: ' + v.scr + ' ／ 時刻: ' + (v.seen ? '入った' : '無い'));
  ok(v.scr === 'home',
     '★★入館証があれば、そのまま入れる（この直しを出した日に全員を降ろさない）', v.scr);
  ok(!!v.seen, '★そのとき、いまを起点として入れる', v.seen);

  ok(errs.length === 0, '　JavaScript の誤りが出ない', errs);
  await p.close(); await b.close();
  console.log('\nPASS=' + P + ' FAIL=' + F);
  process.exit(F ? 1 : 0);
})();
