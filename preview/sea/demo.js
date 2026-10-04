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
                 'insurance','contact','accountant','account','look','done'];
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

    /* 上の帯の目次と、下の札に、いまの画面の印をつけます */
    var ns = document.querySelectorAll('.flag-nav button, .dock button');
    for(var i = 0; i < ns.length; i++){
      if(ns[i].getAttribute('data-go') === name) ns[i].setAttribute('aria-current','page');
      else ns[i].removeAttribute('aria-current');
    }

    /* 下の札は、ログインと再設定では出しません（上のバーと同じ扱い） */
    var dk = $('dock');
    if(dk) dk.hidden = !(name !== 'login' && name !== 'reset');

    /* ★パスワードは、画面を出すたびに「隠れた状態」から始めます。
         見えたまま置き忘れる事故を防ぎます（ご指示①③）。 */
    var es = document.querySelectorAll('.eye[aria-pressed=true]');
    for(var j = 0; j < es.length; j++) eye(es[j], false);

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

    /* 見た目の画面を開いたら、丸の選びを、いまの状態に合わせます */
    if(name === 'look' && window.__lookSync) window.__lookSync();

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

  /* ══════════════════════════════════════════════════════════════
   *  パスワードの「目」（2026/10/4 ご指示①③）
   *
   *  改良前： ●●●● しか出ず、打ち間違いに気づけませんでした。
   *          再設定は同じものを2回打ちます。どちらが違うのかも
   *          わかりませんでした。
   *  改良後： 右はしの目で、字を出したり隠したりできます。
   *
   *  ★カーソルの位置（何文字めを打っているか）を保ちます。
   *    type を入れ替えると、カーソルが末尾へ飛ぶ端末があります。
   * ══════════════════════════════════════════════════════════════ */
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
  document.addEventListener('click', function(ev){
    var b = ev.target.closest && ev.target.closest('.eye');
    if(!b) return;
    ev.preventDefault();
    eye(b, b.getAttribute('aria-pressed') !== 'true');
  });

  /* ══════════════════════════════════════════════════════════════
   *  押したあとの手ごたえ（2026/10/4 ご指示④）
   *
   *  改良前： ［設定する］を押しても、画面は何も言わずに変わって
   *          いました。「変わったのか」がわかりませんでした。
   *  改良後： ①押した瞬間に「変更しています」＋回る輪
   *          ②終わったら ✓「変更しました」
   *          ③そのあと、つぎの画面へ進みます
   *  ★二度押しは効きません（disabled にします）。
   *  ★動きを減らす設定の方には、輪を回しません（CSSで止まります）。
   * ══════════════════════════════════════════════════════════════ */
  document.addEventListener('click', function(ev){
    var b = ev.target.closest && ev.target.closest('.cta[data-act]');
    if(!b || b.disabled) return;
    ev.preventDefault();
    ev.stopPropagation();

    var keep = b.innerHTML;
    var wait = b.getAttribute('data-wait') || 'お待ちください';
    var ok   = b.getAttribute('data-ok')   || '承りました';
    var go   = b.getAttribute('data-go');
    var done = b.hasAttribute('data-done');

    b.disabled = true;
    b.setAttribute('aria-busy','true');
    b.innerHTML = '<span class="spin" aria-hidden="true"></span>' + wait + '…';

    /* 本番では、ここがクラウドの返事を待つところです（0.4〜1.2秒ほど） */
    setTimeout(function(){
      b.setAttribute('aria-busy','false');
      b.classList.add('done');
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:18px;height:18px;' +
        'fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;' +
        'stroke-linejoin:round"><path d="M5 13l4 4L19 7"/></svg>' + ok;
      setTimeout(function(){
        b.disabled = false;
        b.classList.remove('done');
        b.innerHTML = keep;
        if(done) show('done', true);
        else if(go) show(go, true);
      }, 900);
    }, 850);
  }, true);


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
    var zone = $('in-drop'), file = $('in-file');
    var shot = $('in-shot'), pic = $('in-pic'),
        nmEl = $('in-nm'), szEl = $('in-sz'), del = $('in-del');
    if(!zone || !file) return;

    /* ★よそのサーバー（CDN）からは読み込みません。
         オーナー様の証券を扱う画面で、外の置き場に頼らないためです。
         中身は preview/lib/pdfjs/ に置いてあります（README.txt に経緯）。 */
    var BASE  = new URL('../lib/pdfjs/', document.currentScript ?
                        document.currentScript.src : location.href);
    var PDFJS = new URL('pdf.min.mjs', BASE).href;
    var PDFWK = new URL('pdf.worker.min.mjs', BASE).href;
    var url = '';   /* いま出している写真の、一時の住所 */

    function clean(){
      if(url){ try{ URL.revokeObjectURL(url); }catch(e){} url = ''; }
    }
    /* 読めなかったときの、紙の形 */
    function paper(){
      pic.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/>' +
        '<path d="M14 3v5h5M9 13h6M9 17h6"/></svg>';
    }

    /* ══════════════════════════════════════════════════════════════
     *  表紙を出す（2026/10/4 ご指示⑤）
     *
     *  改良前： 「✓ 収支報告書 (13).pdf（129KB）」という文字だけ。
     *          名前の似たPDFが並ぶと、取り違えに気づけません。
     *  改良後： 1ページめを、そのまま小さく出します。
     *
     *  ★写真 … そのまま出します（通信なし）
     *  ★PDF  … 1ページめを描きます。描くための道具（pdf.js）は
     *           **PDFを置かれたときに初めて** 読み込みます。
     *           写真しか預けない方には、1バイトも落ちてきません。
     *  ★読めなかったときは、紙の形と名前に戻ります（壊れません）。
     *  ★中身はこの端末の中だけで描いています。どこへも送っていません。
     * ══════════════════════════════════════════════════════════════ */
    function cover(f){
      clean();
      pic.innerHTML = '<span class="shot-wait">表紙をひらいています…</span>';

      if(/^image\//.test(f.type)){
        url = URL.createObjectURL(f);
        var im = new Image();
        im.alt = '';
        im.onload  = function(){ pic.innerHTML = ''; pic.appendChild(im); };
        im.onerror = paper;
        im.src = url;
        return;
      }
      if(f.type !== 'application/pdf'){ paper(); return; }

      f.arrayBuffer().then(function(buf){
        return import(PDFJS).then(function(lib){
          lib.GlobalWorkerOptions.workerSrc = PDFWK;
          /* ★2026-10-04 … 日本語のPDFが真っ白になる不具合を直しました。
               改良前： data だけを渡していました。日本語のPDFは、文字の形を
                       表す cmaps と standard_fonts が無いと、**枠線だけで
                       文字が1つも出ません**（送金明細で実際に起きました）。
               改良後： その置き場所も一緒に渡します。
               ★必要なファイルだけが落ちてきます（数KB〜数十KB）。 */
          return lib.getDocument({
            data               : buf,
            cMapUrl            : new URL('cmaps/', BASE).href,
            cMapPacked         : true,
            standardFontDataUrl: new URL('standard_fonts/', BASE).href
          }).promise;
        });
      }).then(function(doc){
        return doc.getPage(1);
      }).then(function(pg){
        var w = 152, vp0 = pg.getViewport({ scale:1 });
        var vp = pg.getViewport({ scale: w / vp0.width });
        var cv = document.createElement('canvas');
        cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
        return pg.render({ canvasContext: cv.getContext('2d'), viewport: vp })
                 .promise.then(function(){ pic.innerHTML = ''; pic.appendChild(cv); });
      }).catch(paper);
    }

    var put = function(f){
      if(!f) return;
      shot.hidden = false;
      nmEl.textContent = f.name;
      szEl.textContent = (f.size < 1024*1024)
        ? Math.round(f.size/1024) + 'KB'
        : (f.size/1024/1024).toFixed(1) + 'MB';
      cover(f);
    };
    file.addEventListener('change', function(){ put(file.files && file.files[0]); });

    if(del) del.addEventListener('click', function(){
      clean(); file.value = ''; shot.hidden = true; pic.innerHTML = '';
      try{ zone.focus(); }catch(e){}
    });

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

  /* ══════════════════════════════════════════════════════════════
   *  見た目のえらび（2026/10/4 ご指示「ユーザーが決められるように」）
   *
   *  改良前： 色も、文字の大きさも、一覧の出しかたも、こちらで決めた
   *          1とおりだけでした。暗い画面がお苦手な方、字が小さくて
   *          お困りの方には、どうにもできませんでした。
   *  改良後： オーナー様がお選びになれます。押したその場で変わります。
   *
   *  ★中身（HTML）は1つのままです。変わるのは <html> の印だけです。
   *    だから、今後の直しは1回で済みます（4とおり作ると4回になります）。
   *  ★本番では、この控えをオーナー様の控えに入れて、どの端末でも
   *    同じ見えかたにします（表に1列足すだけで済みます）。
   * ══════════════════════════════════════════════════════════════ */
  (function(){
    var KEYS = {
      theme : ['umi','ai','kami','cho','sumi'],
      font  : ['mincho','gothic'],
      size  : ['m','l','xl'],
      list  : ['card','table'],
      nav   : ['bar','dock'],
      skin  : ['sea','flat']
    };
    var d = document.documentElement;

    function put(k, v){
      if(KEYS[k].indexOf(v) < 0) v = KEYS[k][0];
      d.setAttribute('data-' + k, v);
      try{ localStorage.setItem('look.' + k, v); }catch(e){}
    }
    /* いまの状態を、丸の選びに写します（画面を開くたび）
       ★選ばれている行の囲みは CSS の :has で描いていますが、
         古い Firefox には :has がありません。印が丸だけになって
         しまうので、JavaScript でも同じ印（.on）を付けます。 */
    function sync(){
      Object.keys(KEYS).forEach(function(k){
        var now = d.getAttribute('data-' + k) || KEYS[k][0];
        var r = document.querySelector('input[name="' + k + '"][value="' + now + '"]');
        if(r) r.checked = true;
      });
      var opts = document.querySelectorAll('.opt');
      for(var i = 0; i < opts.length; i++){
        var inp = opts[i].querySelector('input');
        opts[i].classList.toggle('on', !!(inp && inp.checked));
      }
    }
    document.addEventListener('change', function(ev){
      var t = ev.target;
      if(t && t.name && KEYS[t.name] && t.type === 'radio'){ put(t.name, t.value); sync(); }
    });
    var rs = $('look-reset');
    if(rs) rs.addEventListener('click', function(){
      Object.keys(KEYS).forEach(function(k){
        try{ localStorage.removeItem('look.' + k); }catch(e){}
        d.setAttribute('data-' + k, KEYS[k][0]);
      });
      sync();
    });
    window.__lookSync = sync;
    sync();
  })();

  /* はじめに出す画面 */
  var first = (location.hash || '').replace('#','');
  show(SCREENS.indexOf(first) >= 0 ? first : 'home', true);
})();
