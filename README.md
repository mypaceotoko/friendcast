# friendcast v0.1

## 1. friendcastの概要
friendcastは「親しい人にだけ届ける、声のタイムライン」をコンセプトにしたクローズド型音声SNSです。スマホで直感的に使えるX/Twitter風タイムラインをベースにしつつ、音声投稿が主役になるUIを目指しています。

## 2. v0.1で実装した内容
- スマホファースト・ダークモードのUIプロトタイプ
- 7画面: ホーム / 投稿作成 / 公開範囲選択（投稿作成内） / 投稿詳細 / プロフィール / 友人検索・招待 / 設定
- モックデータによる複数タイプ投稿（短文のみ、音声付き、日記、愚痴、問題提起、公開範囲別、音声返信付き）
- 簡易動作:
  - 下部ナビゲーションで画面切り替え
  - 140文字カウント
  - 公開範囲選択の反映
  - 再生中っぽい見た目切り替え
  - 録音中っぽいアニメーション切り替え
  - 返信ボタンから投稿詳細へ遷移

## 3. v0.1でまだ実装していない内容
- Googleログイン
- Supabase/DB接続
- 実音声ファイルの保存・配信
- 本格的な公開範囲権限制御
- フォロー/フォロワーの実データ管理
- 通知・解析・AI機能

## 4. 次に実装すべきv0.2内容
- Googleログイン導入
- ユーザープロフィールの永続化
- フォロー/フォロワーのデータモデル実装
- 検索・招待導線のデータ接続
- 投稿の公開範囲モデル定義（UIは既存を流用）

## 5. ローカルでの起動方法
```bash
npm install
npm run dev
```
ブラウザで表示されたローカルURLにアクセスしてください。


## 6. Vercelで公開する手順（初心者向け）

### 事前確認（このリポジトリの状態）
- `npm run build` が成功すること
- ビルド成果物が `dist/` に出力されること
- Vercel向け設定として `vercel.json` を追加済み

### 1) GitHubにpushする
```bash
git add .
git commit -m "Prepare Vercel deployment"
git push origin <your-branch>
```

### 2) Vercelアカウントを作成
1. https://vercel.com にアクセス
2. 「Continue with GitHub」でログイン
3. GitHub連携を許可

### 3) プロジェクトをImport
1. Vercelダッシュボードで「Add New...」→「Project」
2. `friendcast` リポジトリを選択
3. Framework Preset が `Vite` になっていることを確認

### 4) Build設定を確認
Vercelの設定画面で次を確認してください。
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`（通常自動）

このリポジトリでは `vercel.json` に同内容を明示しています。

### 5) Deploy実行
「Deploy」を押すとビルドが開始されます。
完了後、`https://xxxxx.vercel.app` のURLが発行されます。

### 6) 再デプロイ
- `main` ブランチにマージ後はpushごとに自動デプロイ
- PRごとにPreview URLが発行されるため、UI確認に便利です

### トラブル時のチェック
- ローカルで `npm run build` が通るか
- VercelのBuild Logsでエラー行を確認
- `Output Directory` が `dist` になっているか
- ルーティングで404が出る場合、`vercel.json` の `rewrites` 設定が反映されているか
