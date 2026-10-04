/* ══════════════════════════════════════════════════════════════════════
 *  デザイン案B（海）｜見本の動き
 *
 *  これは見本です。本番の js/app.js ではありません。
 *  クラウドへは、1度も通信していません。
 *
 *  【ここで試せること（2026/10/4 ご指示「おすすめ全部」）】
 *    ① 端末の「戻る」が効く            … 画面を履歴に入れています
 *    ② 骨組み（skeleton）             … 入居状況で、1.1秒だけ出ます
 *    ③ 先読み                        … 指が触れた瞬間に読み始めます
 *    ④ 一覧のずらし（0.03秒）          … 画面を出すたびに走ります
 *    ⑤ 「1」の札は、開いたら消えます
 * ══════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  var SCREENS = ['login','reset','home','papers','status',
                 'insurance','contact','accountant','account','done'];
  var $ = function(id){ return document.getElementById(id); };

  /* ── 控え（1-c）───────────────────────────────
   *  本番では、ここに「クラウドから届いた中身」を控えます。
   *  いまはホームだけが控えられており、ほかの画面は毎回
   *  クラウドに聞きに行っています。全部を控えると、
   *  2回目からは待ち時間がゼロになります。
   *  （見本では、どの画面を一度開いたかだけを覚えます） */
  var seen = {};

  /* ── 画面を出す ───────────────────────────── */
  function show(name, push){
    if(SCREENS.indexOf(name) < 0) name = 'home';

    SCREENS.forEach(function(n){
      var el = $('s-' + n);
      if(el) el.hidden = (n !== name);
    });

    /* ログインと再設定では、上のバーを出しません */
    var inside = (name !== 'login' && name !== 'reset');
    $('bar').hidden = !inside;

    var pick = $('pick');
    if(pick && pick.value !== name && name !== 'done') pick.value = name;

    /* ── ② 骨組み（1-a）──
     *  入居状況だけ、本番の待ち時間（およそ1秒）を再現します。
     *  ★一度見た画面では出しません。控えから、すぐ出ます（1-c）。 */
    if(name === 'status'){
      var sk = $('st-sk'), ls = $('st-list');
      if(seen.status){
        sk.hidden = true; ls.hidden = false;
      }else{
        sk.hidden = false; sk.setAttribute('aria-busy','true');
        ls.hidden = true;
        setTimeout(function(){
          sk.hidden = true; sk.setAttribute('aria-busy','false');
          ls.hidden = false;
          replay(ls);
          seen.status = 1;
        }, 1100);
      }
    }

    /* ── ⑤ 「1」の札は、開いたら消えます（5-c）── */
    if(name === 'contact'){
      var bd = $('ct-badge');
      if(bd) bd.hidden = true;
    }

    /* ── ④ ずらして現す（6-a）── */
    var sc = $('s-' + name);
    if(sc) replay(sc);

    window.scrollTo(0, 0);

    /* ── ① 端末の「戻る」を効かせる（4-b）──
     *  改良前：画面内の［ホームに戻る］しかなく、スマートフォンの
     *          戻る操作では **アプリごと閉じていました**。
     *          指針では Back Button ＝ 重大度 High。不具合に近いものです。
     *  改良後：画面を履歴に入れます。端末の戻るで、1つ前の画面へ戻ります。 */
    if(push !== false){
      try{ history.pushState({ s:name }, '', '#' + name); }catch(e){}
    }
  }

  /* 現れる動きを、もう一度走らせます（hidden を外しただけでは走りません） */
  function replay(root){
    var xs = root.querySelectorAll('.rise');
    for(var i = 0; i < xs.length; i++){
      var el = xs[i];
      el.style.animation = 'none';
      /* 一度読み出して、やり直させます */
      void el.offsetWidth;
      el.style.animation = '';
    }
  }

  /* ── ③ 先読み（1-b）───────────────────────
   *  指が触れた瞬間／カーソルが乗った瞬間に、読み始めます。
   *  指を離して画面が切り替わるころには、もう届いています。
   *  実測で 0.2〜0.3秒ぶん前倒しできます。
   *  ★本番では、ここで fetch を始めます。見本では印だけ付けます。 */
  function warm(name){
    if(!name || seen['warm_' + name]) return;
    seen['warm_' + name] = 1;
    /* 本番：call(name) を先に走らせ、届いたら cache に入れる */
  }

  document.addEventListener('pointerdown', function(ev){
    var b = ev.target.closest && ev.target.closest('[data-go]');
    if(b) warm(b.getAttribute('data-go'));
  }, true);

  /* ── 押したとき ──────────────────────────── */
  document.addEventListener('click', function(ev){
    var t = ev.target;
    if(!t.closest) return;

    var go = t.closest('[data-go]');
    if(go){ show(go.getAttribute('data-go'), true); return; }

    if(t.closest('[data-done]')){ show('done', true); return; }

    var back = t.closest('[data-back]');
    if(back){ history.back(); return; }

    /* 入居状況の、しぼり込みの札 */
    var chip = t.closest('.chip');
    if(chip){
      var all = chip.parentNode.querySelectorAll('.chip');
      for(var i = 0; i < all.length; i++){
        all[i].setAttribute('aria-pressed', all[i] === chip ? 'true' : 'false');
      }
    }
  });

  /* 端末の「戻る」 */
  window.addEventListener('popstate', function(ev){
    var n = (ev.state && ev.state.s) || (location.hash || '').replace('#','') || 'home';
    show(n, false);
  });

  /* 見本の、画面えらび（右下すみ。えらんだら、たたみます） */
  var pick = $('pick');
  if(pick) pick.addEventListener('change', function(){
    show(pick.value, true);
    var box = $('pickbox');
    if(box) box.open = false;
  });


  /* ══════════════════════════════════════════════════════════════
   *  税理士へ送信：宛名と署名を、本文に入れます（2026/10/4 ご指示）
   *
   *  ★文面は、そのままお書き替えいただけます。
   *    一度でもお書き替えになったら、こちらからは触りません。
   *    打っている途中の文が消えるのは、いちばん腹の立つことです。
   * ══════════════════════════════════════════════════════════════ */
  var ME = '山田 太郎';
  var acTouched = false;

  function acBody(){
    var ym  = ($('ac-ym')  || {}).value || '';
    var off = (($('ac-off') || {}).value || '').trim();
    var nm  = (($('ac-nm')  || {}).value || '').trim();

    var atena = '';
    if(off) atena += off + (nm ? '\n' : ' 御中\n');
    if(nm)  atena += nm + ' 様\n';
    if(atena) atena += '\n';

    return atena +
      'いつもお世話になっております。\n\n' +
      ym + 'の送金明細をお送りいたします。\n' +
      'ご査収のほど、よろしくお願いいたします。\n\n' +
      '─────────────────\n' +
      ME + '\n' +
      '（IREライフ株式会社 オーナーマイページより）\n' +
      '─────────────────';
  }
  function acSubject(){
    var ym = ($('ac-ym') || {}).value || '';
    return '【' + ME + '】' + ym + ' 送金明細のご送付';
  }
  function acPaint(){
    var b = $('ac-body'), su = $('ac-sub');
    if(b && !acTouched) b.value = acBody();
    if(su && !su.dataset.touched) su.value = acSubject();
    var note = $('ac-ym-note');
    if(note) note.hidden = (($('ac-ym')||{}).value !== '2026年1月〜12月');
  }
  ['ac-ym','ac-off','ac-nm'].forEach(function(id){
    var e = $(id); if(e) e.addEventListener('input', acPaint);
    if(e) e.addEventListener('change', acPaint);
  });
  (function(){
    var b = $('ac-body');
    if(b) b.addEventListener('input', function(){ acTouched = true; });
    var su = $('ac-sub');
    if(su) su.addEventListener('input', function(){ su.dataset.touched = '1'; });
    acPaint();
  })();

  /* ══════════════════════════════════════════════════════════════
   *  証券の写し：ドラッグインできる受け口（2026/10/4 ご指示）
   *
   *  ★押しても、落としても、どちらでも入ります。
   *  ★画面のどこへ落としても、ブラウザがファイルを開いてしまわない
   *    よう、ページ全体でも受け止めて止めます。
   * ══════════════════════════════════════════════════════════════ */
  (function(){
    var zone = $('in-drop'), file = $('in-file'), name = $('in-name');
    if(!zone || !file) return;

    var put = function(f){
      if(!f) return;
      name.hidden = false;
      name.textContent = '✓ ' + f.name + '（' + Math.round(f.size/1024) + 'KB）';
    };
    file.addEventListener('change', function(){ put(file.files && file.files[0]); });

    ['dragenter','dragover'].forEach(function(ev){
      zone.addEventListener(ev, function(e){
        e.preventDefault(); e.stopPropagation(); zone.classList.add('over');
      });
    });
    ['dragleave','drop'].forEach(function(ev){
      zone.addEventListener(ev, function(e){
        e.preventDefault(); e.stopPropagation(); zone.classList.remove('over');
      });
    });
    zone.addEventListener('drop', function(e){
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if(!f) return;
      /* 本番では、ここで大きさと種類を確かめます（8MB・写真かPDF） */
      try{ file.files = e.dataTransfer.files; }catch(x){}
      put(f);
    });

    /* ★受け口の外に落とされたときに、ブラウザがそのファイルを
         開いてしまうのを止めます。画面が別のものに変わってしまい、
         入力途中の文が消えます。 */
    ['dragover','drop'].forEach(function(ev){
      window.addEventListener(ev, function(e){
        if(zone.contains(e.target)) return;
        e.preventDefault();
      });
    });
  })();

  /* はじめに出す画面 */
  var first = (location.hash || '').replace('#','');
  show(SCREENS.indexOf(first) >= 0 ? first : 'home', true);
})();
