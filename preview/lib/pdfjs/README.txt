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
