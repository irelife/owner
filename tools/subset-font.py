#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
見出し用の明朝（Shippori Mincho B1）を、使う文字だけに切り出します。

【なぜ切り出すか】
  まるごと読むと、通信量がこうなります（実測、2026/10/5）。
      Google Fonts そのまま（見出しの文字だけ届く形）… 312 KB（1ウェイト）
      自前の切り出し（下の文字だけ）　　　　　　　　 …  33 KB
  10分の1です。オーナー様は、スマートフォンでご覧になります。

【使いかた】
      python3 tools/subset-font.py
  fonts/shippori-mincho-b1.woff2 を作り直します。
  ★見出しの文言を変えたら、これを走らせてください。
    走らせ忘れは tests/tfont.cjs が見つけます。

【必要なもの】
      pip install fonttools brotli
  もとのフォントは、実行時に Google Fonts の公開リポジトリから取ります。

【ライセンス】
  SIL Open Font License 1.1。切り出したものの再配布も認められています。
  fonts/OFL.txt を必ずいっしょに置いてください。
"""
import os, re, sys, subprocess, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC_URL = ('https://raw.githubusercontent.com/google/fonts/main/'
           'ofl/shipporiminchob1/ShipporiMinchoB1-SemiBold.ttf')
OFL_URL = ('https://raw.githubusercontent.com/google/fonts/main/'
           'ofl/shipporiminchob1/OFL.txt')
OUT = os.path.join(ROOT, 'fonts', 'shippori-mincho-b1.woff2')

# ★明朝にする部品。css の「明朝にするところ」と、そろえてください。
#   （ずれていないかは tests/tfont.cjs が見ます）
#
# ★金額は入れていません。わざとです。
#   この書体には tnum（数字の幅をそろえる機能）がありません。
#   数字の幅を測ったところ 543〜614 とばらばらで、縦に並べた金額が
#   そろいませんでした。金額は、いまの書体のままにします。
CLASSES = ['h-mincho', 'sect', 'mya-h', 'tile-t', 'st-t', 'ins-n', 'year']

# ★画面を作るときに JavaScript が足す字。
#   index.html には書かれていないので、ここに並べます。
EXTRA = (
    # .year（「2026年」）と、見出しに出うる記号だけです。
    '0123456789'
    '\u5e74\u6708\u65e5\u5206'
    '\u3001\u3002\u30fb\uff08\uff09()\u300c\u300d\u3010\u3011'
    '\u2015\u2014\u2026\uff0f/\uff05%\uff5e~\u30fc'
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    'abcdefghijklmnopqrstuvwxyz'
    "'\u2019 \u3000"
    '\u6c38'   # えらびの画面に出す見本の字
)


def wanted_chars():
    """index.html の「明朝にする部品」の字 ＋ EXTRA を集めます。"""
    html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    html = re.sub(r'<!--.*?-->', '', html, flags=re.S)
    html = re.sub(r'<script.*?</script>', '', html, flags=re.S)
    got = []
    for cls in CLASSES:
        # ★要素の中身を、最後まで取ります。
        #   以前は最初の「<」までで切っていました。そのため
        #   <p class="sect"><span …></span>年間の収支</p> の
        #   「年間の収支」を取りこぼし、「間」「収」「支」が
        #   フォントから抜けていました（tests/tfont.cjs が見つけました）。
        got += [re.sub(r'<[^>]*>', '', m.group(2)) for m in re.finditer(
            r'<(\w+)[^>]*class="[^"]*\b' + cls + r'\b[^"]*"[^>]*>(.*?)</\1>',
            html, re.S)]
    got += [re.sub(r'<[^>]*>', '', m) for m in
            re.findall(r'<h1[^>]*>(.*?)</h1>', html, re.S)]
    s = ''.join(got) + EXTRA
    return sorted(set(c for c in s if c not in '\n\r\t'))


def main():
    try:
        import fontTools, brotli   # noqa: F401
    except ImportError:
        sys.exit('先に  pip install fonttools brotli  をしてください。')

    chars = wanted_chars()
    print('切り出す文字の種類: %d' % len(chars))

    tmp = os.path.join(HERE, '_src.ttf')
    if not os.path.exists(tmp):
        print('もとのフォントを取ってきます…')
        urllib.request.urlretrieve(SRC_URL, tmp)
    ofl = os.path.join(ROOT, 'fonts', 'OFL.txt')
    if not os.path.exists(ofl):
        urllib.request.urlretrieve(OFL_URL, ofl)

    # ★入れた字の一覧も残します。検査（tests/tfont.cjs）が、
    #   画面に出る字がぜんぶ入っているかを、これで突き合わせます。
    txt = os.path.join(ROOT, 'fonts', 'chars.txt')
    open(txt, 'w', encoding='utf-8').write(''.join(chars))
    subprocess.check_call([
        sys.executable, '-m', 'fontTools.subset', tmp,
        '--text-file=' + txt, '--flavor=woff2',
        "--layout-features=''", '--no-hinting', '--desubroutinize',
        '--output-file=' + OUT])
    print('できました: %s  %.1f KB' % (OUT, os.path.getsize(OUT) / 1024.0))


if __name__ == '__main__':
    main()
