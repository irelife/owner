/* ══════════════════════════════════════════════════════════════════════
 *  下書きの案（案D 和紙／案E 台帳／案F 掌）の、共通の動き
 *
 *  これは見本です。本番の js/app.js ではありません。
 *  クラウドへは、1度も通信していません。
 *
 *  ここで動くもの
 *    ・画面の出し分け（端末の「戻る」も効きます）
 *    ・上の帯の目次／画面の中の札（タブ）に、いまの場所の印
 *    ・パスワードの「目」（2026/10/4 ご指示①③）
 *    ・押したあとの手ごたえ（2026/10/4 ご指示④）
 *    ・しぼり込みの札
 * ══════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  var $ = function(i){ return document.getElementById(i); };
  var SCREENS = [];
  var mains = document.querySelectorAll('main[id^="s-"]');
  for(var i = 0; i < mains.length; i++) SCREENS.push(mains[i].id.slice(2));

  function mark(sel, name){
    var xs = document.querySelectorAll(sel);
    for(var i = 0; i < xs.length; i++){
      if(xs[i].getAttribute('data-go') === name) xs[i].setAttribute('aria-current','page');
      else xs[i].removeAttribute('aria-current');
    }
  }

  function show(name, push){
    if(SCREENS.indexOf(name) < 0) name = SCREENS[0];
    SCREENS.forEach(function(n){ var e = $('s-' + n); if(e) e.hidden = (n !== name); });

    /* ログインの画面では、アプリの顔（バー・札）を出しません */
    var inside = (name !== 'login' && name !== 'reset');
    ['bar','tabs','sheet-b'].forEach(function(id){ var e = $(id); if(e) e.hidden = !inside; });

    mark('.flag-nav button', name);
    mark('.tabs button', name);
    mark('.dock button', name);

    /* ★パスワードは、画面を出すたびに隠れた状態へ戻します（置き忘れ防止） */
    var es = document.querySelectorAll('.eye[aria-pressed=true]');
    for(var j = 0; j < es.length; j++) eye(es[j], false);

    var sc = $('s-' + name);
    if(sc){
      var rs = sc.querySelectorAll('.rise');
      for(var k = 0; k < rs.length; k++){
        rs[k].style.animation = 'none'; void rs[k].offsetWidth; rs[k].style.animation = '';
      }
    }
    window.scrollTo(0, 0);
    if(push !== false){ try{ history.pushState({ s:name }, '', '#' + name); }catch(e){} }
  }

  /* ── パスワードの「目」──────────────────────────
   *  改良前： ●●●● しか出ず、打ち間違いに気づけませんでした。
   *  改良後： 右はしの目で、字を出したり隠したりできます。
   *  ★カーソルの位置を保ちます（末尾へ飛ばさない）。 */
  function eye(btn, on){
    var inp = $(btn.getAttribute('data-eye'));
    if(!inp) return;
    var at = null;
    try{ at = inp.selectionStart; }catch(e){}
    inp.type = on ? 'text' : 'password';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    var lab = on ? 'パスワードを隠す' : 'パスワードを表示する';
    btn.setAttribute('aria-label', lab);
    btn.setAttribute('title', lab);
    var a = btn.querySelector('.e-on'), b = btn.querySelector('.e-off');
    if(a) a.hidden = on;
    if(b) b.hidden = !on;
    if(at !== null && document.activeElement === inp){
      try{ inp.setSelectionRange(at, at); }catch(e){}
    }
  }

  /* ── 押したあとの手ごたえ ──────────────────────
   *  ①押した瞬間に「〜しています…」＋回る輪（二度押し不可）
   *  ②終わったら ✓「〜しました」
   *  ③そのあと、つぎの画面へ */
  document.addEventListener('click', function(ev){
    var b = ev.target.closest && ev.target.closest('[data-act]');
    if(!b || b.disabled) return;
    ev.preventDefault(); ev.stopPropagation();

    var keep = b.innerHTML;
    var wait = b.getAttribute('data-wait') || 'お待ちください';
    var ok   = b.getAttribute('data-ok')   || '承りました';
    var go   = b.getAttribute('data-go');

    b.disabled = true;
    b.setAttribute('aria-busy','true');
    b.innerHTML = '<span class="spin" aria-hidden="true"></span>' + wait + '…';

    /* 本番では、ここがクラウドの返事を待つところです */
    setTimeout(function(){
      b.setAttribute('aria-busy','false');
      b.classList.add('done');
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:17px;height:17px;' +
        'fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;' +
        'stroke-linejoin:round"><path d="M5 13l4 4L19 7"/></svg>' + ok;
      setTimeout(function(){
        b.disabled = false; b.classList.remove('done'); b.innerHTML = keep;
        if(go) show(go, true);
      }, 900);
    }, 850);
  }, true);

  document.addEventListener('click', function(ev){
    var t = ev.target;
    if(!t.closest) return;

    var e = t.closest('.eye');
    if(e){ ev.preventDefault(); eye(e, e.getAttribute('aria-pressed') !== 'true'); return; }

    var g = t.closest('[data-go]');
    if(g){ show(g.getAttribute('data-go'), true); return; }

    if(t.closest('[data-back]')){ history.back(); return; }

    var c = t.closest('.chip');
    if(c){
      var all = c.parentNode.querySelectorAll('.chip');
      for(var i = 0; i < all.length; i++){
        all[i].setAttribute('aria-pressed', all[i] === c ? 'true' : 'false');
      }
    }
  });

  window.addEventListener('popstate', function(ev){
    show((ev.state && ev.state.s) || (location.hash || '').replace('#','') || SCREENS[0], false);
  });

  var first = (location.hash || '').replace('#','');
  show(SCREENS.indexOf(first) >= 0 ? first : (SCREENS.indexOf('home') >= 0 ? 'home' : SCREENS[0]), true);
})();
