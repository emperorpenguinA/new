# 🍜 ラーメンマップ

Google TakeoutでエクスポートしたGoogleフォトのフォルダを指定すると、写真の位置情報から
地図上にラーメン屋さんの場所をプロットするアプリです。

## なぜGoogle Takeoutを使うのか

Google Photos API(Picker API / Library API)は、プライバシー保護のため、APIごしに
取得できる写真データから位置情報を取り除いています。Googleフォトの画面上では位置情報が
表示されていても、API経由でダウンロードした画像データにはExifのGPS情報が入っていません。

一方、[Google Takeout](https://takeout.google.com/) で自分のGoogleフォトをエクスポートすると、
**元のExif情報がそのまま残った状態**で写真をダウンロードできます。さらに写真ごとに
`<ファイル名>.json` という付属ファイルが出力され、そこにGoogle側が推定した位置情報
(`geoData`)が入っていることもあります。本アプリはこの2つから位置情報を読み取ります。

## 使い方

### 1. Googleフォトをエクスポートする

1. https://takeout.google.com/ を開く
2. 「すべて選択を解除」した上で、**「Googleフォト」だけ**にチェックを入れる
   (特定のアルバムだけエクスポートしたい場合は、Googleフォト側でラーメン写真だけを
   集めたアルバムを作っておくと、対象を絞り込めます)
3. 「次のステップ」→エクスポート方法を選んで作成
4. 準備ができたらメールで通知が届くので、zipファイルをダウンロードして展開する

### 2. アプリを起動する

```sh
npm install
npm start
```

ブラウザで http://localhost:3000 を開き、展開したフォルダのパス
(例: `/home/you/Downloads/Takeout/Google フォト`)を入力して「スキャンする」を押してください。

写真の枚数が多いと、全てのExifを読み込むのに時間がかかります。

## 技術構成

- Node.js + Express (ビルドステップ無し、素のJavaScript)
- EXIF GPS抽出: [exifr](https://github.com/MikeKovarik/exifr)
- フロントエンド: 素のHTML/CSS/JavaScript + [Leaflet](https://leafletjs.com/) + OpenStreetMap
