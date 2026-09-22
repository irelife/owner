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
      return Promise.reject(new Error('設定がまだです。担当者へご連絡ください。'));
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
      var e = new Error((r && r.message) || 'うまくいきませんでした。');
      e.code = (r && r.error) || '';
      throw e;
    })
    .catch(function(e){
      if(e && e.code) throw e;
      var e2 = new Error('通信できませんでした。電波の良いところで、もう一度お試しください。');
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
            console.warn('[マイページ] 入館証が通りませんでした： ' + action);
          }catch(x){}
          if(quiet) throw e;                 /* ついでに読むものは、戻しません */
          kick('ログインの有効期限が切れました。' +
               '恐れ入りますが、もう一度お入りください。');
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
                 'works','insurance','contact','accountant'];
  var AFTER_LOGIN = { home:1, status:1, papers:1, works:1, insurance:1,
                      contact:1, accountant:1 };

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
    if(name === 'works')     loadWorks();
    if(name === 'insurance') loadIns();
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
    if(!mail || !pass){ say(msg, 'メールアドレスとパスワードを入れてください。'); return; }

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
          say(msg, 'ログインはできましたが、入館証を受け取れませんでした。' +
                   '恐れ入りますが、担当者へご連絡ください。');
          return;
        }
        try{ localStorage.setItem(TKEY, token); }catch(e){}
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
    if(!mail){ say(msg, 'メールアドレスを入れてください。'); return; }
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
      ? 'はじめてのご利用です。ご自身のパスワードを決めてください。'
      : '新しいパスワードを決めてください。';
    $('np-cur').value = ''; $('np-a').value = ''; $('np-b').value = '';
    say($('np-msg'), '');
    show('newpass');
  }

  $('f-newpass').addEventListener('submit', function(ev){
    ev.preventDefault();
    var cur = $('np-cur').value || '';
    var a   = $('np-a').value || '';
    var b   = $('np-b').value || '';
    var msg = $('np-msg');
    if(a.length < 8){ say(msg, '新しいパスワードは8文字以上にしてください。'); return; }
    if(a !== b){ say(msg, '2つの欄が違います。もう一度お確かめください。'); return; }
    if(a === cur){ say(msg, 'いまと同じパスワードは使えません。'); return; }

    busy($('np-go'), true, '変更中…');
    auth('changePass', { cur: cur, next: a })
      .then(function(){
        $('np-cur').value = ''; $('np-a').value = ''; $('np-b').value = '';
        toast('パスワードを変えました');
        show('home');
      })
      .catch(function(e){ say(msg, e.message); })
      .then(function(){ busy($('np-go'), false); });
  });

  /* ── ホーム ───────────────────────────────── */
  function loadHome(){
    if(cache.home){ paintHome(cache.home); }
    else{
      auth('home')
        .then(function(r){ cache.home = r; paintHome(r); })
        .catch(function(e){ toast(e.message); });
    }
    loadMoves();
    loadChart();
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
      : '<div class="empty">物件の情報がまだありません。</div>';
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
      /* ★ 右の札には「新規契約」「解約予定」と出します。
       *   サーバーが返す tag は、解約予定のときは日付なので、
       *   下の行に回します。 */
      var sub = [];
      if(x.tag && x.tag !== label && x.tag !== '新規') sub.push(x.tag);
      if(x.detail) sub.push(x.detail);
      return '<button type="button" class="mv">' +
        '<span class="mv-l">' +
          '<span class="mv-t">' + esc(x.place) + '</span>' +
          (sub.length ? '<span class="mv-s">' + esc(sub.join('　')) + '</span>' : '') +
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
             ' ございます。</p>';
    }

    out += boxes.map(function(g){
      return '<section class="st-prop">' +
        '<h2 class="st-pn">' +
          esc(g.name || '物件名の入っていないもの') +
        '</h2>' +
        g.rooms.map(function(u){
          var kind = ST_CLASS[u.kind] || 'rec';
          var head = u.room || u.place || '—';
          var sub  = [];
          /* 解約予定のときの tag は日付なので、下の行に回します。
             ★ただし detail があるときは出しません。
               detail にも同じ日付が入っており
               「2026年10月31日　2026/10/31 解約予定です。」と
               二重に出ていました。tag が「解約予定」のときは
               右の札と同じ文字になるのも防げます。 */
          if(u.kind === '解約予定' && u.tag && !u.detail) sub.push(u.tag);
          if(u.detail) sub.push(u.detail);
          /* 過ぎて募集中にしたものは、その理由を出します。
             黙って差し替えると、何が起きたのか分からなくなるためです。 */
          if(u.moved){
            sub.push('解約予定日（' + u.movedDate +
                     '）を過ぎたため、募集中としております。');
          }
          return '<div class="stat ' + kind + '">' +
            '<div class="st-h">' +
              '<span class="st-t">' + esc(head) + '</span>' +
              '<span class="st-tag ' + kind + '">' + esc(u.kind) + '</span>' +
            '</div>' +
            (sub.length ? '<span class="st-d">' + esc(sub.join('　')) + '</span>' : '') +
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
      $('pp-hero').innerHTML = '<div class="empty">明細はまだありません。</div>';
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
          '<span class="pp-s">送金日 ' + esc(it.sokinDate || '—') + '</span>' +
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
          (it.id ? '<button type="button" class="btn ghost sm" data-pdf="' + esc(it.id) +
                   '">' + IC_DL + 'PDF</button>' : '') +
          (rows.length ? '<button type="button" class="btn ghost sm" data-csv="' +
                   esc(it.ym) + '">' + IC_SHEET + 'CSV</button>' : '') +
        '</div>' +
      '</div>' : '') +
    '</div>';
  }

  var IC_DL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0l-4-4m4 4l4-4"/>' +
              '<path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>';
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
  }

  /* ★ CSV は、いま画面が持っている内わけから作ります。
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
    a.download = ym + 'ぶん 送金明細.csv';
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

  /* 明細の内わけから、月ごとの 収入・支出・累積収支 を作ります */
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
      /* 内わけが無い月は、ご送金額を収入として見ます */
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
        '<span class="c2-v">' + (i === last ? esc(man(x.inc)) : '') + '</span>' +
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
      '<details class="ch-tb"><summary>数字で見る</summary>' +
        '<table><thead><tr><th>月</th><th>収入</th><th>支出</th><th>累積収支</th></tr></thead>' +
        '<tbody>' + d.map(function(x){
          return '<tr><th scope="row">' + esc(x.ym) + '</th>' +
                 '<td>¥' + esc(yen(x.inc)) + '</td>' +
                 '<td>−¥' + esc(yen(x.out)) + '</td>' +
                 '<td>¥' + esc(yen(x.run)) + '</td></tr>';
        }).join('') + '</tbody></table></details>';

    $('hm-chart-wrap').hidden = false;
  }
  /* ★ PDF は Apps Script から受け取って、その場で開きます。
       共有リンクにはしません。リンクが1本漏れると、
       知っている人なら誰でも見られてしまうためです。 */
  function openPdf(id, btn){
    if(!id) return;
    var old = btn && btn.textContent;
    if(btn){ btn.disabled = true; btn.textContent = '開いています…'; }
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
      .then(function(r){ paintTalks(r.list || []); })
      .catch(function(e){
        $('ct-list').innerHTML = '<div class="empty">' + esc(e.message) + '</div>';
      });
  }

  function paintTalks(list){
    if(!list.length){
      $('ct-list').innerHTML = '<div class="empty">まだご相談はありません。</div>';
      return;
    }
    $('ct-list').innerHTML = list.map(function(t){
      var done = String(t.state || '') === '回答済み';
      var talk = (t.msgs || []).map(function(m){
        var mine = (m.who === 'オーナー');
        return '<div class="bub' + (mine ? ' mine' : '') + '">' +
               '<span class="bub-w">' + esc(mine ? 'お客様' : 'IREライフ') +
               '　' + esc(m.at) + '</span>' +
               '<span class="bub-b">' + esc(m.body) + '</span></div>';
      }).join('');

      return '<div class="work">' +
        '<div class="wk-h">' +
          '<span class="wk-p">' + esc(t.date) + '</span>' +
          '<span class="chip' + (done ? ' done' : ' wait') + '">' +
            (done ? '回答済み' : '確認中') + '</span>' +
        '</div>' +
        '<p class="wk-t">' + esc(t.kind) + '</p>' +
        '<div class="talk">' + talk + '</div>' +
        '<details class="ask">' +
          '<summary>このご相談に続けて書く</summary>' +
          '<textarea rows="4" data-tk="' + esc(t.id) +
            '" placeholder="ご自由にお書きください。"></textarea>' +
          '<button type="button" class="btn ghost" data-tksend="' + esc(t.id) +
            '">送信する</button>' +
          '<span class="msg" data-tkmsg="' + esc(t.id) + '"></span>' +
        '</details>' +
      '</div>';
    }).join('');

    Array.prototype.forEach.call($('ct-list').querySelectorAll('[data-tksend]'), function(b){
      b.addEventListener('click', function(){ sendTalk(b.getAttribute('data-tksend'), b); });
    });
  }

  function sendTalk(id, btn){
    var ta  = $('ct-list').querySelector('[data-tk="' + id + '"]');
    var msg = $('ct-list').querySelector('[data-tkmsg="' + id + '"]');
    var body = ta ? (ta.value || '').trim() : '';
    if(!body){ say(msg, '内容をお書きください。'); return; }
    if(body.length > 2000){ say(msg, '長すぎます。2000文字までにしてください。'); return; }

    busy(btn, true);
    auth('talkMsg', { id: id, body: body })
      .then(function(){
        if(ta) ta.value = '';
        toast('送信しました。お返事をお待ちください。');
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
    if(!body){ say(msg, '内容をお書きください。'); return; }
    if(body.length > 2000){ say(msg, '長すぎます。2000文字までにしてください。'); return; }

    busy($('ct-go'), true);
    auth('ask', { kind: kind, body: body })
      .then(function(){
        $('ct-body').value = '';
        say(msg, '');
        /* ★送れたことが分かるよう、書く欄を閉じて一覧に戻します */
        $('ct-new').open = false;
        loadContact();
        toast('送信しました。お返事をお待ちください。');
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
        '<div class="empty">いまのところ、原状回復・修繕の予定はありません。</div>';
      return;
    }
    $('wk-body').innerHTML = list.map(function(w){
      var kind = WK_STATE[w.state] || 'wait';
      var rows = '';
      if(w.from || w.to){
        rows += line('いつ', (w.from || '—') + (w.to ? '　〜　' + w.to : '　〜'));
      }
      if(w.yen !== null && w.yen !== undefined){
        rows += line('費用', yen(w.yen) + ' 円');
      }
      if(w.offset){ rows += line('相殺の予定', w.offset); }
      if(w.note){   rows += line('補足', w.note); }

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
          '<summary>この工事について連絡する</summary>' +
          '<textarea rows="4" data-wk="' + esc(w.id) +
            '" placeholder="ご質問やご要望を、ご自由にお書きください。"></textarea>' +
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
    if(!body){ say(msg, '内容をお書きください。'); return; }
    if(body.length > 2000){ say(msg, '長すぎます。2000文字までにしてください。'); return; }

    busy(btn, true);
    auth('workMsg', { id: id, body: body })
      .then(function(){
        if(ta) ta.value = '';
        /* ★ここで一覧を描き直すので、この欄の字は消えてしまいます。
           消えない帯（toast）でお伝えします。
           書いたものがその場でやりとりに並ぶので、それも目印になります。 */
        toast('送信しました。お返事をお待ちください。');
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
    insShut();
    /* 物件の候補にホームの物件一覧を使うので、まだ無ければ静かに取ります */
    if(!cache.home){
      auth('home').then(function(r){ cache.home = r; }).catch(function(){});
    }
    auth('insList')
      .then(function(r){
        insRows = Array.isArray(r.list) ? r.list : [];
        paintIns();
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
      host.innerHTML = '<div class="empty">まだお預かりしていません。<br>' +
        '下の［＋ 別の物件を追加する］から、1件目をお入れください。</div>';
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
      b.addEventListener('click', function(){ insForm(b.getAttribute('data-insadd')); });
    });
  }

  /* 箱の1つぶん */
  function insBox(g){
    var rank = insRank(g.days);
    var name = g.name || '物件名の入っていないもの';

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
          '" data-insname="' + esc(name) + '" aria-label="この写しを消す">✕</button>' +
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
        : '<p class="ins-warn">物件名が入っていません。' +
          'お手数ですが、物件名を入れて預け直していただくと、物件ごとにまとまります。</p>') +
    '</section>';
  }

  function insTag(g){
    switch(insRank(g.days)){
      case 'none': return '<span class="ins-tag none">満期日が未記入</span>';
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
    if(c.over) t.push('満期の過ぎた物件が ' + c.over + '件');
    if(c.soon) t.push('満期まで90日以内の物件が ' + c.soon + '件');
    if(c.none) t.push('満期日をいただいていない物件が ' + c.none + '件');

    el.hidden    = !t.length;
    el.className = 'ins-due' + (c.over ? ' over' : (c.soon ? ' soon' : ''));
    el.textContent = t.length ? (t.join('　／　') + ' ございます。') : '';

    $('in-cap').textContent = insRows.length
      ? ('お預かりしているもの ' + insRows.length + '件（おひとり ' + INS_MAX + '件までです）')
      : '';
    $('in-add').disabled = (insRows.length >= INS_MAX);
  }

  /* ── 入力の箱 ──────────────────────────────
   *  ★入力欄は1組だけで、置く場所も動かしません。
   *    同じIDの欄を2つ以上作ると、どちらに入れたのか分からなくなるためです。
   *    また、一覧を描き直すたびに入力欄が消えてしまうのを防ぐため、
   *    一覧（#in-boxes）の中には置きません。 */
  function insForm(name){
    var fixed = !!name;
    var host  = $('in-form-host');

    $('f-ins').reset();
    say($('in-msg'), '');

    $('in-for').textContent  = fixed ? (name + ' に、証券を追加します。') : '';
    $('in-for').hidden       = !fixed;
    $('in-prop-wrap').hidden = fixed;
    $('in-prop-free').hidden = true;
    $('in-prop').value       = fixed ? name : '';

    if(!fixed) insCands();

    host.hidden = false;
    try{ host.scrollIntoView({ behavior:'smooth', block:'center' }); }
    catch(e){ host.scrollIntoView(); }

    var first = fixed ? $('in-maker') : $('in-prop-sel');
    if(first){ try{ first.focus({ preventScroll:true }); }catch(e){} }
  }

  function insShut(){
    var host = $('in-form-host');
    if(!host) return;
    host.hidden = true;
    $('f-ins').reset();
    say($('in-msg'), '');
    $('in-prop-free').hidden = true;
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
      '<option value="">選んでください</option>' +
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
      (name ? (name + ' の') : 'お預かりしている') + '証券の写しを1件消します。\n\n' +
      'よろしいですか？')) return;
    auth('insDrop', { id: id })
      .then(function(){ toast('消しました'); loadIns(); })
      .catch(function(e){ toast(e.message); });
  }

  $('in-add').addEventListener('click', function(){ insForm(''); });
  $('in-cancel').addEventListener('click', function(){ insShut(); });

  $('f-ins').addEventListener('submit', function(ev){
    ev.preventDefault();
    var msg  = $('in-msg');
    var prop = ($('in-prop').value || '').trim();
    var f    = $('in-file').files && $('in-file').files[0];

    /* ★物件は必須にしました（改良前は任意）。
     *  空のまま預けられると、物件ごとにまとまらないためです。 */
    if(!prop){
      say(msg, '物件をお選びください。一覧に無いときは' +
               '［一覧にない物件を入力する］からお入れください。');
      return;
    }
    if(!f){ say(msg, '証券の写しを選んでください。'); return; }
    if(f.size > 8 * 1024 * 1024){
      say(msg, 'ファイルが大きすぎます。8MB までにしてください。'); return;
    }
    if(insRows.length >= INS_MAX){
      say(msg, 'お預かりは、おひとり ' + INS_MAX + '件までです。' +
               '古いものを消してから、もう一度お試しください。');
      return;
    }

    busy($('in-go'), true, '預かっています…');
    var rd = new FileReader();
    rd.onerror = function(){
      say(msg, 'ファイルを読めませんでした。'); busy($('in-go'), false);
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
        insShut();
        loadIns();
        toast('お預かりしました。ありがとうございます。');
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
  try{ token = localStorage.getItem(TKEY) || ''; }catch(e){ token = ''; }

  if(!token){ show('login'); }
  else{
    auth('me')
      .then(function(r){
        me = r.owner || null;
        paintName();
        if(r.mustChange){ openChangePass(true); return; }
        show('home');
      })
      .catch(function(){ logout(true); });
  }
})();
