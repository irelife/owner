pdf.js（pdfjs-dist 4.10.38）
  https://github.com/mozilla/pdf.js　Apache License 2.0（LICENSE を同梱）

なぜ、ここに置いてあるか
  預けていただいた PDF の「1ページめ（表紙）」を、画面に出すために使います。

  ① よそのサーバー（CDN）から読み込みません。
     オーナー様の証券や明細を扱う画面です。外の置き場が止まったり、
     中身を差し替えられたりする道を、作らないためです。
  ② PDF の中身は、この端末の中だけで描いています。どこへも送っていません。
  ③ 読み込むのは「PDF が選ばれたとき」だけです。写真しか預けない方には、
     1バイトも落ちてきません。大きさは、2つあわせて約1.7MBです。

差し替えかた（新しい版にするとき）
  npm pack pdfjs-dist@<版>
  tar xzf pdfjs-dist-<版>.tgz
  package/build/pdf.min.mjs と package/build/pdf.worker.min.mjs を、ここへ上書き

★2026-10-04 追記　日本語のPDFが真っ白になる不具合を直しました
  改良前： pdf.min.mjs と pdf.worker.min.mjs の2つだけを置いていました。
          日本語のPDF（送金明細・保険証券）は、文字の形を表す「cmaps」と
          「standard_fonts」が無いと、**枠線だけで文字が1つも出ません**。
          実際に送金明細のPDFで試して、真っ白になることを確かめました。
  改良後： cmaps と standard_fonts も一緒に置きました。
  ★この2つは「必要なファイルだけ」が読み込まれます。
    置いてある合計は約2.5MBですが、1枚のPDFで実際に落ちてくるのは
    数KB〜数十KBです。全部が落ちてくるわけではありません。
