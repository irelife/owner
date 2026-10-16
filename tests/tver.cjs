/* ★★ 「?v= の上げ忘れ」を捕まえる検査
 *
 *   index.html は、こう書いています。
 *       <link rel="stylesheet" href="css/style.css?v=53">
 *       <script src="js/app.js?v=54"></script>
 *
 *   この番号を上げないと、オーナー様の端末は前のファイルを使い続けます。
 *   つまり、どんなに正しく直しても **1台にも届きません**。
 *   しかも画面は前のまま動くので、直した側は「直った」と思い込みます。
 *   いちばん気づきにくい形の事故です。
 *
 *   PIVOT2 では、実際に2回やらかしました（2026/9/15・9/16）。
 *   人が気をつけるのをやめて、仕組みで捕まえます。
 *
 *   ★ PIVOT2 の tver.cjs は <script src="js/…"> だけを見ていますが、
 *     ここは css/style.css も見ます。見た目の直しも同じように届かないためです。
 *
 *   使いかた： node tests/tver.cjs [場所] [くらべる相手]
 *     くらべる相手を省くと origin/main です。
 */
const fs   = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DIR  = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const BASE = process.argv[3] || process.env.PV_BASE || 'origin/main';

let P=0,F=0;
const ok=(n,c,x)=>{ if(c){P++;console.log('  ✅ '+n);} else {F++;console.log('  ❌ '+n+(x!==undefined?('  → '+x):''));} };

function git(args){
  /* stderr は受け取るだけにします。既定だと git の「fatal: …」が
     そのまま画面に出て、飛ばしただけなのに失敗したように見えます。 */
  return execFileSync('git', args,
    { cwd: DIR, encoding:'utf8', stdio:['ignore','pipe','pipe'] });
}

/* index.html から「ファイル名 → 版番号」を取り出します。
   js は <script src>、css は <link href> です。 */
function vers(html){
  const m = {};
  let g;
  const reJs  = /<script\s+src="(js\/[^"?]+\.js)\?v=(\d+)"/g;
  while((g = reJs.exec(html)))  m[g[1]] = parseInt(g[2], 10);
  const reCss = /<link\b[^>]*href="(css\/[^"?]+\.css)\?v=(\d+)"/g;
  while((g = reCss.exec(html))) m[g[1]] = parseInt(g[2], 10);
  return m;
}

console.log('くらべる相手: ' + BASE);

let baseHtml = null, changed = [];
try{
  baseHtml = git(['show', BASE + ':index.html']);
  changed  = git(['diff', '--name-only', BASE, '--', 'js/', 'css/'])
               .split('\n').map(s=>s.trim()).filter(s=>/\.(js|css)$/.test(s));
}catch(e){
  /* くらべる相手が無いときは、検査そのものを飛ばします。
     浅い取り込み（--depth=1）で main が手元に無い端末があるためです。
     ここで落とすと、中身が正しくても赤くなります。 */
  console.log('\n  ⏭  ' + BASE + ' が見つからないので、この検査は飛ばします');
  console.log('\nPASS=0  FAIL=0');
  process.exit(0);
}

const nowHtml = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const nowV = vers(nowHtml), baseV = vers(baseHtml);

console.log('\n❶ index.html の書きかた');
ok('★ 版番号つきの読み込みがある（' + Object.keys(nowV).length + '本）',
   Object.keys(nowV).length > 0);

/* ★ 読み込んでいるのに ?v= が付いていないものは、そもそも捕まえられません */
console.log('\n❷ 読み込んでいる js・css に、?v= が1つも抜けていないか');
const noV = [];
(nowHtml.match(/<script\s+src="js\/[^"]+"/g) || []).forEach(t=>{
  if(!/\?v=\d+/.test(t)) noV.push(t);
});
(nowHtml.match(/<link\b[^>]*href="css\/[^"]+"/g) || []).forEach(t=>{
  if(!/\?v=\d+/.test(t)) noV.push(t);
});
ok('★★ ?v= の付いていない読み込みは無い', noV.length === 0, noV.join(' / '));

console.log('\n❸ ★ 中身を直したファイルは、版番号も上がっているか');
if(!changed.length){
  console.log('  （js/ と css/ に変更はありません）');
}
changed.forEach(f=>{
  const b = baseV[f], n = nowV[f];
  if(b === undefined && n === undefined){
    ok('★ ' + f + ' … index.html から読んでいません（版番号は不要）', true);
    return;
  }
  if(n === undefined){
    ok('★ ' + f + ' の版番号', false, 'index.html に ?v= がありません');
    return;
  }
  if(b === undefined){
    ok('★ ' + f + ' … 新しいファイル（?v=' + n + '）', true);
    return;
  }
  ok('★★ ' + f + ' を直したので、?v= を ' + b + ' → ' + n + ' に上げた',
     n > b, '?v=' + b + ' のままです。このままだと、直しが1台にも届きません');
});

console.log('\n❹ 版番号を上げたのに、中身を直していないもの（念のため）');
let odd = 0;
Object.keys(nowV).forEach(f=>{
  if(baseV[f] !== undefined && nowV[f] > baseV[f] && changed.indexOf(f) < 0){
    console.log('  ⚠️  ' + f + ' … ?v= だけ上がっています（' + baseV[f] + '→' + nowV[f] + '）');
    odd++;
  }
});
ok('★ 版番号だけ上がったものは無い', odd === 0, odd + '件');

console.log('\nPASS='+P+'  FAIL='+F);
process.exit(F?1:0);
