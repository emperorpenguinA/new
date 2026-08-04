# 🍜 ラーメンマップ

Googleフォトにあるラーメンの写真を選ぶと、写真のEXIF位置情報から地図上にプロットするアプリです。

## しくみ

Google Photos API はプライバシー保護のため位置情報そのものは返しません。そのため、
Google Photos Picker API でユーザーに写真を選んでもらい、選ばれた写真の実データを
ダウンロードしてEXIFのGPS情報を読み取る、という流れで実現しています。

1. Googleアカウントでログイン(OAuth2)
2. Google Photos Picker APIで写真選択セッションを作成し、ユーザーがGoogleフォト側の
   画面でラーメンの写真を選ぶ
3. 選ばれた写真をダウンロードし、EXIFのGPS情報を抽出([exifr](https://github.com/MikeKovarik/exifr)を使用)
4. 緯度経度が取れた写真をLeaflet + OpenStreetMap の地図上にマーカー表示

## セットアップ

### 1. Google Cloud側の準備

1. [Google Cloud Console](https://console.cloud.google.com/)でプロジェクトを作成
2. 「APIとサービス」→「ライブラリ」で **Google Photos Picker API** を有効化
3. 「認証情報」でOAuth 2.0クライアントID(ウェブアプリケーション)を作成
   - 承認済みのリダイレクトURIに `http://localhost:3000/oauth2callback` を登録

### 2. アプリの起動

```sh
npm install
cp .env.example .env
# .env を編集し、GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / SESSION_SECRET を設定する

npm start
```

ブラウザで http://localhost:3000 を開いてください。

## 技術構成

- Node.js + Express (ビルドステップ無し、素のJavaScript)
- セッション管理: express-session (メモリストア。個人利用・検証用途向け)
- EXIF GPS抽出: [exifr](https://github.com/MikeKovarik/exifr)
- フロントエンド: 素のHTML/CSS/JavaScript + [Leaflet](https://leafletjs.com/) + OpenStreetMap
