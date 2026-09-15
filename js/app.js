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
  function busy(btn, on, label){
    if(!btn) return;
    btn.disabled = !!on;
    if(on){ btn.dataset.label = btn.textContent; btn.textContent = label || '送信中…'; }
    else if(btn.dataset.label){ btn.textContent = btn.dataset.label; }
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

  /* 入館証つきで送ります。切れていたらログイン画面へ戻します。 */
  function auth(action, data){
    return call(action, Object.assign({ token: token }, data || {}))
      .catch(function(e){
        if(e.code === 'auth'){
          logout(true);
          throw new Error('ログインの有効期限が切れました。もう一度お入りください。');
        }
        throw e;
      });
  }

  /* ── 画面の出し入れ ───────────────────────── */
  var SCREENS = ['login','forgot','newpass','home','status','papers','contact'];
  var AFTER_LOGIN = { home:1, status:1, papers:1, contact:1 };

  function show(name){
    SCREENS.forEach(function(n){
      var el = $('s-' + n);
      if(el) el.hidden = (n !== name);
    });
    $('app').hidden = !AFTER_LOGIN[name];
    $('menu').hidden = true;
    $('boot').hidden = true;
    window.scrollTo(0, 0);
    if(name === 'home')    loadHome();
    if(name === 'status')  loadStatus();
    if(name === 'papers')  loadPapers();
    if(name === 'contact') loadContact();
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
        say(msg, 'ご登録があれば、再設定のご案内をお送りしました。メールをご確認ください。', true);
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
    if(cache.home){ paintHome(cache.home); return; }
    auth('home')
      .then(function(r){ cache.home = r; paintHome(r); })
      .catch(function(e){ toast(e.message); });
  }

  function paintHome(r){
    $('hm-month').textContent = r.month ? (r.month + '分') : '';
    $('hm-date').textContent  = r.sokinDate ? (r.sokinDate + ' お振込予定') : 'お振込予定';
    $('hm-total').innerHTML   = (r.total == null)
      ? '—'
      : esc(yen(r.total)) + '<i>円</i>';

    var rows = Array.isArray(r.rows) ? r.rows : [];
    $('hm-rows').innerHTML = rows.map(function(x){
      var minus = Number(x.amount) < 0;
      return '<div class="row' + (minus ? ' minus' : '') + '">' +
             '<span>' + esc(x.label) + '</span>' +
             '<span>' + (minus ? '−' : '') + esc(yen(Math.abs(x.amount))) + '</span></div>';
    }).join('');

    $('hm-pdf').hidden = !r.pdfId;
    $('hm-pdf').onclick = function(){ openPdf(r.pdfId, $('hm-pdf')); };

    var mv = r.moves || {};
    $('hm-moves').innerHTML =
      move(mv.newc, '新規契約') + move(mv.yotei, '解約予定') + move(mv.boshu, '募集中');
    Array.prototype.forEach.call($('hm-moves').children, function(el){
      el.addEventListener('click', function(){ show('status'); });
    });

    var props = Array.isArray(r.props) ? r.props : [];
    $('hm-props').innerHTML = props.length
      ? props.map(function(p){
          return '<div class="item"><span class="t">' + esc(p.name) + '</span>' +
                 '<span class="s">' + esc(p.note || '') + '</span></div>';
        }).join('')
      : '<div class="empty">物件の情報がまだありません。</div>';
  }

  function move(n, label){
    var v = Number(n) || 0;
    return '<button type="button" class="move' + (v ? '' : ' zero') + '">' +
           '<b>' + v + '</b><span>' + label + '</span></button>';
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

  function paintStatus(r){
    $('st-month').textContent = r.month ? (r.month + '分') : '';
    var out = '';
    out += block('新規契約', r.newc,  'new');
    out += block('解約予定', r.yotei, 'out');
    out += block('募集中',   r.boshu, 'rec');
    $('st-body').innerHTML = out ||
      '<div class="empty">今月、入退去の予定はございません。</div>';

    var has = !!(r.message && String(r.message).trim());
    $('st-letter').hidden = !has;
    if(has) $('st-msg').textContent = r.message;
  }

  function block(title, list, kind){
    if(!Array.isArray(list) || !list.length) return '';
    return '<p class="sect">' + esc(title) + '</p>' + list.map(function(x){
      return '<div class="stat ' + kind + '">' +
        '<div class="st-h">' +
          '<span class="st-t">' + esc(x.place) + '</span>' +
          (x.tag ? '<span class="st-tag ' + kind + '">' + esc(x.tag) + '</span>' : '') +
        '</div>' +
        (x.detail ? '<span class="st-d">' + esc(x.detail) + '</span>' : '') +
      '</div>';
    }).join('');
  }

  /* ── 過去の明細 ───────────────────────────── */
  function loadPapers(){
    if(cache.papers){ paintPapers(cache.papers); return; }
    $('pp-body').innerHTML = '<div class="empty">読み込んでいます…</div>';
    auth('papers')
      .then(function(r){ cache.papers = r; paintPapers(r); })
      .catch(function(e){
        $('pp-body').innerHTML = '<div class="empty">' + esc(e.message) + '</div>';
      });
  }

  function paintPapers(r){
    var years = Array.isArray(r.years) ? r.years : [];
    if(!years.length){
      $('pp-body').innerHTML = '<div class="empty">明細はまだありません。</div>';
      return;
    }
    $('pp-body').innerHTML = years.map(function(y){
      return '<p class="year">' + esc(y.year) + '年</p><div class="list">' +
        y.items.map(function(it){
          return '<div class="item"><button type="button" class="row-btn" data-pdf="' +
                 esc(it.id) + '"><span class="t">' + esc(it.label) +
                 '</span></button><span class="pdf">PDF</span></div>';
        }).join('') + '</div>';
    }).join('');

    Array.prototype.forEach.call($('pp-body').querySelectorAll('[data-pdf]'), function(b){
      b.addEventListener('click', function(){ openPdf(b.getAttribute('data-pdf'), b); });
    });
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

  /* ── お問い合わせ ─────────────────────────── */
  function loadContact(){
    auth('threads')
      .then(function(r){ paintThreads(r.list || []); })
      .catch(function(){ paintThreads([]); });
  }

  function paintThreads(list){
    $('ct-list').innerHTML = list.length
      ? list.map(function(t){
          var done = String(t.status || '') === '回答済み';
          return '<div class="thread">' +
            '<div class="th-h"><span class="th-t">' + esc(t.kind) + '</span>' +
            '<span class="th-d">' + esc(t.date) + '</span></div>' +
            '<span class="th-b">' + esc(t.body) + '</span>' +
            '<span class="chip' + (done ? '' : ' wait') + '">' +
            (done ? '回答済み' : '確認中') + '</span></div>';
        }).join('')
      : '<div class="empty">まだお問い合わせはありません。</div>';
  }

  $('f-contact').addEventListener('submit', function(ev){
    ev.preventDefault();
    var kind = $('ct-kind').value;
    var body = ($('ct-body').value || '').trim();
    var msg  = $('ct-msg');
    if(!body){ say(msg, '内容をお書きください。'); return; }
    if(body.length > 2000){ say(msg, '長すぎます。2000文字までにしてください。'); return; }

    busy($('ct-go'), true);
    auth('contact', { kind: kind, body: body })
      .then(function(){
        $('ct-body').value = '';
        say(msg, '送信しました。お返事をお待ちください。', true);
        loadContact();
      })
      .catch(function(e){ say(msg, e.message); })
      .then(function(){ busy($('ct-go'), false); });
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
