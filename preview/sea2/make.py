# -*- coding: utf-8 -*-
"""
案C（藍）の index.html を、案B（海）の index.html から作り直します。

  python3 preview/sea2/make.py

★案C は「案B の色だけを変えたもの」です。中身（文・画面・部品）は
  案B とまったく同じにしておきたいので、手では書かず、ここで作ります。
  案B を直したら、これを1回走らせてください。
  色の指定は preview/sea2/style.css だけにあります（ここでは触りません）。
"""
import io, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC  = os.path.join(HERE, '..', 'sea', 'index.html')
DST  = os.path.join(HERE, 'index.html')

s = io.open(SRC, encoding='utf-8').read()

def swap(a, b):
    global s
    if a not in s:
        sys.exit('見つかりませんでした:\n' + a[:120])
    s = s.replace(a, b)

swap('<title>デザイン案B（海）｜オーナーマイページ</title>',
     '<title>デザイン案C（藍）｜オーナーマイページ</title>')

swap('''<!-- ══════════════════════════════════════════════════════════════
     デザイン案B（海）｜9画面''',
     '''<!-- ══════════════════════════════════════════════════════════════
     デザイン案C（藍）｜9画面
       ★案B（海・夕景）の **色だけ** を変えたものです。
         大きさ・余白・字・動き・画面の数は、案Bとまったく同じです。
         案B は ../sea/ にそのまま残してあります。
         この index.html は preview/sea2/make.py が作ります。手で直さないでください。''')

# 読み込むもの（字づかいは案Bのものを読み、色だけ上書きします）
import re
s = re.sub(r'<link rel="stylesheet" href="style\.css\?v=\d+">',
           '<link rel="stylesheet" href="style.css?v=2">', s)
s = re.sub(r'<script src="demo\.js\?v=(\d+)"></script>',
           r'<script src="../sea/demo.js?v=\1"></script>', s)

swap('<b>デザイン案B（海）</b>', '<b>デザイン案C（藍）</b>')
swap('<a href="../sea2/">配色ちがい（案C 藍）を見る</a>',
     '<a href="../sea/">もとの配色（案B 海・夕景）にもどる</a>')

# 絵。夕景 → 月あかりの藍
a = s.index('<!-- ══════════ 海 ══════════ -->')
b = s.index('<div class="veil"')
s = s[:a] + '''<!-- ══════════ 海（藍・月あかり）══════════
     ★かたちは案Bとまったく同じです（空と海の境は、上から246px）。
       色と、空に出るもの（夕日 → 月）だけを替えました。 -->
<div class="sea" aria-hidden="true">
  <svg viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0"    stop-color="#050A14"/>
        <stop offset=".44"  stop-color="#0D1628"/>
        <stop offset=".68"  stop-color="#17243E"/>
        <stop offset=".86"  stop-color="#213152"/>
        <stop offset="1"    stop-color="#2E4167"/>
      </linearGradient>
      <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0"   stop-color="#293B5C"/>
        <stop offset=".18" stop-color="#1D2B47"/>
        <stop offset=".55" stop-color="#111A2C"/>
        <stop offset="1"   stop-color="#060A12"/>
      </linearGradient>
      <linearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0"   stop-color="#DCE7F8" stop-opacity=".46"/>
        <stop offset=".45" stop-color="#C3D2E8" stop-opacity=".14"/>
        <stop offset="1"   stop-color="#C3D2E8" stop-opacity="0"/>
      </linearGradient>
      <radialGradient id="sun" cx=".5" cy=".5" r=".5">
        <stop offset="0"   stop-color="#E6EEFB" stop-opacity=".26"/>
        <stop offset=".55" stop-color="#BFD0EA" stop-opacity=".08"/>
        <stop offset="1"   stop-color="#C3D2E8" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="moon" cx=".5" cy=".5" r=".5">
        <stop offset="0"   stop-color="#F2F6FD" stop-opacity=".92"/>
        <stop offset=".62" stop-color="#E2EAF8" stop-opacity=".55"/>
        <stop offset="1"   stop-color="#C3D2E8" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="390" height="252" fill="url(#sky)"/>
    <ellipse cx="248" cy="252" rx="138" ry="52" fill="url(#sun)"/>
    <!-- 月。ちいさく、ひとつだけ。 -->
    <circle cx="248" cy="138" r="30" fill="url(#moon)" opacity=".34"/>
    <circle cx="248" cy="138" r="11" fill="#EFF4FC" opacity=".62"/>
    <rect y="246" width="390" height="598" fill="url(#water)"/>
    <path d="M248 246 L284 620 L212 620 Z" fill="url(#glow)" opacity=".30"/>
    <g fill="none" stroke="#CBDAF2" stroke-linecap="round">
      <path d="M58 260 h44"   stroke-opacity=".30" stroke-width="1"/>
      <path d="M272 266 h58"  stroke-opacity=".34" stroke-width="1"/>
      <path d="M118 274 h72"  stroke-opacity=".26" stroke-width="1.1"/>
      <path d="M300 284 h52"  stroke-opacity=".28" stroke-width="1.2"/>
      <path d="M28 296 h88"   stroke-opacity=".22" stroke-width="1.3"/>
      <path d="M186 308 h96"  stroke-opacity=".20" stroke-width="1.4"/>
      <path d="M86 324 h70"   stroke-opacity=".14" stroke-width="1.5"/>
      <path d="M254 344 h104" stroke-opacity=".10" stroke-width="1.7"/>
    </g>
  </svg>
</div>
''' + s[b:]

io.open(DST, 'w', encoding='utf-8').write(s)
print('書きました:', DST, len(s), '字')
