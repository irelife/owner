/* ============================================================
 *  オーナーマイページ  本体
 *
 *  ★ この画面が持つもの
 *      ・入館証（token）  … ログインの証。14日で切れます
 *    それだけです。
 *
 *  ★ この画面が持たないもの
 *      ・パスワード      … 送るだけで、どこにも残しません
 *      ・ほかのオーナー様の情報
 *                        … 画面で隠すのではなく、そもそも届きません
 *
 *  ★ Apps Script とのやりとり
 *    text/plain で送ります。application/json にすると
 *    ブラウザが先に「許可を聞く通信」を投げ、Apps Script が
 *    それに答えられずに失敗します。
 * ============================================================ */
(function(){
  'use strict';

  var CFG   = window.APP_CONFIG || {};
  var TKEY  = 'ire_owner_token';
  var MKEY  = 'ire_owner_mail';      /* ログインに使ったアドレス。この端末の中だけ */
  var HKEY  = 'ire_owner_home';      /* 前回のホームの中身。この端末の中だけ */
  var THKEY = 'ire_owner_theme';     /* 配色。この端末の中だけ */
  var token = '';
  var me    = null;     /* { name, atena } */
  var cache = {};       /* 画面ごとの読み込み結果 */

  /* ── 小道具 ───────────────────────────────── */
  function $(id){ return document.getElementById(id); }
  function esc(s){
    return String(s == null ? '' : s)
      .replace(/[&<>"]/g, function(c){
        return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c];
      });
  }
  function yen(n){
    var v = Number(n);
    if(!isFinite(v)) return '—';
    return v.toLocaleString('ja-JP');
  }
  function toast(msg){
    var t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._h);
    toast._h = setTimeout(function(){ t.hidden = true; }, 2600);
  }
  /* ★二重で呼ばれても壊れないようにします。
   *  前は2回目に「送信中…」を元の字として覚えてしまい、
   *  戻しても「送信中…」のままになっていました。 */
  function busy(btn, on, label){
    if(!btn) return;
    btn.disabled = !!on;
    if(on){
      if(btn.dataset.busy !== '1'){
        btn.dataset.label = btn.textContent;
        btn.dataset.busy  = '1';
      }
      btn.textContent = label || '送信中…';
    }else{
      if(btn.dataset.label) btn.textContent = btn.dataset.label;
      btn.dataset.busy = '';
    }
  }
  function say(el, text, ok){
    if(!el) return;
    el.textContent = text || '';
    el.classList.toggle('ok', !!ok);
  }

  /* ── Apps Script へ送る ───────────────────── */
  function call(action, data){
    var url = CFG.GAS_URL || '';
    if(!url || url.indexOf('script.google.com') < 0){
      return Promise.reject(new Error('設定が完了していません。担当者へご連絡ください。'));
    }
    var body = Object.assign({ action: action }, data || {});
    return fetch(url, {
      method : 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body   : JSON.stringify(body)
    })
    .then(function(r){ return r.json(); })
    .then(function(r){
      if(r && r.ok) return r;
      var e = new Error((r && r.message) || '処理できませんでした。');
      e.code = (r && r.error) || '';
      throw e;
    })
    .catch(function(e){
      if(e && e.code) throw e;
      var e2 = new Error('通信に失敗しました。通信環境をご確認のうえ、もう一度お試しください。');
      e2.code = 'net';
      throw e2;
    });
  }

  /* 入館証つきで送ります。
   *
   *  【改良前】 どの窓口でも、入館証が通らなければ logout(true) を呼んで
   *            いました。quiet=true なので**何も出ないまま**ログイン画面へ
   *            戻ります。しかもホームは home・status・papers の3つを
   *            同時に叩き、status と papers の失敗は呼び出し側が
   *            握りつぶすので、メッセージすら残りませんでした。
   *            → ログインした直後に、無言でログイン画面へ戻る。
   *              1つの窓口の不具合で、ログインごと弾かれていました。
   *
   *  【改良後】 ・戻すときは、理由を必ずログイン画面に出します
   *            ・ついでに読むもの（quiet）は、戻しません
   *            ・どの窓口で起きたかを console に残します（原因さがし用）
   */
  function auth(action, data, quiet){
    return call(action, Object.assign({ token: token }, data || {}))
      .catch(function(e){
        if(e.code === 'auth'){
          try{
            console.warn('[マイページ] 認証に失敗しました： ' + action);
          }catch(x){}
          if(quiet) throw e;                 /* ついでに読むものは、戻しません */
          kick('ログインの有効期限が切れました。' +
               'お手数ですが、再度ログインしてください。');
          throw new Error('ログインの有効期限が切れました。');
        }
        throw e;
      });
  }

  /* 入館証が通らなかったときだけ。理由を必ず画面に出します。 */
  function kick(reason){
    logout(true);
    say($('li-msg'), reason);
  }

  /* ── 画面の出し入れ ───────────────────────── */
  var SCREENS = ['login','forgot','newpass','home','status','papers',
                 'works','insurance','contact','accountant','account'];
  var AFTER_LOGIN = { home:1, status:1, papers:1, works:1, insurance:1,
                      contact:1, accountant:1, account:1 };

  function show(name){
    SCREENS.forEach(function(n){
      var el = $('s-' + n);
      if(el) el.hidden = (n !== name);
    });
    $('app').hidden = !AFTER_LOGIN[name];
    $('menu').hidden = true;
    $('boot').hidden = true;
    eyeReset();
    window.scrollTo(0, 0);
    if(name === 'home')    loadHome();
    if(name === 'status')  loadStatus();
    if(name === 'papers')  loadPapers();
    if(name === 'contact') loadContact();
    if(name === 'accountant') loadAcc();
    if(name === 'works')     loadWorks();
    if(name === 'insurance') loadIns();
    if(name === 'account')   loadAccount();
  }

  document.addEventListener('click', function(ev){
    var b = ev.target.closest('[data-go]');
    if(!b) return;
    var to = b.getAttribute('data-go');
    if(to === 'newpass'){ openChangePass(); return; }
    show(to);
  });

  /* ── ログイン ─────────────────────────────── */
  $('f-login').addEventListener('submit', function(ev){
    ev.preventDefault();
    var mail = ($('li-mail').value || '').trim();
    var pass = $('li-pass').value || '';
    var msg  = $('li-msg');
    if(!mail || !pass){ say(msg, 'メールアドレスとパスワードをご入力ください。'); return; }

    busy($('li-go'), true, '確認中…');
    say(msg, '');
    call('login', { email: mail, pass: pass })
      .then(function(r){
        $('li-pass').value = '';          /* 画面にも残しません */
        token = r.token || '';
        me    = r.owner || null;
        /* ★入館証が来ていなければ、ここで気づけるようにします。
         *  改良前は token が空のまま先へ進み、次の窓口で
         *  「入館証が違う」と言われてログイン画面へ戻っていました。 */
        if(!token){
          say(msg, 'ログインは完了しましたが、認証情報を取得できませんでした。' +
                   'お手数ですが、担当者へご連絡ください。');
          return;
        }
        /* ══════════════════════════════════════════
         *  ★login が中身も返してきたら、そのまま控えに入れます。
         *
         *  なぜ： Apps Script は同じ利用者の呼び出しを、順番に1つずつ
         *    処理します。ログインのあと home／status／papers／talks を
         *    呼ぶと、4つぶん待つことになります。実測でこうでした。
         *
         *      いま                 数字 3.1秒 ／ グラフ 6.1秒 ／ 通信4回
         *      login が中身も返す   数字 1.6秒 ／ グラフ 1.6秒 ／ 通信1回
         *
         *  ★GAS がまだ返してこないときは、ここは何もしません。
         *    今までどおり4回呼びます。だから先に入れても壊れません。
         *  ★load〇〇 は控えがあればそれを使うので、これだけで効きます。
         * ══════════════════════════════════════════ */
        if(r.home){   cache.home   = r.home;   homeKeep(r.home); }
        if(r.status){ cache.status = r.status; }
        if(r.papers){ cache.papers = r.papers; }
        if(r.talks){  cache.talks  = Array.isArray(r.talks) ? r.talks
                                     : (r.talks.list || []); }

        try{ localStorage.setItem(TKEY, token); }catch(e){}
        /* ★マイアカウントでお見せするため、アドレスも控えます。
         *   me 窓口はお名前と宛名しか返さないためです。
         *   ログアウトのときに消します。 */
        try{ localStorage.setItem(MKEY, mail); }catch(e){}
        paintName();
        if(r.mustChange){ openChangePass(true); return; }
        show('home');
      })
      .catch(function(e){ say(msg, e.message); })
      .then(function(){ busy($('li-go'), false); });
  });

  $('li-forgot').addEventListener('click', function(){
    $('fg-mail').value = ($('li-mail').value || '').trim();
    say($('fg-msg'), '');
    show('forgot');
  });

  /* ── パスワードをお忘れの方 ───────────────── */
  $('f-forgot').addEventListener('submit', function(ev){
    ev.preventDefault();
    var mail = ($('fg-mail').value || '').trim();
    var msg  = $('fg-msg');
    if(!mail){ say(msg, 'メールアドレスをご入力ください。'); return; }
    busy($('fg-go'), true);
    /* ★ 登録が有る／無いを答え分けません。
         「このメールは登録されていません」と返すと、
         どのアドレスが登録済みかを外から調べられてしまいます。 */
    call('forgot', { email: mail })
      .then(function(){
        /* ★送れたことがはっきり分かるよう、画面を戻します。
             同じ画面に小さく字が出るだけだと、送れたのか
             分からず、何度も押すことになります。 */
        say(msg, '');
        $('fg-mail').value = '';
        show('login');
        toast('再設定のご案内をお送りしました。メールをご確認ください。');
      })
      .catch(function(e){ say(msg, e.message); })
      .then(function(){ busy($('fg-go'), false); });
  });

  /* ── パスワードの変更 ─────────────────────── */
  var _mustChange = false;
  function openChangePass(must){
    _mustChange = !!must;
    $('np-cur-wrap').hidden = false;
    $('np-sub').textContent = must
      ? '初回ログインです。新しいパスワードをご設定ください。'
      : '新しいパスワードをご設定ください。';
    $('np-cur').value = ''; $('np-a').value = ''; $('np-b').value = '';
    say($('np-msg'), '');
    show('newpass');
  }

  /* ★パスワードの変更は、初回の画面とマイアカウントの2か所にあります。
   *   処理はこの1つだけにしてあります。2つ書くと、片方だけ直して
   *   食い違うためです。 */
  function passSubmit(p){
    var cur = $(p.cur).value || '';
    var a   = $(p.a).value   || '';
    var b   = $(p.b).value   || '';
    var msg = $(p.msg);
    if(a.length < 8){ say(msg, '新しいパスワードは8文字以上でご設定ください。'); return; }
    if(a !== b){ say(msg, '新しいパスワードが一致しません。ご確認ください。'); return; }
    if(a === cur){ say(msg, '現在のパスワードと同じものはご使用になれません。'); return; }

    busy($(p.go), true, '変更中…');
    auth('changePass', { cur: cur, next: a })
      .then(function(){
        $(p.cur).value = ''; $(p.a).value = ''; $(p.b).value = '';
        say(msg, '');
        toast('パスワードを変更しました');
        if(p.done) p.done();
      })
      .catch(function(e){ say(msg, e.message); })
      .then(function(){ busy($(p.go), false); });
  }

  $('f-newpass').addEventListener('submit', function(ev){
    ev.preventDefault();
    passSubmit({ cur:'np-cur', a:'np-a', b:'np-b', msg:'np-msg', go:'np-go',
                 done:function(){ show('home'); } });
  });

  /* ── ホーム ───────────────────────────────── */
  /* ══════════════════════════════════════════════
   *  ホームの出しかた
   *
   *  ★2026/9/23 まで、ログインのあと 4つの窓口（home／status／papers／
   *    talks）を一度に呼んでいました。Apps Script は同じ利用者の呼び出しを
   *    順番に1つずつ処理するため、4つぶん待つことになり、
   *    「数字がしばらく出ない」状態でした。
   *
   *  ★2つ直します。
   *    ① 前回の中身をこの端末に控え、押した瞬間に出す（待たせない）
   *    ② 図と件数は、ホームの数字が出てから読む（先を争わせない）
   *
   *  ★控えはこの端末の中だけです。ログアウトで消します。
   *    本当に速くするには、4つを1つにまとめる窓口（boot）が要ります。
   * ══════════════════════════════════════════════ */
  function homeSaved(){
    try{ return JSON.parse(localStorage.getItem(HKEY) || 'null'); }catch(e){ return null; }
  }
  function homeKeep(r){
    try{ localStorage.setItem(HKEY, JSON.stringify(r)); }catch(e){}
  }

  function loadHome(){
    var after = function(){ loadMoves(); loadChart(); loadCt(); };

    if(cache.home){ paintHome(cache.home); after(); return; }

    /* ★まず控えを出します。通信を待ちません。 */
    var old = homeSaved();
    var shown = false;
    if(old){
      paintHome(old);
      shown = true;
      var w = $('hm-stale');
      if(w) w.hidden = false;
    }

    auth('home')
      .then(function(r){
        cache.home = r;
        homeKeep(r);
        paintHome(r);
        var w = $('hm-stale');
        if(w) w.hidden = true;
      })
      .catch(function(e){
        /* 控えを出せているなら、黙って置いておきます */
        if(!shown) toast(e.message);
      })
      /* ★図と件数は、ホームが返ってから読みます。
       *   同時に投げると、Apps Script の順番待ちで数字が遅くなります。 */
      .then(after);
  }

  function paintHome(r){
    $('hm-month').textContent = r.month ? (r.month + '分') : '';
    $('hm-date').textContent  = r.sokinDate ? (r.sokinDate + ' お振込予定') : 'お振込予定';
    $('hm-total').textContent = (r.total == null) ? '—' : ('\u00a5' + yen(r.total));

    var rows = Array.isArray(r.rows) ? r.rows : [];
    $('hm-rows').innerHTML = rows.map(function(x){
      var minus = Number(x.amount) < 0;
      return '<div class="row' + (minus ? ' minus' : '') + '">' +
             '<span>' + esc(x.label) + '</span>' +
             '<span>' + (minus ? '−' : '') + esc(yen(Math.abs(x.amount))) + '</span></div>';
    }).join('');

    $('hm-pdf').hidden = !r.pdfId;
    $('hm-pdf').onclick = function(){ openPdf(r.pdfId, $('hm-pdf')); };

    var props = Array.isArray(r.props) ? r.props : [];
    $('hm-props').innerHTML = props.length
      ? props.map(function(p){
          return '<div class="item"><span class="t">' + esc(p.name) + '</span>' +
                 '<span class="s">' + esc(p.note || '') + '</span></div>';
        }).join('')
      : '<div class="empty">物件情報がまだ登録されていません。</div>';
  }

  /* 今月の動きは、物件名・お部屋まで出したいので入居状況の中身を使います。
   * home が返す moves は件数だけのためです。 */
  function loadMoves(){
    if(cache.status){ paintMoves(cache.status); return; }
    $('hm-moves').innerHTML = '<div class="empty">読み込んでいます…</div>';
    /* ★ quiet。ここは「ホームのついで」なので、失敗しても
     *   ログイン画面へ戻しません（戻すと、入居状況の窓口の不具合だけで
     *   ログインできなくなります）。 */
    auth('status', null, true)
      .then(function(r){ cache.status = r; paintMoves(r); })
      .catch(function(){ paintMoves(null); });
  }

  function paintMoves(r){
    var out = '';
    if(r){
      out += mvRows(r.newc,  '新規契約', 'new');
      out += mvRows(r.yotei, '解約予定', 'out');
    }
    /* ★ 見本と同じく、入退去の予定があるときだけ見出しごと出します。
     *   「ございません」とだけ書かれた箱は、置かないことにしました。 */
    $('hm-moves-wrap').hidden = !out;
    if(!out) return;
    $('hm-moves').innerHTML = out;
    Array.prototype.forEach.call($('hm-moves').querySelectorAll('.mv'), function(el){
      el.addEventListener('click', function(){ show('status'); });
    });
  }

  function mvRows(list, label, kind){
    if(!Array.isArray(list)) return '';
    return list.map(function(x){
      /* ★ 2026-09-23 直し。
       *  【改良前】 tag と detail を両方つないで出していました。
       *            解約予定のとき tag は日付、detail は
       *            「2026年09月30日 解約予定です。」なので、
       *            「2026年9月30日　2026年09月30日 解約予定です。」と
       *            **同じ日付が2回**出ていました。
       *  【改良後】 入居状況の画面と同じ道具（stWho）を使います。
       *            → 「契約終了 2026年9月30日」の1行になります。
       *            ★2か所で別の書きかたをすると、片方だけ直り続けます。 */
      var who = stWho({ kind:label, tenant:x.tenant, end:x.end,
                        start:x.start, tag:x.tag, detail:x.detail });
      return '<button type="button" class="mv">' +
        '<span class="mv-l">' +
          '<span class="mv-t">' + esc(x.place) + '</span>' +
          (who && who !== '—'
            ? '<span class="mv-s">' + esc(who) + '</span>' : '') +
        '</span>' +
        '<span class="st-tag ' + kind + '">' + esc(label) + '</span>' +
      '</button>';
    }).join('');
  }

  /* ── 入居状況 ─────────────────────────────── */
  function loadStatus(){
    if(cache.status){ paintStatus(cache.status); return; }
    $('st-body').innerHTML = '<div class="empty">読み込んでいます…</div>';
    auth('status')
      .then(function(r){ cache.status = r; paintStatus(r); })
      .catch(function(e){
        $('st-body').innerHTML = '<div class="empty">' + esc(e.message) + '</div>';
      });
  }

  /* ===== 検査できる道具（tests/tst.cjs が読みます）ここから =====
   *  ★この塊は、下の「火災保険」の塊にある insDue / insDays を
   *    使います。tests/tst.cjs は、2つの塊をつないで読み込みます。
   *
   *  いただいた React（base44）版 Status.jsx から、
   *  「物件ごとにまとめる」仕様を取り込みました。
   *  あわせて、2026/9/22 にお決めいただいた
   *  「解約予定日が過ぎた部屋は募集中に変える」を入れています。 */

  /* 1件を、物件名と部屋に分けます。
   *   ① サーバーが prop / room を返していれば、それを使います
   *   ② 返していなければ、place（「カルムコート東棟 201号室」）を分けます
   *
   *  ★「…号室」の形があるときだけ分けます。
   *    空白だけで切ると、「グロリオサ 東棟」の「東棟」が
   *    部屋になってしまいます。推測で部屋番号を作りません。 */
  function stSplit(x){
    var prop = (x && x.prop != null) ? String(x.prop).trim() : '';
    var room = (x && x.room != null) ? String(x.room).trim() : '';
    if(prop) return { prop:prop, room:room };

    var place = (x && x.place != null) ? String(x.place).trim() : '';
    if(!place) return { prop:'', room:'' };

    var m = place.match(
      /^(.+?)[\s\u3000]*([0-9\uff10-\uff19A-Za-z\uff21-\uff3a\uff41-\uff5a][0-9\uff10-\uff19A-Za-z\uff21-\uff3a\uff41-\uff5a\-\u2015\u30fc]*\u53f7\u5ba4)$/);
    if(m) return { prop:m[1].replace(/[\s\u3000]+$/, ''), room:m[2] };
    return { prop:place, room:'' };
  }

  /* 部屋番号から数を取り出します（「10号室」が「2号室」より
   *  前に来ないようにするためです）。 */
  function stRoomNo(room){
    var v = String(room == null ? '' : room);
    try{ if(v.normalize) v = v.normalize('NFKC'); }catch(e){}
    var m = v.match(/\d+/);
    return m ? Number(m[0]) : Number.POSITIVE_INFINITY;
  }

  /* 解約予定の日付は tag に入ってくることが多いですが、
   *  detail 側にしかないこともあるので、読めたほうを使います。 */
  function stDueOf(x){
    if(!x) return '';
    if(insDue(x.tag))    return String(x.tag);
    if(insDue(x.detail)) return String(x.detail);
    return '';
  }

  /* ★ 2026/9/22 お決めいただいたこと
   *   解約予定日が過ぎた部屋は、「募集中」として扱います。
   *   過ぎても「解約予定」のまま出続けると、時間が経つほど
   *   画面が信用できなくなるためです。
   *   日付が読めないときは、動かしません（推測しません）。 */
  function stPast(x, today){
    var n = insDays(stDueOf(x), today);
    return (n != null && n < 0);
  }

  /* ★見本（base44）の Status.jsx は、1部屋につき
   *    ①号室 ②入居者名 ｜ 契約終了日 ③賃料／月 の3段で出しています。
   *    こちらに合わせます（2026-09-23 ご指示）。
   *
   *  ★ただし、入居者名・契約終了日・賃料は、Apps Script が
   *    返してきたものだけを出します。
   *    返ってきていないものは「—」のままにします。
   *    お金や契約の日付を、こちらで組み立てることはしません。 */

  /* 「62,000円／月」のような、賃料だけの文字かどうかを見ます。 */
  function stIsRent(s){
    var v = String(s == null ? '' : s).trim();
    if(!v) return false;
    try{ if(v.normalize) v = v.normalize('NFKC').replace(/\uff65/g, ''); }catch(e){}
    return /^[¥￥]?[0-9,]+\s*円?\s*[\/／]\s*月$/.test(v);
  }

  /* 賃料を「¥110,000/月」の書きかたにそろえます。
   *  ★数そのものは、いっさい変えません。
   *    取り出した数字を組み直したものが、元の数字と1字でも違えば、
   *    そろえるのをやめて、来たままの文字を出します。
   *    （「007」のような形を、勝手に「7」にしてしまわないためです。） */
  function stYenMonth(s){
    var v = String(s == null ? '' : s).trim();
    if(!v) return '';
    try{ if(v.normalize) v = v.normalize('NFKC'); }catch(e){}
    var m = v.match(/([0-9][0-9,]*)/);
    if(!m) return '';
    var d = m[1].replace(/,/g, '');
    if(!/^[0-9]+$/.test(d)) return '';
    var n = Number(d);
    if(!isFinite(n) || String(n) !== d) return '';
    return '¥' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '/月';
  }

  /* 賃料の行。
   *   ① rent が来ていれば、それを使います
   *   ② rent が無くても、detail が賃料だけの文字なら、それを賃料として使います
   *      （いまの台帳は、そこに入っているためです）
   *   ③ それ以外は空（行そのものを出しません）
   *
   *  ★見本（base44）と同じ「¥110,000/月」にそろえます。
   *    そろえる前は「¥130,000/月」と「110,000円／月」が
   *    同じ画面に並んでいて、そろっていませんでした。 */
  function stRent(u){
    if(!u) return '';
    var v = (u.rent == null) ? '' : String(u.rent).trim();
    if(v){
      if(/^[0-9,]+$/.test(v) || stIsRent(v)) return stYenMonth(v) || v;
      return v;                              /* 賃料と読めない文字は、触りません */
    }
    var d = (u.detail == null) ? '' : String(u.detail).trim();
    if(stIsRent(d)) return stYenMonth(d) || d;
    return '';
  }

  /* 「2026年10月31日」「2026/10/31」のように、日付だけかを見ます。 */
  function stOnlyDate(s){
    var v = String(s == null ? '' : s).trim();
    if(!v) return false;
    try{ if(v.normalize) v = v.normalize('NFKC'); }catch(e){}
    return /^\d{4}\s*[年\/\-\.]\s*\d{1,2}\s*[月\/\-\.]\s*\d{1,2}\s*日?$/.test(v);
  }

  /* 入居者名と契約終了日の行。
   *  ★どちらも無いときは「—」です（見本も、募集中の部屋は「—」です）。 */
  function stWho(u){
    if(!u) return '—';
    var a = [];
    var t = (u.tenant == null) ? '' : String(u.tenant).trim();
    var e = (u.end    == null) ? '' : String(u.end).trim();
    var b = (u.start  == null) ? '' : String(u.start).trim();
    if(t) a.push(t);
    /* ★契約終了日があればそちらを。無ければご入居日を出します。
         両方出すと1行が長くなり、大事な「いつまで」が読みにくくなります。 */
    if(e)      a.push('契約終了 ' + e);
    else if(b) a.push('ご入居 ' + b);
    if(a.length) return a.join('　｜　');

    /* Apps Script がまだ分けて返していないとき。
       いままでどおり detail を出します。ただし賃料だけの文字は、
       下の賃料の行に回すので、ここでは出しません（二重になるため）。 */
    var d = (u.detail == null) ? '' : String(u.detail).trim();
    if(d && !stIsRent(d)) return d;

    /* 解約予定で、日付が tag にしか入っていないとき。
       ★tag が「日付だけ」のときは「契約終了」を付けます。
         解約予定日は、契約が終わる日そのものです。
         日付のほかに字が混ざっているものは、そのまま出します
         （「2026/10/31 解約予定です。」を書き替えないためです）。 */
    var g = (u.tag == null) ? '' : String(u.tag).trim();
    if(u.kind === '解約予定' && g && g !== u.kind){
      return stOnlyDate(g) ? ('契約終了 ' + g) : g;
    }
    /* ★新規契約の tag は、いまは「新規」という字です。
         日付が入ってきたときだけ「ご入居」を付けます。
         「新規」をそのまま出すと、右の札と同じ字が2つ並びます。 */
    if(u.kind === '新規契約' && stOnlyDate(g)) return 'ご入居 ' + g;
    return '—';
  }

  var ST_ORDER = { '募集中':0, '解約予定':1, '新規契約':2 };

  /* 物件ごとにまとめます。
   *   並び：物件名の無い箱はいちばん下。それ以外は名前順。
   *           部屋は 募集中 → 解約予定 → 新規契約、同じなら号室順。 */
  function stGroup(r, today){
    var map = {}, order = [];

    function add(x, kind, moved, movedDate){
      var s = stSplit(x);
      var key = s.prop;
      if(!map[key]){ map[key] = { name:s.prop, rooms:[] }; order.push(key); }
      map[key].rooms.push({
        kind  : kind,
        room  : s.room,
        place : (x && x.place)  ? String(x.place)  : '',
        tag   : (x && x.tag)    ? String(x.tag)    : '',
        detail: (x && x.detail) ? String(x.detail) : '',
        /* ★Apps Script が返してきたときだけ入ります（無ければ空） */
        tenant: (x && x.tenant != null) ? String(x.tenant) : '',
        end   : (x && x.end    != null) ? String(x.end)    : '',
        start : (x && x.start  != null) ? String(x.start)  : '',
        rent  : (x && x.rent   != null) ? String(x.rent)   : '',
        moved : !!moved,
        movedDate : movedDate || ''
      });
    }

    (Array.isArray(r && r.newc)  ? r.newc  : []).forEach(function(x){
      add(x, '新規契約');
    });
    (Array.isArray(r && r.yotei) ? r.yotei : []).forEach(function(x){
      if(stPast(x, today)) add(x, '募集中', true, insYmd(stDueOf(x)));
      else                 add(x, '解約予定');
    });
    (Array.isArray(r && r.boshu) ? r.boshu : []).forEach(function(x){
      add(x, '募集中');
    });

    var boxes = order.map(function(k){ return map[k]; });
    boxes.forEach(function(g){
      g.rooms.sort(function(a, b){
        if(ST_ORDER[a.kind] !== ST_ORDER[b.kind]){
          return ST_ORDER[a.kind] - ST_ORDER[b.kind];
        }
        var ra = stRoomNo(a.room), rb = stRoomNo(b.room);
        if(ra !== rb) return ra - rb;
        return String(a.room).localeCompare(String(b.room), 'ja');
      });
    });
    boxes.sort(function(a, b){
      var ae = !a.name, be = !b.name;
      if(ae !== be) return ae ? 1 : -1;
      return String(a.name).localeCompare(String(b.name), 'ja');
    });
    return boxes;
  }

  /* いちばん上の、まとめの一行を作ります。 */
  function stSum(boxes){
    var c = { '募集中':0, '解約予定':0, '新規契約':0 };
    (boxes || []).forEach(function(g){
      (g.rooms || []).forEach(function(u){ if(c[u.kind] != null) c[u.kind]++; });
    });
    var t = ['募集中', '解約予定', '新規契約']
      .filter(function(k){ return c[k] > 0; })
      .map(function(k){ return k + ' ' + c[k] + '室'; });
    return t.join('　／　');
  }
  /* ===== 検査できる道具（入居状況）ここまで ===== */

  var ST_CLASS = { '新規契約':'new', '解約予定':'out', '募集中':'rec' };

  /* 【改良前】状態ごと（新規契約／解約予定／募集中）に縦に並び、
   *           物件を横断して混ざっていました。
   *  【改良後】物件ごとにまとめ、先頭にまとめの一行を出します。 */
  function paintStatus(r){
    $('st-month').textContent = r.month ? (r.month + '分') : '';

    var boxes = stGroup(r);
    var sum   = stSum(boxes);
    var out   = '';

    if(sum){
      out += '<p class="st-sum" role="status">' + esc(sum) +
             '</p>';
    }

    out += boxes.map(function(g){
      return '<section class="st-prop">' +
        '<h2 class="st-pn">' +
          esc(g.name || '物件名未設定') +
        '</h2>' +
        g.rooms.map(function(u){
          var kind = ST_CLASS[u.kind] || 'rec';
          var head = u.room || u.place || '—';
          /* 【改良前】号室の下に、tag と detail を1行につないで出していました
           *           （「2026年10月31日　62,000円／月」）。
           *  【改良後】見本（base44）と同じ3段にします。
           *           ① 号室 ② 入居者名 ｜ 契約終了日 ③ 賃料／月 */
          var who  = stWho(u);
          var rent = stRent(u);
          return '<div class="stat ' + kind + '">' +
            '<div class="st-h">' +
              '<span class="st-t">' + esc(head) + '</span>' +
              '<span class="st-tag ' + kind + '">' + esc(u.kind) + '</span>' +
            '</div>' +
            '<span class="st-d">' + esc(who) + '</span>' +
            (rent ? '<span class="st-r">' + esc(rent) + '</span>' : '') +
            /* 過ぎて募集中にしたものは、その理由を出します。
               黙って差し替えると、何が起きたのか分からなくなるためです。 */
            (u.moved ? '<span class="st-w">解約予定日（' + esc(u.movedDate) +
                       '）を過ぎたため、募集中としております。</span>' : '') +
          '</div>';
        }).join('') +
      '</section>';
    }).join('');

    $('st-body').innerHTML = out ||
      '<div class="empty">今月、入退去の予定はございません。</div>';

    var has = !!(r.message && String(r.message).trim());
    $('st-letter').hidden = !has;
    if(has) $('st-msg').textContent = r.message;
  }

  /* ── 過去の明細 ───────────────────────────── */
  /* ★ ホームの「年間の収支」と、この画面は同じ中身を使います。
   *   読むのは一度だけにして、二度目からは覚えたものを使います。 */
  function getPapers(quiet){
    if(cache.papers) return Promise.resolve(cache.papers);
    return auth('papers', null, quiet).then(function(r){ cache.papers = r; return r; });
  }

  function loadPapers(){
    if(cache.papers){ paintPapers(cache.papers); return; }
    $('pp-body').innerHTML = '<div class="empty">読み込んでいます…</div>';
    getPapers()
      .then(paintPapers)
      .catch(function(e){
        $('pp-body').innerHTML = '<div class="empty">' + esc(e.message) + '</div>';
      });
  }

  /* ── 送金明細 ─────────────────────────────
   * いちばん新しい1件を大きく、そのつぎの3か月を横に3枚、
   * それより前は月えらびから出します。
   * 【改良前】年ごとの見出しの下に、全部の月が縦に並ぶだけでした。
   * 【改良後】いちばん見たい「今月」が、開いた形で先頭に出ます。 */
  /* ===== 検査できる道具（tests/tpp.cjs が読みます）ここから =====
   *  いただいた React（base44）版の Papers.jsx から、
   *  仕様として良いところだけを取り込みました。
   *    ・月で並べ替える（React 版の parseMonth のかわり）
   *    ・CSV に「対象月」「送金日」を列として持つ
   *  取り込まなかったものと、その理由は docs/引き継ぎ書.md に書いてあります。 */

  /* 「2026年8月」を 202608 という数に直します。並べ替えに使います。
   *  ★読めないときは null を返します。0 にしません。
   *    React 版は 0 を返していたため、読めない月が2つ以上あると
   *    並びが不定になり、いちばん大きなカードに違う月が出る恐れがありました。 */
  function ppNo(ym){
    var v = String(ym == null ? '' : ym);
    try{ if(v.normalize) v = v.normalize('NFKC'); }catch(e){}
    var m = v.match(/(\d{4})\s*年\s*(\d{1,2})\s*月/) ||
            v.match(/^(\d{4})\D(\d{1,2})$/);
    if(!m) return null;
    var y = +m[1], mo = +m[2];
    if(y < 1900 || y > 2200 || mo < 1 || mo > 12) return null;
    return y * 100 + mo;
  }

  /* 新しい月から順に並べます。
   *  ★1つでも読めない月があれば、並べ替えません。
   *    お金の書類なので、読めないものを勝手にどこかへ寄せるより、
   *    サーバーが返した順のままにするほうが安全です。 */
  function ppSort(list){
    var a = (Array.isArray(list) ? list : []).slice();
    for(var i = 0; i < a.length; i++){
      if(ppNo(a[i] && a[i].ym) == null) return a;
    }
    a.sort(function(x, y){ return ppNo(y.ym) - ppNo(x.ym); });
    return a;
  }

  /* CSV の中身を作ります（先頭のBOMは付けません。保存するところで付けます）。
   *  ★React 版から取り込んだところ：
   *      1行ごとに「対象月」「送金日」を持たせます。
   *      何か月ぶんを1つの表に貼っても、どの月の行か分かるためです。
   *  ★React 版と変えたところ：
   *      金額は引用符で囲みません。Excel が文字として読むことがあるためです。 */
  /* 送金日を短くします（3枚ならびのカード用）。
   *  【改良前】「送金日 2026年8月15日」がそのまま入り、
   *            横に入りきらず「日」だけが2行目に折り返していました。
   *  【改良後】年を外して「送金日 8月15日」にします。
   *  ★年を外すのは、カードの見出しに年が出ているときだけで足ります。
   *    読めない形（「9/25」「未定」など）は、いっさい触りません。
   *    日付を作り替えることはしません。 */
  function ppShort(s){
    var v = String(s == null ? '' : s).trim();
    if(!v) return '';
    try{ if(v.normalize) v = v.normalize('NFKC'); }catch(e){}
    var m = v.match(/^\s*\d{4}\s*年\s*(\d{1,2}\s*月\s*\d{1,2}\s*日)\s*$/);
    if(m) return m[1].replace(/\s+/g, '');
    var n = v.match(/^\s*\d{4}\s*[\/\-\.]\s*(\d{1,2})\s*[\/\-\.]\s*(\d{1,2})\s*$/);
    if(n) return String(Number(n[1])) + '/' + String(Number(n[2]));
    return v;
  }

  function csvOf(it){
    if(!it) return '';
    var q = function(v){
      return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    };
    var ym = it.ym || '', sk = it.sokinDate || '';
    var line = ['対象月,送金日,項目,金額'];
    (Array.isArray(it.rows) ? it.rows : []).forEach(function(x){
      line.push([q(ym), q(sk), q(x.label), Number(x.amount || 0)].join(','));
    });
    /* 合計の行は、対象月・送金日を空にします。
       月で絞り込んだときに、合計まで足してしまわないようにするためです。 */
    if(it.total != null){
      line.push([q(''), q(''), q('ご送金額'), Number(it.total)].join(','));
    }
    return line.join('\r\n');
  }
  /* ===== 検査できる道具（送金明細）ここまで ===== */

  function paintPapers(r){
    var all = [];
    (Array.isArray(r.years) ? r.years : []).forEach(function(y){
      (y.items || []).forEach(function(it){ all.push(it); });
    });
    all = ppSort(all);          /* 新しい月から順に。読めない月があれば、そのまま */

    if(!all.length){
      $('pp-hero').innerHTML = '<div class="empty">送金明細がまだありません。</div>';
      $('pp-grid').innerHTML = '';
      $('pp-more').hidden = true;
      return;
    }

    ppKeep = all;                                  /* 月えらびで引くために覚えます */
    $('pp-hero').innerHTML = ppCard(all[0], true, true);
    $('pp-grid').innerHTML = all.slice(1, 4).map(function(it){
      return ppCard(it, false, false);
    }).join('');

    var rest = all.slice(4);
    $('pp-more').hidden = !rest.length;
    if(rest.length){
      $('pp-sel').innerHTML = '<option value="">月を選択してください</option>' +
        rest.map(function(it, i){
          return '<option value="' + (i + 4) + '">' + esc(it.ym) + '</option>';
        }).join('');
      $('pp-one').innerHTML = '';
    }

    ppBind($('pp-hero'));
    ppBind($('pp-grid'));
  }

  var ppKeep = [];

  /* 明細1枚。open は はじめから開いておくか、big は大きく出すか。 */
  function ppCard(it, open, big){
    var rows = Array.isArray(it.rows) ? it.rows : [];
    var naka = rows.length || it.id;               /* 開く中身があるか */
    return '<div class="pp' + (big ? ' big' : '') + '">' +
      '<button type="button" class="pp-h' + (open ? ' open' : '') + '"' +
              (naka ? '' : ' disabled') + '>' +
        '<span class="pp-l">' +
          '<span class="pp-t">' + esc(it.ym) + '</span>' +
          '<span class="pp-s">送金日 ' +
            esc((big ? (it.sokinDate || '—') : ppShort(it.sokinDate) || '—')) +
          '</span>' +
        '</span>' +
        (naka ? '<span class="pp-c" aria-hidden="true"></span>' : '') +
      '</button>' +
      '<p class="pp-a">' + (it.total == null ? '—' : '¥' + yen(it.total)) + '</p>' +
      (naka ? '<div class="pp-b"' + (open ? '' : ' hidden') + '>' +
        (rows.length ? '<div class="rows">' + rows.map(function(x){
          var minus = Number(x.amount) < 0;
          return '<div class="row' + (minus ? ' minus' : '') + '">' +
                 '<span>' + esc(x.label) + '</span>' +
                 '<span>' + (minus ? '−¥' : '¥') +
                 esc(yen(Math.abs(x.amount))) + '</span></div>';
        }).join('') + '</div>' : '') +
        '<div class="pp-acts">' +
          /* ★原本（当社が作った明細書PDF）があるときは、それをお渡しします。 */
          (it.id ? '<button type="button" class="btn ghost sm" data-pdf="' + esc(it.id) +
                   '">' + IC_DL + '明細書（PDF）</button>' : '') +
          (rows.length ? '<button type="button" class="btn ghost sm" data-csv="' +
                   esc(it.ym) + '">' + IC_SHEET + '明細データ（CSV）</button>' : '') +
          /* ★原本が無い月でも、この画面の内容をPDFにして保存できるようにします。
           *   ★お使いのブラウザの印刷を通します。jsPDF などの道具は使いません。
           *     あの道具は日本語の字を持っておらず、文字が出ないためです。
           *     印刷を通せば、日本語もそのまま出て、文字も選べます。 */
          (rows.length ? '<button type="button" class="btn ghost sm" data-print="' +
                   esc(it.ym) + '">' + IC_PRINT + 'この内容をPDFで保存</button>' : '') +
        '</div>' +
        (it.id ? '' :
          '<p class="pp-n">この月の「当社が作成した明細書（PDF）」は、まだ登録されておりません。' +
          'お急ぎのときは、上の［この内容をPDFで保存］をご利用くださいませ。</p>') +
      '</div>' : '') +
    '</div>';
  }

  var IC_DL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0l-4-4m4 4l4-4"/>' +
              '<path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>';
  var IC_PRINT = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
              '<path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 01-2-2v-4a2 2 0 012-2h16' +
              'a2 2 0 012 2v4a2 2 0 01-2 2h-2"/><path d="M6 14h12v7H6z"/></svg>';
  var IC_SHEET = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
              '<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/>' +
              '<path d="M14 3v5h5M9 13h6M9 17h6"/></svg>';

  /* 押したときの動きを付けます */
  function ppBind(box){
    if(!box) return;
    Array.prototype.forEach.call(box.querySelectorAll('.pp-h'), function(h){
      h.addEventListener('click', function(){
        var body = h.parentNode.querySelector('.pp-b');
        if(!body) return;
        body.hidden = !body.hidden;
        h.classList.toggle('open', !body.hidden);
      });
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-pdf]'), function(b){
      b.addEventListener('click', function(e){
        e.stopPropagation();
        openPdf(b.getAttribute('data-pdf'), b);
      });
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-csv]'), function(b){
      b.addEventListener('click', function(e){
        e.stopPropagation();
        saveCsv(b.getAttribute('data-csv'));
      });
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-print]'), function(b){
      b.addEventListener('click', function(e){
        e.stopPropagation();
        printPaper(b.getAttribute('data-print'));
      });
    });
  }

  /* ── この月の明細を、1枚の紙にして印刷（PDF保存）します ──
   *  ★お使いのブラウザの印刷を通します。
   *    ［印刷］の画面で「送信先」を「PDFに保存」にすると、PDFになります。
   *    iPhone・Android でも、共有から「PDFで保存」が選べます。
   *  ★jsPDF のような道具は使いません。日本語の字を持っていないため、
   *    文字が出ないか、黒い四角になります。 */
  function printPaper(ym){
    var it = null;
    for(var i = 0; i < ppKeep.length; i++){
      if(String(ppKeep[i].ym) === String(ym)){ it = ppKeep[i]; break; }
    }
    if(!it) return;

    var rows = Array.isArray(it.rows) ? it.rows : [];
    var host = $('pp-print');
    if(!host) return;

    host.innerHTML =
      '<div class="prt-h">' +
        '<p class="prt-co">' + esc(CFG.COMPANY || 'IREライフ株式会社') + '</p>' +
        '<h1>送金明細</h1>' +
      '</div>' +
      '<table class="prt-t"><tbody>' +
        '<tr><th>宛名</th><td>' + esc((me && me.atena) || '') + '</td></tr>' +
        '<tr><th>対象月</th><td>' + esc(it.ym) + '</td></tr>' +
        '<tr><th>送金日</th><td>' + esc(it.sokinDate || '—') + '</td></tr>' +
      '</tbody></table>' +
      (rows.length ? '<table class="prt-r"><thead><tr><th>項目</th><th>金額</th></tr></thead>' +
        '<tbody>' + rows.map(function(x){
          var minus = Number(x.amount) < 0;
          return '<tr><td>' + esc(x.label) + '</td><td class="n">' +
                 (minus ? '−¥' : '¥') + esc(yen(Math.abs(x.amount))) + '</td></tr>';
        }).join('') + '</tbody></table>' : '') +
      '<p class="prt-sum">ご送金額　' +
        (it.total == null ? '—' : '¥' + esc(yen(it.total))) + '</p>' +
      '<p class="prt-f">この紙は、オーナーマイページの画面をそのまま写したものです。' +
        '当社が作成した明細書（PDF）とは別のものです。</p>';

    document.body.classList.add('printing');

    /* ★印刷が終わってから外します。
     *   時間で外していたところ、ブラウザによっては印刷が始まる前に
     *   外れてしまい、白紙になりました。
     *   ★この目印は画面には何も影響しません（@media print の中だけで効きます）。
     *     ですので、万一 afterprint が来なくても、見た目は変わりません。 */
    var off = function(){ document.body.classList.remove('printing'); };
    try{ window.addEventListener('afterprint', off, { once:true }); }catch(e){}

    /* ★描き終わってから呼びます。先に呼ぶと、白紙になることがあります。 */
    setTimeout(function(){ try{ window.print(); }catch(e){} }, 60);
  }

  /* ★ CSV は、いま画面が持っている内訳から作ります。
   *   サーバーに窓口を増やす必要はありません。
   *   中身の作りは csvOf（上の「検査できる道具」）です。
   *   先頭に BOM を付けるのは、Excel で開いたときに
   *   日本語が化けないようにするためです。
   *
   *   【改良前】「項目,金額」の2列。そのあとに「送金日」の行が
   *             続き、表の形が崩れていました。ファイル名も「収支明細」で、
   *             画面の「送金明細」と言葉が違っていました。
   *   【改良後】「対象月,送金日,項目,金額」の4列。ファイル名も送金明細。 */
  function saveCsv(ym){
    var it = ppKeep.filter(function(x){ return x.ym === ym; })[0];
    if(!it) return;

    var url = URL.createObjectURL(
      new Blob(['﻿' + csvOf(it)], { type:'text/csv;charset=utf-8' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = ym + ' 送金明細.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 60000);
  }

  /* 月をえらぶと、その1件を下に出します */
  $('pp-sel').addEventListener('change', function(){
    var i = Number($('pp-sel').value);
    if(!$('pp-sel').value || !ppKeep[i]){ $('pp-one').innerHTML = ''; return; }
    $('pp-one').innerHTML = ppCard(ppKeep[i], true, true);
    ppBind($('pp-one'));
  });

  /* ── 年間の収支（ホーム） ───────────────────
   * 上の図 … 月ごとの 収入（棒）と 支出（棒）
   * 下の図 … 累積収支（折れ線）
   *
   * ★ なぜ2つに分けたか
   *   見本は1つの図に左右2本のものさしを置いていました。収入は約53万円、
   *   累積収支は12か月で約580万円。11倍ちがうものが同じ高さに描かれ、
   *   「今月の収入と、これまでの累計が同じくらい」と読めてしまいます。
   *   図を2つに分ければ、どちらも自分のものさしで正しく読めます。
   *   月の並び（横軸）は上下でそろえてあります。 */
  function loadChart(){
    /* ★ quiet。ここも「ホームのついで」です。 */
    getPapers(true).then(paintChart)
      .catch(function(){ $('hm-chart-wrap').hidden = true; });
  }

  /* 明細の内訳から、月ごとの 収入・支出・累積収支 を作ります */
  function chartRows(r){
    var all = [];
    (Array.isArray(r.years) ? r.years : []).forEach(function(y){
      (y.items || []).forEach(function(it){ all.push(it); });
    });
    var run = 0;
    return all.slice(0, 12).reverse().map(function(it){
      var inc = 0, out = 0;
      (it.rows || []).forEach(function(x){
        var v = Number(x.amount) || 0;
        if(v >= 0) inc += v; else out += -v;
      });
      /* 内訳が無い月は、ご送金額を収入として見ます */
      if(!inc && !out && it.total != null) inc = it.total;
      run += inc - out;
      return { ym: it.ym, month: it.month, inc: inc, out: out, run: run };
    });
  }

  /* 万の単位で短くします（棒が細いためです）。1万円に満たなければそのまま。 */
  function man(n){
    var v = Number(n);
    if(!isFinite(v)) return '';
    if(Math.abs(v) >= 10000) return (Math.round(v / 1000) / 10) + '万';
    return yen(v);
  }

  /* 横軸の月。いちばん左と1月には、年も添えます。
     年をまたいだことが分かるようにするためです。 */
  function monLabel(x, i){
    if(x.month == null) return '';
    var y = String(x.ym || '').match(/(\d{4})/);
    if((i === 0 || x.month === 1) && y) return "'" + y[1].slice(2) + ' ' + x.month;
    return String(x.month);
  }

  function paintChart(r){
    var d = chartRows(r);
    /* 1か月ぶんでは山にならないので出しません */
    if(d.length < 2){ $('hm-chart-wrap').hidden = true; return; }

    var maxBar = Math.max.apply(null, d.map(function(x){
      return Math.max(x.inc, x.out); })) || 1;
    var runs   = d.map(function(x){ return x.run; });
    var runHi  = Math.max.apply(null, runs);
    var runLo  = Math.min.apply(null, runs.concat([0]));
    var span   = (runHi - runLo) || 1;
    var last   = d.length - 1;

    /* ── 上の図：収入と支出 ───────────────── */
    var bars = d.map(function(x, i){
      var hi = Math.round(x.inc / maxBar * 100);
      var ho = Math.round(x.out / maxBar * 100);
      return '<div class="c2">' +
        /* ★2026/9/23 まで、いちばん右の1本だけに金額を出していました。
         *   「オレンジの棒の上に数字がない」とのご指摘のとおりで、
         *   ぜんぶの棒に出します。せまい画面では重なって読めないため、
         *   3か月ごとと今月だけを出す（CSS の @media で切り替え）。 */
        '<span class="c2-v">' + esc(man(x.inc)) + '</span>' +
        '<span class="c2-w">' +
          '<span class="c2-b inc" style="height:' + Math.max(x.inc ? 2 : 0, hi) + '%"></span>' +
          '<span class="c2-b out" style="height:' + Math.max(x.out ? 2 : 0, ho) + '%"></span>' +
        '</span>' +
        '<span class="c2-x">' + esc(monLabel(x, i)) + '</span>' +
        '<span class="c2-tip" role="tooltip">' +
          '<b>' + esc(x.ym) + '</b>' +
          '<i><em class="sw inc"></em>収入<s>¥' + esc(yen(x.inc)) + '</s></i>' +
          '<i><em class="sw out"></em>支出<s>−¥' + esc(yen(x.out)) + '</s></i>' +
          '<i><em class="sw run"></em>累積収支<s>¥' + esc(yen(x.run)) + '</s></i>' +
        '</span>' +
      '</div>';
    }).join('');

    /* ── 下の図：累積収支の折れ線 ─────────── */
    var pts = d.map(function(x, i){
      var px = ((i + 0.5) / d.length) * 100;
      var py = 100 - ((x.run - runLo) / span) * 92 - 4;
      return px.toFixed(2) + ',' + py.toFixed(2);
    });
    /* ★ 点（circle）は置きません。図を横いっぱいに伸ばすので、
     *   まるい点が楕円につぶれてしまうためです。線だけにします。 */
    var line = '<svg class="ln" viewBox="0 0 100 100" preserveAspectRatio="none"' +
      ' aria-hidden="true"><polyline points="' + pts.join(' ') + '"' +
      ' vector-effect="non-scaling-stroke" class="ln-p"/></svg>';

    $('hm-chart').innerHTML =
      '<div class="ch2">' + bars + '</div>' +
      '<div class="ln-wrap">' + line +
        '<span class="ln-k">累積収支</span>' +
        '<span class="ln-a">¥' + esc(yen(d[last].run)) + '</span>' +
      '</div>' +
      '<div class="ch-lg">' +
        '<span><em class="sw inc"></em>収入</span>' +
        '<span><em class="sw out"></em>支出</span>' +
        '<span><em class="sw run line"></em>累積収支</span>' +
      '</div>' +
      '<details class="ch-tb"><summary>数値で表示</summary>' +
        '<table><thead><tr><th>月</th><th>収入</th><th>支出</th><th>累積収支</th></tr></thead>' +
        '<tbody>' + d.map(function(x){
          return '<tr><th scope="row">' + esc(x.ym) + '</th>' +
                 '<td>¥' + esc(yen(x.inc)) + '</td>' +
                 '<td>−¥' + esc(yen(x.out)) + '</td>' +
                 '<td>¥' + esc(yen(x.run)) + '</td></tr>';
        }).join('') + '</tbody></table></details>';

    $('hm-chart-wrap').hidden = false;
  }
  /* ══════════════════════════════════════════════
   *  お問い合わせの、返事の数（ホームのカードに出します）
   *
   *  ★「見たかどうか」は、この端末の中だけに覚えます（CT_KEY）。
   *    当社へは送りません。窓口も足していません。
   *
   *  ★日時ではなく、やりとりの「本数」で見ています。
   *    日時の文字は表の書式で変わることがあり、読めなかったときに
   *    数を間違えます。本数は整数なので、間違えようがありません。
   * ══════════════════════════════════════════════ */

  /* ===== 検査できる道具（お問い合わせの数）ここから ===== */

  /* 返事が来ていて、まだ見ていないものの数 */
  function ctNew(list, seen){
    var n = 0;
    (Array.isArray(list) ? list : []).forEach(function(t){
      var msgs = (t && Array.isArray(t.msgs)) ? t.msgs : [];
      if(!msgs.length) return;
      /* いちばん新しい発言が自分なら、返事はまだ来ていません */
      if(String(msgs[msgs.length - 1].who || '') === 'オーナー') return;
      var id  = String((t && t.id != null) ? t.id : '');
      if(!id) return;
      var was = (seen && seen[id] != null) ? Number(seen[id]) : 0;
      if(!isFinite(was) || was < 0) was = 0;
      if(msgs.length > was) n++;
    });
    return n;
  }

  /* いま見た状態（やりとりの本数）を作ります */
  function ctSeen(list){
    var m = {};
    (Array.isArray(list) ? list : []).forEach(function(t){
      var id = String((t && t.id != null) ? t.id : '');
      if(!id) return;
      m[id] = (t && Array.isArray(t.msgs)) ? t.msgs.length : 0;
    });
    return m;
  }

  /* ===== 検査できる道具（お問い合わせの数）ここまで ===== */

  var CT_KEY = 'ire_owner_seen';

  function ctSeenGet(){
    try{ return JSON.parse(localStorage.getItem(CT_KEY) || '{}') || {}; }
    catch(e){ return {}; }
  }
  function ctSeenPut(m){
    try{ localStorage.setItem(CT_KEY, JSON.stringify(m)); }catch(e){}
  }

  function ctBadge(n){
    var el = $('hm-ct-n'), tile = $('hm-ct-tile');
    if(!el || !tile) return;
    el.textContent = n > 99 ? '99+' : String(n);
    el.hidden = !n;
    tile.classList.toggle('has', !!n);
    /* 読み上げにも伝えます */
    el.setAttribute('aria-label', n ? ('当社からの回答が ' + n + ' 件あります') : '');
  }

  /* ★ホームのついでに読みます。失敗しても画面は出したままにします。 */
  function loadCt(){
    /* ★一度読んでいれば、もう一度読みません。
     *   ホームへ戻るたびに読み直すと、Apps Script の順番待ちが増えて
     *   数字が出るのが遅くなります。件数は控えから出します。 */
    if(cache.talks){ ctBadge(ctNew(cache.talks, ctSeenGet())); return; }
    auth('talks', null, true)
      .then(function(r){
        var list = Array.isArray(r.list) ? r.list : [];
        cache.talks = list;
        ctBadge(ctNew(list, ctSeenGet()));
      })
      .catch(function(){ ctBadge(0); });
  }

  /* ══════════════════════════════════════════════
   *  税理士へ送信
   *
   *  ★ 2026/9/22 中身を作りました（それまで入口だけでした）。
   *
   *  ★ いま「できること」と「できないこと」を、はっきり分けています。
   *
   *    できること（当社側の用意は要りません）
   *      ・税理士先生の宛先をこの端末に覚える
   *      ・1か月ぶん／1年ぶんの表（CSV）を保存する
   *      ・その月の明細書（原本PDF）を保存する
   *      ・件名と本文の入ったメールを開く
   *
   *    できないこと（Apps Script に窓口が1つ必要です）
   *      ・PDFを自動で添付して送る
   *      ・12か月を1つのPDFにまとめる
   *
   *  ★ PDFを画面側で作ることは、しません。
   *    日本語の字を持っていないため、月名も項目名も出ません。
   *    原本PDFは Apps Script が作っているので、そのまま渡します。
   * ══════════════════════════════════════════════ */

  /* ===== 検査できる道具（tests/tacc.cjs が読みます）ここから =====
   *  ★この塊は、上の「送金明細」の塊にある ppNo / ppSort を使います。
   *    tests/tacc.cjs は、2つの塊をつないで読み込みます。 */

  /* 「2026年8月」から「2026」を取り出します。暦年です（決算期ではありません）。 */
  function acYearOf(ym){
    var n = ppNo(ym);
    return (n == null) ? '' : String(Math.floor(n / 100));
  }

  /* 明細にある年を、新しい順に並べます。読めない月は入れません。 */
  function acYears(list){
    var seen = {}, out = [];
    (Array.isArray(list) ? list : []).forEach(function(it){
      var y = acYearOf(it && it.ym);
      if(y && !seen[y]){ seen[y] = 1; out.push(y); }
    });
    return out.sort().reverse();
  }

  /* その年のものだけを、1月から順に並べます。 */
  function acOfYear(list, year){
    var a = (Array.isArray(list) ? list : []).filter(function(it){
      return acYearOf(it && it.ym) === String(year);
    });
    return a.sort(function(x, y){ return (ppNo(x.ym) || 0) - (ppNo(y.ym) || 0); });
  }

  /* 税理士先生へお渡しする表を作ります（先頭のBOMは、保存するところで付けます）。
   *
   *  ★「区分」の列を足しています。送金明細の画面のCSV（4列）とは違います。
   *    理由： 何か月ぶんも1つの表にすると、内訳の行とご送金額の行が
   *          混ざります。区分が無いと、金額の列をそのまま合計したときに
   *          二重に足してしまいます。税理士先生にお渡しする表なので、
   *          そこは曖昧にしません。
   *          「区分＝内訳」だけで絞れば、正しく合計できます。 */
  function acCsv(list){
    var q = function(v){
      return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    };
    var line = ['対象月,送金日,区分,項目,金額'];
    var sum = 0, got = false;

    (Array.isArray(list) ? list : []).forEach(function(it){
      var ym = it.ym || '', sk = it.sokinDate || '';
      (Array.isArray(it.rows) ? it.rows : []).forEach(function(x){
        line.push([q(ym), q(sk), q('内訳'), q(x.label),
                   Number(x.amount || 0)].join(','));
      });
      if(it.total != null){
        line.push([q(ym), q(sk), q('ご送金額'), q(''), Number(it.total)].join(','));
        sum += Number(it.total);
        got = true;
      }
    });

    /* 2か月ぶん以上のときだけ、いちばん下に合計を足します。
       対象月は空にします（月で絞ったときに混ざらないようにするためです）。 */
    if(got && (Array.isArray(list) ? list.length : 0) > 1){
      line.push([q(''), q(''), q('合計'), q(''), sum].join(','));
    }
    return line.join('\r\n');
  }

  /* 件名と本文を作ります。
   *  hasPdf … 明細書（PDF）もお付けいただけるか。
   *  ★1年ぶんは、12か月を1つのPDFにまとめられないので false になります。
   *    本文に「PDFを添付しております」と書いてあるのに付けられない、
   *    という食い違いを起こさないためです。 */
  function acMail(info, what, company, hasPdf){
    var firm = (info && info.firm) ? String(info.firm).trim() : '';
    var name = (info && info.name) ? String(info.name).trim() : '';
    var co   = company ? String(company) : '当社';
    var line = '------------------------------';

    var atena = firm ? firm : '税理士事務所';
    var sensei = name ? (name + ' 先生') : 'ご担当者様';

    return {
      subject: '【' + co + '】' + what + ' 送金明細のご送付',
      body   : atena + '\n' + sensei + '\n\n' +
               'いつもお世話になっております。\n\n' +
               what + 'の送金明細を、お送りいたします。\n' +
               /* ★2026-09-23 直し
                *  改良前： 「明細データ（CSV）と明細書（PDF）を添付しております。」
                *  改良後： 「明細書（PDF）を添付しております。」
                *  理由： 当社から送信する道（taxsend）で付くのは、明細書（PDF）
                *        だけです。CSV は付きません。本文と、実際に付くものが
                *        食い違わないようにします。 */
               (hasPdf ? '明細書（PDF）を添付しております。\n\n'
                       : '明細データ（CSV）を添付しております。\n\n') +
               'ご確認のほど、よろしくお願い申し上げます。\n\n' +
               line + '\n' +
               co + ' オーナーマイページより\n' +
               line
    };
  }

  /* メールソフトを開くための文字を作ります。
   *  ★改行は %0D%0A にします。%0A だけでは、改行されないメールソフトがあります。 */
  function acMailto(to, subject, body){
    var e = function(v){
      return encodeURIComponent(String(v == null ? '' : v)).replace(/%0A/g, '%0D%0A');
    };
    return 'mailto:' + e(to).replace(/%40/g, '@') +
           '?subject=' + e(subject) + '&body=' + e(body);
  }
  /* ===== 検査できる道具（税理士へ送信）ここまで ===== */

  var AC_KEY  = 'ire_owner_tax';     /* 税理士先生の宛先。この端末の中だけ */
  var acMode  = 'month';             /* month か year */
  var acList  = [];

  function acInfo(){
    try{ return JSON.parse(localStorage.getItem(AC_KEY) || '{}') || {}; }
    catch(e){ return {}; }
  }

  function loadAcc(){
    var i = acInfo();
    $('ac-firm').value = i.firm || '';
    $('ac-name').value = i.name || '';
    $('ac-mail').value = i.mail || '';

    $('ac-prev').innerHTML = '<div class="empty">読み込んでいます…</div>';
    getPapers()
      .then(function(r){
        var all = [];
        (Array.isArray(r.years) ? r.years : []).forEach(function(y){
          (y.items || []).forEach(function(it){ all.push(it); });
        });
        acList = ppSort(all);
        acFillYears();
        acPaint();
      })
      .catch(function(e){
        acList = [];
        $('ac-prev').innerHTML = '<div class="empty">' + esc(e.message) + '</div>';
      });
  }

  function acFillYears(){
    var ys = acYears(acList);
    $('ac-year').innerHTML = ys.map(function(y){
      return '<option value="' + esc(y) + '">' + esc(y) + '年分</option>';
    }).join('');
    acFillMonths();
  }

  function acFillMonths(){
    var y = $('ac-year').value;
    var a = acOfYear(acList, y);
    $('ac-month').innerHTML = a.map(function(it, i){
      return '<option value="' + i + '">' + esc(it.ym) + '</option>';
    }).join('');
    /* いちばん新しい月を、はじめから選んでおきます */
    if(a.length) $('ac-month').value = String(a.length - 1);
  }

  function acPicked(){
    var y = $('ac-year').value;
    var a = acOfYear(acList, y);
    if(acMode === 'year') return { list:a, what:(y ? (y + '年分（1月〜12月）') : '') };
    var i = Number($('ac-month').value);
    var it = a[i];
    return { list:(it ? [it] : []), what:(it ? it.ym : '') };
  }

  function acPaint(){
    var g = acPicked();
    $('ac-month-wrap').hidden = (acMode === 'year');
    $('ac-m').classList.toggle('on', acMode === 'month');
    $('ac-y').classList.toggle('on', acMode === 'year');

    if(!g.list.length){
      $('ac-prev-h').textContent = '送付内容の確認';
      $('ac-prev').innerHTML = '<div class="empty">送金明細がまだありません。</div>';
      $('ac-csv').disabled = true;
      $('ac-pdf').disabled = true;
      $('ac-pdf').hidden   = false;
      acSendBtn(null);
      acText();
      return;
    }

    $('ac-prev-h').textContent = g.what + 'の明細';
    $('ac-csv').disabled = false;

    if(acMode === 'month'){
      var it = g.list[0];
      var rows = Array.isArray(it.rows) ? it.rows : [];
      $('ac-prev').innerHTML =
        '<p class="pp-s">送金日 ' + esc(it.sokinDate || '—') + '</p>' +
        (rows.length ? '<div class="rows">' + rows.map(function(x){
          var minus = Number(x.amount) < 0;
          return '<div class="row' + (minus ? ' minus' : '') + '">' +
                 '<span>' + esc(x.label) + '</span>' +
                 '<span>' + (minus ? '−¥' : '¥') +
                 esc(yen(Math.abs(x.amount))) + '</span></div>';
        }).join('') + '</div>' : '') +
        '<div class="row acc-sum"><span>ご送金額</span><span>' +
          (it.total == null ? '—' : '¥' + yen(it.total)) + '</span></div>';
      /* 原本PDFがあるときだけ */
      $('ac-pdf').hidden   = false;
      $('ac-pdf').disabled = !it.id;
      acSendBtn(it);
    }else{
      var sum = 0, got = false;
      $('ac-prev').innerHTML = '<div class="rows">' + g.list.map(function(it){
        if(it.total != null){ sum += Number(it.total); got = true; }
        return '<div class="row"><span>' + esc(it.ym) + '</span><span>' +
               (it.total == null ? '—' : '¥' + yen(it.total)) + '</span></div>';
      }).join('') + '</div>' +
        '<div class="row acc-sum"><span>年間合計</span><span>' +
          (got ? ('¥' + yen(sum)) : '—') + '</span></div>';
      /* ★12か月を1つのPDFにまとめるには、当社側の用意が必要です */
      $('ac-pdf').hidden = true;
      acSendBtn(null);
    }
    acText();
  }

  /* 件名と本文を入れ直します（ご自身で書き替えられます）。 */
  function acText(){
    var g = acPicked();
    /* 明細書（PDF）をお付けいただけるのは、1か月ぶんで原本があるときだけです */
    var hasPdf = (acMode === 'month' && g.list.length > 0 && !!g.list[0].id);
    var m = acMail(acInfo(), g.what || 'ご送金', CFG.COMPANY || '当社', hasPdf);
    $('ac-subj').value = m.subject;
    $('ac-body').value = m.body;
  }

  $('ac-m').addEventListener('click', function(){ acMode = 'month'; acPaint(); });
  $('ac-y').addEventListener('click', function(){ acMode = 'year';  acPaint(); });
  $('ac-year').addEventListener('change', function(){ acFillMonths(); acPaint(); });
  $('ac-month').addEventListener('change', acPaint);
  ['ac-firm','ac-name','ac-mail'].forEach(function(id){
    /* ★宛先を書き替えたら、確認の箱は閉じます。
         古い宛先を出したまま送ってしまわないようにするためです。 */
    $(id).addEventListener('input', function(){ acCfHide(); });
  });

  $('ac-save').addEventListener('click', function(){
    var i = { firm:($('ac-firm').value || '').trim(),
              name:($('ac-name').value || '').trim(),
              mail:($('ac-mail').value || '').trim() };
    try{ localStorage.setItem(AC_KEY, JSON.stringify(i)); }catch(e){}
    say($('ac-saved'), 'この端末に保存しました。', true);
    acText();
    setTimeout(function(){ say($('ac-saved'), ''); }, 4000);
  });

  $('ac-csv').addEventListener('click', function(){
    var g = acPicked();
    if(!g.list.length) return;
    var url = URL.createObjectURL(
      new Blob(['\ufeff' + acCsv(g.list)], { type:'text/csv;charset=utf-8' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = g.what + ' 送金明細.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 60000);
  });

  $('ac-pdf').addEventListener('click', function(){
    var g = acPicked();
    var it = g.list[0];
    if(!it || !it.id) return;
    savePdf(it.id, g.what + ' 送金明細.pdf', $('ac-pdf'));
  });

  $('ac-go').addEventListener('click', function(){
    var to = ($('ac-mail').value || '').trim();
    if(!to){
      say($('ac-msg'), '税理士事務所のメールアドレスをご入力ください。');
      return;
    }
    say($('ac-msg'), '');
    /* ★ここでファイルは添付できません。メールソフトの決まりです。
     *  保存したファイルを、開いたメールに付けていただきます。
     *
     *  ★location.href ではなく <a> を押す形にしています。
     *    スクリプトから location を書き替えるのを止めるブラウザがあるためです
     *    （保存するところと同じ作りです）。 */
    var a = document.createElement('a');
    a.href = acMailto(to, $('ac-subj').value, $('ac-body').value);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    say($('ac-msg'), 'メールソフトを起動しました。' +
        '保存したファイルを添付のうえ、ご送信ください。', true);
  });

  /* ── 当社から、明細書（PDF）を添付して送信する ─────────
   *
   *  【改良前】 添付は、いっさい自動ではありませんでした。
   *            ・CSV と PDF をご自身で保存する
   *            ・［メールを作成する］でメールソフトを開く
   *            ・保存したものを、ご自身で添付する
   *            この3手が必要でした。
   *            ブラウザから添付を付けることは、メールソフトの決まりで
   *            できません（mailto に添付を付ける手だてはありません）。
   *
   *  【改良後】 明細書（PDF）がある月は、Apps Script が
   *            その PDF を添付して送信します。オーナー様は
   *            ［明細書（PDF）を添付して送信］を押すだけです。
   *
   *  ★宛先は、必ず一度ご確認いただいてから送ります。
   *    明細書にはご送金額が載っております。打ち間違いのまま
   *    よその方へ届くと、取り返しがつきません。
   *
   *  ★年別（12か月）は送信できません。12か月を1つの明細書（PDF）に
   *    まとめたものが、そもそも無いためです。無いものは送りません。 */

  var acSendIt = null;          /* いま送れる月。送れないときは null */

  function acSendBtn(it){
    var b = $('ac-send'), n = $('ac-send-n');
    acCfHide();
    if(!b) return;
    if(it && it.id){
      acSendIt = it;
      b.disabled = false;
      if(n) n.textContent = '当社から、明細書（PDF）を添付してお送りします。' +
                            'お使いのメールソフトを開く必要はございません。';
      return;
    }
    acSendIt = null;
    b.disabled = true;
    if(!n) return;
    if(acMode === 'year'){
      n.textContent = '年別は、12か月を1つの明細書（PDF）にまとめたものが' +
                      'ございませんため、当社からの送信はご利用いただけません。' +
                      '下の［ご自身のメールソフトで作成する］をご利用ください。';
    }else if(it){
      n.textContent = 'この月の明細書（PDF）は、まだ登録されておりません。' +
                      '下の［ご自身のメールソフトで作成する］をご利用ください。';
    }else{
      n.textContent = '送金明細がまだございません。';
    }
  }

  function acCfHide(){
    var c = $('ac-cf');
    if(c) c.hidden = true;
  }

  $('ac-send').addEventListener('click', function(){
    var to = ($('ac-mail').value || '').trim();
    if(!to){
      say($('ac-msg'), '税理士事務所のメールアドレスをご入力ください。');
      acCfHide();
      return;
    }
    if(!acSendIt || !acSendIt.id){ acCfHide(); return; }
    say($('ac-msg'), '');
    $('ac-cf-to').textContent = to;
    $('ac-cf').hidden = false;
  });

  $('ac-cf-no').addEventListener('click', function(){
    acCfHide();
    say($('ac-msg'), '送信を取り消しました。');
  });

  $('ac-cf-ok').addEventListener('click', function(){
    var to = ($('ac-mail').value || '').trim();
    var it = acSendIt;
    if(!to || !it || !it.id){ acCfHide(); return; }
    var g = acPicked();
    var btn = $('ac-cf-ok');
    say($('ac-msg'), '');
    busy(btn, true, '送信しています…');
    auth('taxsend', {
      id     : it.id,
      to     : to,
      subject: $('ac-subj').value,
      body   : $('ac-body').value,
      name   : (g.what || '送金明細') + ' 送金明細.pdf',
      /* ★控えの宛先は送りません。Apps Script が、入館証から
           ご本人のアドレスを見て送ります（打ち間違いが混ざらないように）。 */
      copy   : !!$('ac-copy').checked
    })
      .then(function(){
        busy(btn, false);
        acCfHide();
        say($('ac-msg'), to + ' 宛に、明細書（PDF）を添付して送信いたしました。' +
            ($('ac-copy').checked ? '控えも、ご自身のメールアドレスへお送りしました。' : ''),
            true);
      })
      .catch(function(e){
        busy(btn, false);
        acCfHide();
        /* ★黙って失敗させません。何が起きたかと、代わりの道をお出しします。 */
        say($('ac-msg'), (e && e.message ? e.message : '送信できませんでした。') +
            '　お急ぎのときは、下の［ご自身のメールソフトで作成する］を' +
            'ご利用くださいませ。');
      });
  });

  /* 原本PDFを、開かずに保存します（税理士先生へ添付していただくため）。 */
  function savePdf(id, name, btn){
    if(!id) return;
    var old = btn && btn.textContent;
    if(btn){ btn.disabled = true; btn.textContent = '作成しています…'; }
    auth('pdf', { id: id })
      .then(function(r){
        var bin = atob(r.b64 || '');
        var buf = new Uint8Array(bin.length);
        for(var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        var url = URL.createObjectURL(new Blob([buf], { type:'application/pdf' }));
        var a = document.createElement('a');
        a.href = url;
        a.download = name || '送金明細.pdf';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function(){ URL.revokeObjectURL(url); }, 60000);
      })
      .catch(function(e){ toast(e.message); })
      .then(function(){
        if(btn){ btn.disabled = false; if(old) btn.textContent = old; }
      });
  }

  /* ★ PDF は Apps Script から受け取って、その場で開きます。
       共有リンクにはしません。リンクが1本漏れると、
       知っている人なら誰でも見られてしまうためです。 */
  function openPdf(id, btn){
    if(!id) return;
    var old = btn && btn.textContent;
    if(btn){ btn.disabled = true; btn.textContent = '読み込んでいます…'; }
    auth('pdf', { id: id })
      .then(function(r){
        var bin = atob(r.b64 || '');
        var buf = new Uint8Array(bin.length);
        for(var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        var url = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }));
        window.open(url, '_blank');
        setTimeout(function(){ URL.revokeObjectURL(url); }, 60000);
      })
      .catch(function(e){ toast(e.message); })
      .then(function(){
        if(btn){ btn.disabled = false; if(old) btn.textContent = old; }
      });
  }

  /* ══════════════════════════════════════════════
   *  お問い合わせ（吹き出しのやりとり）
   *
   *  【改良前】送るだけ。当社の返事はメールで届き、画面には出ませんでした。
   *    「送ったけれど、見てもらえたのか分からない」状態でした。
   *  【改良後】1件ずつの会話になります。当社の返事も、ここに並びます。
   * ══════════════════════════════════════════════ */
  function loadContact(){
    $('ct-list').innerHTML = '<div class="empty">読み込んでいます…</div>';
    auth('talks')
      .then(function(r){
        var list = Array.isArray(r.list) ? r.list : [];
        paintTalks(list);
        /* ★この画面を開いた時点で「見た」ことにします */
        ctSeenPut(ctSeen(list));
        ctBadge(0);
      })
      .catch(function(e){
        $('ct-list').innerHTML = '<div class="empty">' + esc(e.message) + '</div>';
      });
  }

  function paintTalks(list){
    if(!list.length){
      $('ct-list').innerHTML = '<div class="empty">お問い合わせの履歴はありません。</div>';
      return;
    }
    $('ct-list').innerHTML = list.map(function(t, i){
      var done = String(t.state || '') === '回答済み';
      var talk = (t.msgs || []).map(function(m){
        var mine = (m.who === 'オーナー');
        return '<div class="bub' + (mine ? ' mine' : '') + '">' +
               '<span class="bub-w">' + esc(mine ? 'お客様' : 'IREライフ') +
               '　' + esc(m.at) + '</span>' +
               '<span class="bub-b">' + esc(m.body) + '</span></div>';
      }).join('');

      /* ★2026/9/23 まで、やりとりを全部開いたまま並べていました。
       *   件数が増えると画面がとても長くなるため、送金明細と同じ
       *   開閉式にします。いちばん新しい1件だけ開いておきます。 */
      return '<div class="tk' + (i === 0 ? ' open' : '') + '">' +
        '<button type="button" class="tk-h">' +
          '<span class="tk-l">' +
            '<span class="tk-t">' + esc(t.kind) + '</span>' +
            '<span class="tk-d">' + esc(t.date) + '</span>' +
          '</span>' +
          '<span class="chip' + (done ? ' done' : ' wait') + '">' +
            (done ? '回答済み' : '確認中') + '</span>' +
          '<span class="tk-c" aria-hidden="true"></span>' +
        '</button>' +
        '<div class="tk-b"' + (i === 0 ? '' : ' hidden') + '>' +
          '<div class="talk">' + talk + '</div>' +
          '<details class="ask">' +
            '<summary>このお問い合わせに返信する</summary>' +
            '<textarea rows="4" data-tk="' + esc(t.id) +
              '" placeholder="ご質問・ご要望をご記入ください。"></textarea>' +
            '<button type="button" class="btn ghost" data-tksend="' + esc(t.id) +
              '">送信する</button>' +
            '<span class="msg" data-tkmsg="' + esc(t.id) + '"></span>' +
          '</details>' +
        '</div>' +
      '</div>';
    }).join('');

    Array.prototype.forEach.call($('ct-list').querySelectorAll('.tk-h'), function(h){
      h.addEventListener('click', function(){
        var body = h.parentNode.querySelector('.tk-b');
        if(!body) return;
        body.hidden = !body.hidden;
        h.parentNode.classList.toggle('open', !body.hidden);
      });
    });
    Array.prototype.forEach.call($('ct-list').querySelectorAll('[data-tksend]'), function(b){
      b.addEventListener('click', function(){ sendTalk(b.getAttribute('data-tksend'), b); });
    });
  }

  function sendTalk(id, btn){
    var ta  = $('ct-list').querySelector('[data-tk="' + id + '"]');
    var msg = $('ct-list').querySelector('[data-tkmsg="' + id + '"]');
    var body = ta ? (ta.value || '').trim() : '';
    if(!body){ say(msg, '内容をご入力ください。'); return; }
    if(body.length > 2000){ say(msg, '文字数が上限を超えています。2,000文字以内でご入力ください。'); return; }

    busy(btn, true);
    auth('talkMsg', { id: id, body: body })
      .then(function(){
        if(ta) ta.value = '';
        toast('送信しました。担当者より回答いたします。');
        loadContact();
      })
      .catch(function(e){ say(msg, e.message); })
      .then(function(){ busy(btn, false); });
  }

  $('f-contact').addEventListener('submit', function(ev){
    ev.preventDefault();
    var kind = $('ct-kind').value;
    var body = ($('ct-body').value || '').trim();
    var msg  = $('ct-msg');
    if(!body){ say(msg, '内容をご入力ください。'); return; }
    if(body.length > 2000){ say(msg, '文字数が上限を超えています。2,000文字以内でご入力ください。'); return; }

    busy($('ct-go'), true);
    auth('ask', { kind: kind, body: body })
      .then(function(){
        $('ct-body').value = '';
        say(msg, '');
        /* ★送れたことが分かるよう、書く欄を閉じて一覧に戻します */
        $('ct-new').open = false;
        loadContact();
        toast('送信しました。担当者より回答いたします。');
      })
      .catch(function(e){ say(msg, e.message); })
      .then(function(){ busy($('ct-go'), false); });
  });

  /* ══════════════════════════════════════════════
   *  原状回復・修繕
   *
   *  いつ・何を・いくら・いつ相殺するかを1件ずつ。
   *  そのまま、その工事についてご連絡いただけます。
   * ══════════════════════════════════════════════ */
  var WK_STATE = {
    '見積中'  : 'wait',
    '着手待ち': 'wait',
    '工事中'  : 'wait',
    '完了'    : 'done',
    '精算済'  : 'done'
  };

  function loadWorks(){
    if(cache.works){ paintWorks(cache.works); return; }
    $('wk-body').innerHTML = '<div class="empty">読み込んでいます…</div>';
    auth('works')
      .then(function(r){ cache.works = r; paintWorks(r); })
      .catch(function(e){
        $('wk-body').innerHTML = '<div class="empty">' + esc(e.message) + '</div>';
      });
  }

  function paintWorks(r){
    var list = Array.isArray(r.list) ? r.list : [];
    if(!list.length){
      $('wk-body').innerHTML =
        '<div class="empty">現在、原状回復・修繕の予定はありません。</div>';
      return;
    }
    $('wk-body').innerHTML = list.map(function(w){
      var kind = WK_STATE[w.state] || 'wait';
      var rows = '';
      if(w.from || w.to){
        rows += line('期間', (w.from || '—') + (w.to ? '　〜　' + w.to : '　〜'));
      }
      if(w.yen !== null && w.yen !== undefined){
        rows += line('費用', yen(w.yen) + ' 円');
      }
      if(w.offset){ rows += line('相殺予定', w.offset); }
      if(w.note){   rows += line('備考', w.note); }

      var talk = (w.msgs || []).map(function(m){
        var mine = (m.who === 'オーナー');
        return '<div class="bub' + (mine ? ' mine' : '') + '">' +
               '<span class="bub-w">' + esc(mine ? 'お客様' : 'IREライフ') +
               '　' + esc(m.at) + '</span>' +
               '<span class="bub-b">' + esc(m.body) + '</span></div>';
      }).join('');

      return '<div class="work">' +
        '<div class="wk-h">' +
          '<span class="wk-p">' + esc(w.place || '—') + '</span>' +
          '<span class="chip ' + kind + '">' + esc(w.state) + '</span>' +
        '</div>' +
        '<p class="wk-t">' + esc(w.what || '—') + '</p>' +
        '<div class="kv">' + rows + '</div>' +
        (talk ? '<div class="talk">' + talk + '</div>' : '') +
        '<details class="ask">' +
          '<summary>この工事についてお問い合わせ</summary>' +
          '<textarea rows="4" data-wk="' + esc(w.id) +
            '" placeholder="ご質問・ご要望をご記入ください。"></textarea>' +
          '<button type="button" class="btn ghost" data-send="' + esc(w.id) + '">送信する</button>' +
          '<span class="msg" data-msg="' + esc(w.id) + '"></span>' +
        '</details>' +
      '</div>';
    }).join('');

    Array.prototype.forEach.call($('wk-body').querySelectorAll('[data-send]'), function(b){
      b.addEventListener('click', function(){ sendWork(b.getAttribute('data-send'), b); });
    });
  }

  function line(k, v){
    return '<span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + '</span>';
  }

  function sendWork(id, btn){
    var ta  = $('wk-body').querySelector('[data-wk="' + id + '"]');
    var msg = $('wk-body').querySelector('[data-msg="' + id + '"]');
    var body = ta ? (ta.value || '').trim() : '';
    if(!body){ say(msg, '内容をご入力ください。'); return; }
    if(body.length > 2000){ say(msg, '文字数が上限を超えています。2,000文字以内でご入力ください。'); return; }

    busy(btn, true);
    auth('workMsg', { id: id, body: body })
      .then(function(){
        if(ta) ta.value = '';
        /* ★ここで一覧を描き直すので、この欄の字は消えてしまいます。
           消えない帯（toast）でお伝えします。
           書いたものがその場でやりとりに並ぶので、それも目印になります。 */
        toast('送信しました。担当者より回答いたします。');
        cache.works = null;
        loadWorks();
      })
      .catch(function(e){ say(msg, e.message); })
      .then(function(){ busy(btn, false); });
  }

  /* ══════════════════════════════════════════════
   *  火災保険の証券
   *
   *  ★写しは共有リンクにしません。Apps Script が読んで、
   *    ご本人にだけお渡しします。
   *
   *  ★2026/9/22 作り替え
   *    改良前： 入力欄が7つ縦に並び、預けたものは1証券＝1行のべた並び。
   *             同じ物件の証券が離れて並び、物件は「任意」だったため
   *             空のまま預けられ、まとまりませんでした。満期は見るだけ。
   *    改良後： 1物件＝1つの箱。箱の中に、その物件の証券をまとめます。
   *             ［＋ 別の物件を追加する］で箱ごと足せます。
   *             物件は必須にし、明細から分かる物件名から選べます。
   *             満期の近い箱が上に来て、近づくと札が出ます。
   *
   *  ★サーバーの窓口は1つも増やしていません。
   *    insList が返す prop（物件名）でまとめているだけです。
   * ══════════════════════════════════════════════ */

  /* ===== 検査できる道具（tests/tins.cjs が読みます）ここから =====
   *  ここから下は、画面にも通信にも触りません。
   *  文字を受け取って、文字か数を返すだけです。だから検査できます。 */

  /* 物件名を、見比べるための形にそろえます。
   *  「カルムコート 東棟」「ｶﾙﾑｺｰﾄ東棟」「カルムコート東棟」を同じと見ます。 */
  function insNorm(s){
    var v = String(s == null ? '' : s);
    try{ if(v.normalize) v = v.normalize('NFKC'); }catch(e){}
    return v.toLowerCase().replace(/\s+/g, '');
  }

  /* 年月日を、1日＝1つの番号に直します（引き算できるようにするため）。 */
  function insDayNo(y, m, d){ return Math.floor(Date.UTC(y, m - 1, d) / 86400000); }

  /* 満期日の文字を、年・月・日に読み解きます。
   *  読めるもの： 2028-03-31 ／ 2028/3/31 ／ 2028年3月31日 ／ 20280331 ／ 2028年3月
   *  日が書かれていないときは、その月の末日として扱います。
   *  ★読めないときは null を返します。推測はしません。 */
  function insDue(s){
    var v = String(s == null ? '' : s);
    try{ if(v.normalize) v = v.normalize('NFKC'); }catch(e){}
    v = v.replace(/\s+/g, '');
    var m = v.match(/^(\d{4})(\d{2})(\d{2})$/) ||
            v.match(/(\d{4})\D{1,2}(\d{1,2})(?:\D{1,2}(\d{1,2}))?/);
    if(!m) return null;
    var y = +m[1], mo = +m[2], d = m[3] ? +m[3] : 0;
    if(y < 1900 || y > 2200 || mo < 1 || mo > 12) return null;
    var last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    if(d && (d < 1 || d > last)) return null;
    return { y:y, m:mo, d:(d || 0), n:insDayNo(y, mo, (d || last)) };
  }

  /* 満期まで、あと何日か。過ぎていれば負の数。読めなければ null。 */
  function insDays(until, today){
    var u = insDue(until);
    if(!u) return null;
    var t = (today == null) ? new Date() : new Date(today);
    return u.n - insDayNo(t.getFullYear(), t.getMonth() + 1, t.getDate());
  }

  /* 満期日を、お読みいただく形にします。読めないものは、そのまま出します。 */
  function insYmd(s){
    var u = insDue(s);
    if(!u) return String(s == null ? '' : s);
    return u.y + '年' + u.m + '月' + (u.d ? (u.d + '日') : '末日');
  }

  /* 連絡先の文字から、そのまま電話をかけられる数字だけを取り出します。
   *  「0120-000-000／代理店 ○○（担当 △△）」→ 0120000000
   *  取り出せないときは '' を返します（押せない電話の札は出しません）。 */
  function insTel(s){
    var v = String(s == null ? '' : s);
    try{ if(v.normalize) v = v.normalize('NFKC'); }catch(e){}
    var m = v.match(/0\d[\d\-()]{7,}/);
    if(!m) return '';
    var d = m[0].replace(/\D/g, '');
    return (d.length === 10 || d.length === 11) ? d : '';
  }

  /* 1物件＝1つの箱にまとめます。
   *   ・物件名は insNorm でそろえて見比べます
   *   ・箱の満期は、その箱の中でいちばん近いもの
   *   ・保険会社・連絡先などは、その箱の中でいちばん後に入れられたもの
   *   ・並び：物件名の無い箱はいちばん下。それ以外は満期の近い順、
   *           満期の分からないものはそのあと、名前順 */
  function insGroup(list, today){
    var map = {}, order = [];

    (Array.isArray(list) ? list : []).forEach(function(x){
      var key = insNorm(x && x.prop);
      if(!map[key]){
        map[key] = { key:key, name:'', items:[], days:null, until:'',
                     maker:'', tel:'', mail:'', no:'' };
        order.push(key);
      }
      var g = map[key];
      if(!g.name && x && x.prop) g.name = String(x.prop).trim();

      /* 後のものが勝ちます＝いちばん新しく預けられたもの */
      ['maker', 'tel', 'mail', 'no'].forEach(function(f){
        var v = (x && x[f] != null) ? String(x[f]).trim() : '';
        if(v) g[f] = v;
      });

      var n = insDays(x && x.until, today);
      if(n != null && (g.days == null || n < g.days)){
        g.days  = n;
        g.until = String(x.until).trim();
      }
      g.items.push(x);
    });

    var boxes = order.map(function(k){ return map[k]; });
    boxes.sort(function(a, b){
      var ae = !a.name, be = !b.name;
      if(ae !== be) return ae ? 1 : -1;                 /* 名無しは、いちばん下 */
      var an = (a.days == null), bn = (b.days == null);
      if(an !== bn) return an ? 1 : -1;                 /* 満期不明は、あとに */
      if(!an && a.days !== b.days) return a.days - b.days;
      return String(a.name).localeCompare(String(b.name), 'ja');
    });
    return boxes;
  }

  /* 満期の近さを、3つに分けます。 */
  function insRank(days){
    if(days == null)  return 'none';
    if(days <  0)     return 'over';
    if(days <= 90)    return 'soon';
    return 'ok';
  }
  /* ===== 検査できる道具（火災保険）ここまで ===== */

  var INS_MAX  = 12;        /* おひとり12件まで（Apps Script 側と同じ数） */
  var insRows  = [];        /* 直近に読んだ証券の一覧 */

  function loadIns(){
    $('in-boxes').innerHTML = '<div class="empty">読み込んでいます…</div>';
    /* ★入力欄は閉じません（最初から見えている形にしました）。
     *  改良前はここで隠していたため、［＋ 別の物件を追加する］を
     *  押すまで何も入力できず、1件も預けていない方には
     *  何もない画面に見えていました。 */
    insOpen('');
    /* 物件の候補にホームの物件一覧を使うので、まだ無ければ静かに取ります */
    if(!cache.home){
      auth('home', null, true)
        .then(function(r){ cache.home = r; insCandsIfIdle(); })
        .catch(function(){});
    }
    auth('insList')
      .then(function(r){
        insRows = Array.isArray(r.list) ? r.list : [];
        paintIns();
        insCandsIfIdle();          /* 箱のある物件を、候補から外します */
      })
      .catch(function(e){
        insRows = [];
        $('in-boxes').innerHTML = '<div class="empty">' + esc(e.message) + '</div>';
        $('in-due').hidden = true;
        $('in-cap').textContent = '';
      });
  }

  function paintIns(){
    var boxes = insGroup(insRows);
    var host  = $('in-boxes');

    insNote(boxes);

    if(!boxes.length){
      host.innerHTML = '<div class="empty">火災保険のご登録がまだありません。<br>' +
        '下の［＋ 物件を追加する］よりご登録ください。</div>';
      return;
    }

    host.innerHTML = boxes.map(insBox).join('');

    Array.prototype.forEach.call(host.querySelectorAll('[data-ins]'), function(b){
      b.addEventListener('click', function(){ openIns(b.getAttribute('data-ins'), b); });
    });
    Array.prototype.forEach.call(host.querySelectorAll('[data-insdel]'), function(b){
      b.addEventListener('click', function(){
        dropIns(b.getAttribute('data-insdel'), b.getAttribute('data-insname'));
      });
    });
    Array.prototype.forEach.call(host.querySelectorAll('[data-insadd]'), function(b){
      b.addEventListener('click', function(){ insOpen(b.getAttribute('data-insadd'), true); });
    });
  }

  /* 箱の1つぶん */
  function insBox(g){
    var rank = insRank(g.days);
    var name = g.name || '物件名未設定';

    /* ★箱の見出しに出すのは、万一のときにすぐ要るものだけです。
     *  証券番号は証券ごとに違うので、下の1件ずつの行に出します
     *  （箱にも出すと、2枚あるときにどちらの番号か分からなくなります）。 */
    var kv = [];
    if(g.maker) kv.push(['保険会社', esc(g.maker)]);
    if(g.tel){
      /* ★電話の押せる場所は、番号のところだけにします。
       *  説明の文まで押せると、「（担当 △△）」を押して電話がかかります。 */
      var t = insTel(g.tel);
      kv.push(['連絡先', esc(g.tel) +
        (t ? ('<a class="ins-call" href="tel:' + esc(t) + '">電話をかける</a>') : '')]);
    }
    if(g.mail) kv.push(['メール',
      '<a href="mailto:' + esc(g.mail) + '">' + esc(g.mail) + '</a>']);

    var rows = g.items.map(function(x){
      var sub = [];
      if(x.no)    sub.push('証券 ' + x.no);
      if(x.until) sub.push('満期 ' + insYmd(x.until));
      return '<div class="ins-r">' +
        '<button type="button" class="ins-open" data-ins="' + esc(x.id) + '">' +
          '<span class="ins-rt">' + esc(x.label || '証券の写し') + '</span>' +
          (sub.length ? '<span class="ins-rs">' + esc(sub.join('　')) + '</span>' : '') +
        '</button>' +
        '<button type="button" class="ins-x" data-insdel="' + esc(x.id) +
          '" data-insname="' + esc(name) + '" aria-label="この証券を削除する">✕</button>' +
      '</div>';
    }).join('');

    return '<section class="ins-box ' + rank + '">' +
      '<div class="ins-h">' +
        '<span class="ins-n">' + esc(name) + '</span>' +
        insTag(g) +
      '</div>' +
      (kv.length
        ? '<div class="kv">' + kv.map(function(p){
            return '<span class="k">' + p[0] + '</span><span class="v">' + p[1] + '</span>';
          }).join('') + '</div>'
        : '') +
      '<div class="ins-rows">' + rows + '</div>' +
      (g.name
        ? '<button type="button" class="btn ghost sm" data-insadd="' + esc(g.name) +
            '">＋ この物件に証券を追加する</button>'
        : '<p class="ins-warn">物件名が未入力です。' +
          'お手数ですが、物件名をご入力のうえ再登録いただくと、物件ごとにまとまります。</p>') +
    '</section>';
  }

  function insTag(g){
    switch(insRank(g.days)){
      case 'none': return '<span class="ins-tag none">満期日 未登録</span>';
      case 'over': return '<span class="ins-tag over">満期が過ぎています</span>';
      case 'soon': return '<span class="ins-tag soon">' +
        (g.days === 0 ? '本日が満期です' : ('満期まで あと' + g.days + '日')) + '</span>';
      default:     return '<span class="ins-tag">満期 ' + esc(insYmd(g.until)) + '</span>';
    }
  }

  /* いちばん上の、まとめの一行 */
  function insNote(boxes){
    var el = $('in-due');
    var c  = { over:0, soon:0, none:0 };
    boxes.forEach(function(g){
      var r = insRank(g.days);
      if(c[r] != null) c[r]++;
    });

    var t = [];
    if(c.over) t.push('満期が経過した物件 ' + c.over + '件');
    if(c.soon) t.push('満期まで90日以内の物件 ' + c.soon + '件');
    if(c.none) t.push('満期日が未登録の物件 ' + c.none + '件');

    el.hidden    = !t.length;
    el.className = 'ins-due' + (c.over ? ' over' : (c.soon ? ' soon' : ''));
    el.textContent = t.length ? t.join('　／　') : '';

    $('in-cap').textContent = insRows.length
      ? ('ご登録 ' + insRows.length + '件（上限 ' + INS_MAX + '件）')
      : '';
    $('in-add').disabled = (insRows.length >= INS_MAX);
  }

  /* ── 入力の箱 ──────────────────────────────
   *  ★入力欄は1組だけで、置く場所も動かしません。
   *    同じIDの欄を2つ以上作ると、どちらに入れたのか分からなくなるためです。
   *    また、一覧を描き直すたびに入力欄が消えてしまうのを防ぐため、
   *    一覧（#in-boxes）の中には置きません。 */
  /* 入力欄を、いまの用に合わせて整えます。
   *   name あり … その物件に足す形（物件名は動かせません）
   *   name なし … 新しい物件を入れる形（物件をえらぶところから）
   *
   *  ★入力欄そのものは、いつも見えています。隠しません。
   *    改良前は隠していたため、1件も預けていない方には
   *    何もない画面に見えていました。 */
  function insOpen(name, scroll){
    var fixed = !!name;
    var host  = $('in-form-host');

    $('f-ins').reset();
    say($('in-msg'), '');

    $('in-for').textContent  = fixed ? (name + ' に、証券を追加します。') : '';
    $('in-for').hidden       = !fixed;
    $('in-prop-wrap').hidden = fixed;
    $('in-prop-free').hidden = true;
    $('in-prop').value       = fixed ? name : '';
    /* 新しい物件を入れるときは、やめる先がありません */
    $('in-cancel').hidden    = !fixed;

    if(!fixed) insCands();

    if(scroll){
      try{ host.scrollIntoView({ behavior:'smooth', block:'center' }); }
      catch(e){ host.scrollIntoView(); }
      var first = fixed ? $('in-maker') : $('in-prop-sel');
      if(first){ try{ first.focus({ preventScroll:true }); }catch(e){} }
    }
  }

  /* 物件の候補を作り直します。
   *  ★まだ何もお選びでないときだけ。選びかけのものを消さないためです。
   *
   *  【改良前】 一覧（insList）とホーム（home）が届く前に候補を作っていたため、
   *            すでに箱のある物件が候補に残り、明細から分かる物件が
   *            出てこないことがありました。
   *  【改良後】 届いたときに作り直します。 */
  function insCandsIfIdle(){
    if($('in-prop-wrap').hidden) return;     /* その物件に足す形のときは触りません */
    if($('in-prop-sel').value)   return;     /* すでにお選びなら触りません */
    insCands();
  }

  /* 物件の候補。明細から分かっている物件のうち、まだ箱の無いものを出します。
   *  ★ここに無い物件は［一覧にない物件を入力する］で手で入れられます。
   *    明細がまだ1件も届いていないお客様でも、お預けいただけるようにするためです。 */
  function insCands(){
    var sel  = $('in-prop-sel');
    var have = {};
    insGroup(insRows).forEach(function(g){ if(g.key) have[g.key] = 1; });

    var names = [];
    var props = (cache.home && Array.isArray(cache.home.props)) ? cache.home.props : [];
    props.forEach(function(p){
      var n = (p && p.name) ? String(p.name).trim() : '';
      if(n && !have[insNorm(n)] && names.indexOf(n) < 0) names.push(n);
    });

    sel.innerHTML =
      '<option value="">選択してください</option>' +
      names.map(function(n){
        return '<option value="' + esc(n) + '">' + esc(n) + '</option>';
      }).join('') +
      '<option value="__free__">一覧にない物件を入力する</option>';

    sel.onchange = function(){
      var free = (sel.value === '__free__');
      $('in-prop-free').hidden = !free;
      $('in-prop').value = free ? '' : sel.value;
      if(free){ try{ $('in-prop').focus(); }catch(e){} }
    };
  }

  function openIns(id, btn){
    if(!id) return;
    if(btn){ btn.disabled = true; }
    auth('insFile', { id: id })
      .then(function(r){
        var bin = atob(r.b64 || '');
        var buf = new Uint8Array(bin.length);
        for(var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        var url = URL.createObjectURL(new Blob([buf], { type: r.mime || 'application/pdf' }));
        window.open(url, '_blank');
        setTimeout(function(){ URL.revokeObjectURL(url); }, 60000);
      })
      .catch(function(e){ toast(e.message); })
      .then(function(){ if(btn){ btn.disabled = false; } });
  }

  function dropIns(id, name){
    if(!id) return;
    if(!window.confirm(
      (name ? (name + ' の') : 'ご登録の') + '証券の写しを1件削除します。\n\n' +
      'よろしいですか？')) return;
    auth('insDrop', { id: id })
      .then(function(){ toast('削除しました'); loadIns(); })
      .catch(function(e){ toast(e.message); });
  }

  $('in-add').addEventListener('click', function(){ insOpen('', true); });
  /* ［やめる］は、新しい物件を入れる形に戻します */
  $('in-cancel').addEventListener('click', function(){ insOpen('', true); });

  $('f-ins').addEventListener('submit', function(ev){
    ev.preventDefault();
    var msg  = $('in-msg');
    var prop = ($('in-prop').value || '').trim();
    var f    = $('in-file').files && $('in-file').files[0];

    /* ★物件は必須にしました（改良前は任意）。
     *  空のまま預けられると、物件ごとにまとまらないためです。 */
    if(!prop){
      say(msg, '物件をお選びください。一覧にない場合は' +
               '［一覧にない物件を入力する］よりご入力ください。');
      return;
    }
    if(!f){ say(msg, '証券の写しをお選びください。'); return; }
    if(f.size > 8 * 1024 * 1024){
      say(msg, 'ファイルサイズが上限を超えています。8MB以内のファイルをお選びください。'); return;
    }
    if(insRows.length >= INS_MAX){
      say(msg, 'ご登録は ' + INS_MAX + '件までです。' +
               '不要なものを削除のうえ、もう一度お試しください。');
      return;
    }

    busy($('in-go'), true, '登録しています…');
    var rd = new FileReader();
    rd.onerror = function(){
      say(msg, 'ファイルを読み込めませんでした。'); busy($('in-go'), false);
    };
    rd.onload = function(){
      var b64 = String(rd.result || '').split(',')[1] || '';
      auth('insPut', {
        b64   : b64,
        name  : f.name || '火災保険の証券',
        mime  : f.type || 'application/pdf',
        prop  : prop,
        maker : ($('in-maker').value || '').trim(),
        tel   : ($('in-tel').value   || '').trim(),
        mail  : ($('in-mail').value  || '').trim(),
        no    : ($('in-no').value    || '').trim(),
        /* ★満期日は 2028-03-31 の形で送ります（日付の欄にしたため）。
         *  前に文字で入れられたもの（2028年3月31日）も、そのまま読めます。 */
        until : ($('in-until').value || '').trim()
      })
      .then(function(){
        loadIns();
        toast('登録しました。');
        try{ $('in-boxes').scrollIntoView({ behavior:'smooth', block:'start' }); }
        catch(e){ $('in-boxes').scrollIntoView(); }
      })
      .catch(function(e){ say(msg, e.message); })
      .then(function(){ busy($('in-go'), false); });
    };
    rd.readAsDataURL(f);
  });

  /* ── パスワードを見る／隠す（2026/9/19 追加）────────────
   *  ご年配の方が多く、長いパスワードを打ち間違えても
   *  ●●● のままでは気づけません。目のしるしで確かめられるようにします。
   *  ★見せている状態でそのまま置き去りにならないよう、
   *    画面を移ると必ず隠しに戻します。 */
  function eyeReset(){
    Array.prototype.forEach.call(document.querySelectorAll('.pw-eye'), function(b){
      var el = $(b.getAttribute('data-eye'));
      if(el) el.type = 'password';
      b.classList.remove('on');
      b.setAttribute('aria-label', 'パスワードを表示');
    });
  }

  document.addEventListener('click', function(ev){
    var b = ev.target.closest('.pw-eye');
    if(!b) return;
    var el = $(b.getAttribute('data-eye'));
    if(!el) return;
    var showing = (el.type === 'text');
    el.type = showing ? 'password' : 'text';
    b.classList.toggle('on', !showing);
    b.setAttribute('aria-label', showing ? 'パスワードを表示' : 'パスワードを隠す');
    try{ el.focus(); el.setSelectionRange(el.value.length, el.value.length); }catch(e){}
  });

  /* ── メニュー ─────────────────────────────── */
  $('hd-menu').addEventListener('click', function(ev){
    ev.stopPropagation();
    $('menu').hidden = !$('menu').hidden;
  });
  document.addEventListener('click', function(ev){
    if(!$('menu').hidden && !ev.target.closest('#menu') && !ev.target.closest('#hd-menu')){
      $('menu').hidden = true;
    }
  });
  $('mn-out').addEventListener('click', function(){ logout(); });

  function logout(quiet){
    var t = token;
    token = ''; me = null; cache = {};
    try{ localStorage.removeItem(TKEY); }catch(e){}
    try{ localStorage.removeItem(MKEY); }catch(e){}
    try{ localStorage.removeItem(HKEY); }catch(e){}
    $('li-mail').value = ''; $('li-pass').value = '';
    paintName();
    show('login');
    if(!quiet){
      /* 入館証をクラウド側でも無効にします（失敗しても画面は出ています） */
      call('logout', { token: t }).catch(function(){});
      toast('ログアウトしました');
    }
  }

  function paintName(){
    $('hd-name').textContent = me && me.atena ? me.atena : '';
  }

  /* ── 起動 ─────────────────────────────────── */

  /* ══════════════════════════════════════════════
   *  マイアカウント
   *
   *  ★Apps Script 側は1つも足していません。
   *    ご登録情報 …… me 窓口（お名前・宛名）＋ ログインに使ったアドレス
   *    パスワード …… changePass 窓口（もとからあるもの）
   *    配色 ………… この端末の中だけ。当社へは送りません
   *    ご登録内容の変更
   *              …… ask 窓口（お問い合わせ）へ「登録内容の変更」として送ります
   *
   *  ★なぜ、この画面から直接書き換えないのか
   *    オーナー表にお電話番号・ご住所の列がありません。列を足して
   *    書き込む窓口を作るには Apps Script の変更が要ります。また、
   *    ご登録のアドレスはログインの鍵そのものです。画面から書き換えられると、
   *    打ち間違いでご本人が入れなくなります。そのため、当社が確認して
   *    書き換える形にしています。
   *
   *  ★プロフィール写真は置いていません。
   *    見本（base44）は誰でも見られる場所へ上げる作りで、URLを知られると
   *    社外から顔写真が見えてしまいます。オーナー様の写真を、その形で
   *    扱うわけにはいきません。
   * ══════════════════════════════════════════════ */

  /* ===== 検査できる道具（マイアカウント）ここから ===== */

  var THEMES = [
    { id:'wine',     name:'ワイン',       bg:'#3E1E24', pri:'#C79C6B' },
    { id:'midnight', name:'ミッドナイト', bg:'#141D2E', pri:'#D8AE64' },
    { id:'charcoal', name:'チャコール',   bg:'#23211F', pri:'#C79B75' }
  ];

  /* 一覧にない・空・こわれている → 既定のワインに戻します */
  function thPick(id){
    var v = String(id == null ? '' : id).trim();
    for(var i = 0; i < THEMES.length; i++){ if(THEMES[i].id === v) return v; }
    return THEMES[0].id;
  }
  function thName(id){
    for(var i = 0; i < THEMES.length; i++){ if(THEMES[i].id === id) return THEMES[i].name; }
    return '';
  }
  function thOf(id){
    var v = thPick(id);
    for(var i = 0; i < THEMES.length; i++){ if(THEMES[i].id === v) return THEMES[i]; }
    return THEMES[0];
  }

  /* 全角の数字・記号を半角に直し、空白を取ります */
  function myNum(v){
    var s = String(v == null ? '' : v);
    try{ if(s.normalize) s = s.normalize('NFKC'); }catch(e){}
    return s.replace(/[\s\u3000]+/g, '');
  }

  /* お電話番号。数字が10桁または11桁のときだけ通します。
     ★桁数を直したり、足したりはしません。推測でお直しすると、
       つながらない番号を当社が正しいものとして持ってしまうためです。 */
  function myTel(v){
    var s = myNum(v).replace(/[()\u2015\u30fc\u2212\uff0d]/g, '-');
    if(!/^[0-9+\-]+$/.test(s)) return '';
    var n = s.replace(/[^0-9]/g, '');
    if(n.length < 10 || n.length > 11) return '';
    return s;
  }

  /* 郵便番号。7桁のときだけ 123-4567 の形にします */
  function myZip(v){
    var n = myNum(v).replace(/^\u3012/, '').replace(/[^0-9]/g, '');
    if(n.length !== 7) return '';
    return n.slice(0, 3) + '-' + n.slice(3);
  }

  /* メールアドレス。形だけを見ます（本当に届くかは分かりません） */
  function myMail(v){
    var s = myNum(v);
    if(s.length > 254) return '';
    return /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/.test(s) ? s : '';
  }

  /* 入力の確かめ。通れば null、だめならお知らせの文言を返します */
  function myCheck(f){
    f = f || {};
    if((f.note || '').length > 2000){
      return '文字数が上限を超えています。2,000文字以内でご入力ください。';
    }
    if((f.addr || '').length > 200){
      return 'ご住所が長すぎます。200文字以内でご入力ください。';
    }
    var got = 0;
    if(f.mail){ if(!myMail(f.mail)) return 'メールアドレスの形をご確認ください。'; got++; }
    if(f.tel){
      if(!myTel(f.tel)) return 'お電話番号は市外局番から、10桁または11桁でご入力ください。';
      got++;
    }
    if(f.zip){ if(!myZip(f.zip)) return '郵便番号は7桁でご入力ください。'; got++; }
    if(f.addr) got++;
    if(f.note) got++;
    if(!got) return '変更をご希望の項目をご入力ください。';
    return null;
  }

  /* お問い合わせへ送る本文。ご入力のあった項目だけを並べます。 */
  function myBody(now, f){
    f = f || {};
    var L = ['ご登録内容の変更をお願いいたします。', ''];
    if(f.mail){
      L.push('メールアドレス： ' + (now || '（不明）') + '　→　' + myMail(f.mail));
    }
    if(f.tel){  L.push('お電話番号： ' + myTel(f.tel)); }
    if(f.zip){  L.push('郵便番号： ' + myZip(f.zip)); }
    if(f.addr){ L.push('ご住所： ' + String(f.addr).trim()); }
    if(f.note){ L.push('', '補足：', String(f.note).trim()); }
    return L.join('\n');
  }

  /* ===== 検査できる道具（マイアカウント）ここまで ===== */

  function thSaved(){
    var v = '';
    try{ v = localStorage.getItem(THKEY) || ''; }catch(e){}
    return thPick(v);
  }

  function thApply(id, move){
    var t = thOf(id);
    var h = document.documentElement;
    /* ★色をなめらかに移すのは、切り替えた瞬間だけです。
     *   ふだんから付けると、画面を描き直すたびに全体がにじみます。 */
    if(move){
      h.classList.add('th-move');
      setTimeout(function(){ h.classList.remove('th-move'); }, 420);
    }
    h.setAttribute('data-theme', t.id);
    var m = document.querySelector('meta[name="theme-color"]');
    if(m) m.setAttribute('content', t.bg);
    try{ localStorage.setItem(THKEY, t.id); }catch(e){}
    thPaint();
  }

  function thPaint(){
    var host = $('my-themes');
    if(!host) return;
    var now = thSaved();
    host.innerHTML = THEMES.map(function(t){
      return '<button type="button" class="th-i" data-th="' + t.id + '"' +
             ' aria-pressed="' + (t.id === now ? 'true' : 'false') + '">' +
             '<span class="th-sw" style="background:linear-gradient(135deg,' +
             t.bg + ' 0 55%,' + t.pri + ' 55% 100%)"></span>' +
             '<span class="th-n">' + esc(t.name) + '</span>' +
             '<span class="th-on">選択中</span></button>';
    }).join('');
  }

  function loadAccount(){
    $('my-name').textContent  = (me && me.name)  ? me.name  : '—';
    $('my-atena').textContent = (me && me.atena) ? me.atena : '—';
    var mail = '';
    try{ mail = localStorage.getItem(MKEY) || ''; }catch(e){}
    $('my-mail').textContent = mail || '—';
    say($('my-pw-msg'), '');
    say($('my-info-msg'), '');
    thPaint();
  }

  $('my-themes').addEventListener('click', function(ev){
    var b = ev.target.closest('[data-th]');
    if(!b) return;
    var id = thPick(b.getAttribute('data-th'));
    if(id === thSaved()) return;
    thApply(id, true);
    toast('配色を「' + thName(id) + '」に変更しました');
  });

  $('f-mypass').addEventListener('submit', function(ev){
    ev.preventDefault();
    passSubmit({ cur:'my-cur', a:'my-a', b:'my-b',
                 msg:'my-pw-msg', go:'my-pw-go' });
  });

  $('f-myinfo').addEventListener('submit', function(ev){
    ev.preventDefault();
    var f = {
      mail: ($('my-new-mail').value || '').trim(),
      tel:  ($('my-tel').value  || '').trim(),
      zip:  ($('my-zip').value  || '').trim(),
      addr: ($('my-addr').value || '').trim(),
      note: ($('my-note').value || '').trim()
    };
    var msg = $('my-info-msg');
    var ng  = myCheck(f);
    if(ng){ say(msg, ng); return; }

    var now = '';
    try{ now = localStorage.getItem(MKEY) || ''; }catch(e){}

    busy($('my-info-go'), true, '送信中…');
    auth('ask', { kind: '登録内容の変更', body: myBody(now, f) })
      .then(function(){
        $('f-myinfo').reset();
        say(msg, '承りました。当社にて内容を確認のうえ、変更後にご連絡いたします。', true);
      })
      .catch(function(e){ say(msg, e.message); })
      .then(function(){ busy($('my-info-go'), false); });
  });


  thApply(thSaved(), false);
  try{ token = localStorage.getItem(TKEY) || ''; }catch(e){ token = ''; }

  if(!token){ show('login'); }
  else{
    auth('me')
      .then(function(r){
        me = r.owner || null;
        /* ★再読み込みのときは login ではなく me が呼ばれます。
         *   こちらにも中身が載っていれば、同じだけ速くなります。 */
        if(r.home){   cache.home   = r.home;   homeKeep(r.home); }
        if(r.status){ cache.status = r.status; }
        if(r.papers){ cache.papers = r.papers; }
        if(r.talks){  cache.talks  = Array.isArray(r.talks) ? r.talks
                                     : (r.talks.list || []); }
        paintName();
        if(r.mustChange){ openChangePass(true); return; }
        show('home');
      })
      .catch(function(){ logout(true); });
  }
})();
