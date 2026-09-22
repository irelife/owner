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
  var SCREENS = ['login','forgot','newpass','home','status','papers',
                 'works','insurance','contact'];
  var AFTER_LOGIN = { home:1, status:1, papers:1, works:1, insurance:1, contact:1 };

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
    auth('status')
      .then(function(r){ cache.status = r; paintMoves(r); })
      .catch(function(){ paintMoves(null); });
  }

  function paintMoves(r){
    var out = '';
    if(r){
      out += mvRows(r.newc,  '新規契約', 'new');
      out += mvRows(r.yotei, '解約予定', 'out');
    }
    $('hm-moves').innerHTML = out ||
      '<div class="empty">今月、入退去の予定はございません。</div>';
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
  /* ★ ホームの「年間の収支」と、この画面は同じ中身を使います。
   *   読むのは一度だけにして、二度目からは覚えたものを使います。 */
  function getPapers(){
    if(cache.papers) return Promise.resolve(cache.papers);
    return auth('papers').then(function(r){ cache.papers = r; return r; });
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

  function paintPapers(r){
    var years = Array.isArray(r.years) ? r.years : [];
    if(!years.length){
      $('pp-body').innerHTML = '<div class="empty">明細はまだありません。</div>';
      return;
    }
    $('pp-body').innerHTML = years.map(function(y){
      return '<p class="year">' + esc(y.year) + '年</p><div class="list">' +
             y.items.map(paperOne).join('') + '</div>';
    }).join('');

    /* 見出しを押すと、その月の内わけが開きます */
    Array.prototype.forEach.call($('pp-body').querySelectorAll('.pp-h'), function(h){
      h.addEventListener('click', function(){
        var body = h.parentNode.querySelector('.pp-b');
        if(!body) return;
        body.hidden = !body.hidden;
        h.classList.toggle('open', !body.hidden);
      });
    });
    Array.prototype.forEach.call($('pp-body').querySelectorAll('[data-pdf]'), function(b){
      b.addEventListener('click', function(e){
        e.stopPropagation();
        openPdf(b.getAttribute('data-pdf'), b);
      });
    });
  }

  /* 明細1件。
   * ★ 送金額がまだ届かないサーバーでも止まらないよう、
   *   金額が無いときは、これまでどおりの1行だけにします。 */
  function paperOne(it){
    var rows = Array.isArray(it.rows) ? it.rows : [];
    if(it.total == null && !rows.length){
      return '<div class="item"><button type="button" class="row-btn" data-pdf="' +
             esc(it.id) + '"><span class="t">' + esc(it.label) +
             '</span></button><span class="pdf">PDF</span></div>';
    }
    return '<div class="pp">' +
      '<button type="button" class="pp-h">' +
        '<span class="pp-l">' +
          '<span class="pp-t">' + esc(it.label) + '</span>' +
          (it.sokinDate ? '<span class="pp-s">' + esc(it.sokinDate) + ' お振込</span>' : '') +
        '</span>' +
        '<span class="pp-a">' + (it.total == null ? '—' : '\u00a5' + yen(it.total)) + '</span>' +
        '<span class="pp-c" aria-hidden="true"></span>' +
      '</button>' +
      '<div class="pp-b" hidden>' +
        (rows.length ? '<div class="rows">' + rows.map(function(x){
          var minus = Number(x.amount) < 0;
          return '<div class="row' + (minus ? ' minus' : '') + '">' +
                 '<span>' + esc(x.label) + '</span>' +
                 '<span>' + (minus ? '\u2212' : '') + esc(yen(Math.abs(x.amount))) + '</span></div>';
        }).join('') + '</div>' : '') +
        (it.id ? '<button type="button" class="btn ghost" data-pdf="' + esc(it.id) +
                 '">明細のPDFを開く</button>' : '') +
      '</div>' +
    '</div>';
  }

  /* ── 年間の収支（ホーム） ─────────────────── */
  function loadChart(){
    getPapers().then(paintChart).catch(function(){ $('hm-chart-wrap').hidden = true; });
  }

  /* 万の単位で短くします（棒が細いためです）。1万円に満たなければそのまま。 */
  function man(n){
    var v = Number(n);
    if(!isFinite(v)) return '';
    if(Math.abs(v) >= 10000) return (Math.round(v / 1000) / 10) + '万';
    return yen(v);
  }

  function paintChart(r){
    var list = (r && Array.isArray(r.chart)) ? r.chart : [];
    var has  = list.filter(function(x){ return x.total != null; });
    /* 1か月ぶんしか無いと、山にならないので出しません */
    if(has.length < 2){ $('hm-chart-wrap').hidden = true; return; }

    var max = Math.max.apply(null, has.map(function(x){ return Number(x.total) || 0; }));
    $('hm-chart').innerHTML = '<div class="ch">' + list.map(function(x){
      var v = (x.total == null) ? null : Number(x.total);
      var h = (v == null || max <= 0) ? 0 : Math.max(2, Math.round(v / max * 100));
      return '<div class="ch-c" title="' + esc(x.ym + '　' +
               (v == null ? '—' : yen(v) + '円')) + '">' +
             '<span class="ch-v">' + (v == null ? '' : esc(man(v))) + '</span>' +
             '<span class="ch-w"><span class="ch-b" style="height:' + h + '%"></span></span>' +
             '<span class="ch-x">' + esc(x.month == null ? '' : (x.month + '月')) + '</span>' +
             '</div>';
    }).join('') + '</div>';
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
   * ══════════════════════════════════════════════ */
  function loadIns(){
    $('in-list').innerHTML = '<div class="empty">読み込んでいます…</div>';
    auth('insList')
      .then(function(r){ paintIns(r.list || []); })
      .catch(function(e){
        $('in-list').innerHTML = '<div class="empty">' + esc(e.message) + '</div>';
      });
  }

  function paintIns(list){
    if(!list.length){
      $('in-list').innerHTML =
        '<div class="empty">まだお預かりしていません。</div>';
      return;
    }
    $('in-list').innerHTML = list.map(function(x){
      var sub = [x.prop, x.maker, x.tel, x.mail, x.no ? ('証券 ' + x.no) : '',
                 x.until ? ('満期 ' + x.until) : '']
                .filter(function(v){ return v; }).join('　');
      return '<div class="item ins">' +
        '<button type="button" class="row-btn" data-ins="' + esc(x.id) + '">' +
          '<span class="t">' + esc(x.label) + '</span>' +
          (sub ? '<span class="s">' + esc(sub) + '</span>' : '') +
        '</button>' +
        '<button type="button" class="x" data-insdel="' + esc(x.id) +
          '" aria-label="消す">✕</button>' +
      '</div>';
    }).join('');

    Array.prototype.forEach.call($('in-list').querySelectorAll('[data-ins]'), function(b){
      b.addEventListener('click', function(){ openIns(b.getAttribute('data-ins'), b); });
    });
    Array.prototype.forEach.call($('in-list').querySelectorAll('[data-insdel]'), function(b){
      b.addEventListener('click', function(){ dropIns(b.getAttribute('data-insdel')); });
    });
  }

  function openIns(id, btn){
    if(!id) return;
    var old = btn && btn.textContent;
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
      .then(function(){ if(btn){ btn.disabled = false; if(old) btn.textContent = old; } });
  }

  function dropIns(id){
    if(!window.confirm('お預かりしている証券の写しを消します。\n\nよろしいですか？')) return;
    auth('insDrop', { id: id })
      .then(function(){ toast('消しました'); loadIns(); })
      .catch(function(e){ toast(e.message); });
  }

  $('f-ins').addEventListener('submit', function(ev){
    ev.preventDefault();
    var msg = $('in-msg');
    var f = $('in-file').files && $('in-file').files[0];
    if(!f){ say(msg, '証券の写しを選んでください。'); return; }
    if(f.size > 8 * 1024 * 1024){
      say(msg, 'ファイルが大きすぎます。8MB までにしてください。'); return;
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
        prop  : ($('in-prop').value  || '').trim(),
        maker : ($('in-maker').value || '').trim(),
        tel   : ($('in-tel').value   || '').trim(),
        mail  : ($('in-mail').value  || '').trim(),
        no    : ($('in-no').value    || '').trim(),
        until : ($('in-until').value || '').trim()
      })
      .then(function(){
        $('f-ins').reset();
        say(msg, '');
        loadIns();
        toast('お預かりしました。ありがとうございます。');
        /* 預かったものの一覧が見えるところまで送ります */
        try{ $('in-list').scrollIntoView({ behavior:'smooth', block:'center' }); }
        catch(e){ $('in-list').scrollIntoView(); }
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
