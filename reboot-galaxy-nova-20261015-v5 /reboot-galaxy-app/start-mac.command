#!/bin/bash
# Reboot Galaxy NOVA をダブルクリックで起動します。
# このターミナルの窓を閉じると、アプリも止まります。開いたままにしてください。

cd "$(dirname "$0")" || exit 1

pause() { read -n 1 -s -r -p "何かキーを押すと閉じます"; echo; }

# ---- 1. Node.js が入っているか ----
if ! command -v node > /dev/null; then
  echo "Node.js が見つかりません。"
  echo "https://nodejs.org/ から LTS版（v24 以上）を入れてください。"
  pause; exit 1
fi

# ---- 2. バージョンが足りているか（v24 以上） ----
NODE_MAJOR=$(node -p process.versions.node | cut -d. -f1)
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 24 ]; then
  echo "Node.js のバージョンが古いです（いま $(node -v)）。このアプリには v24 以上が必要です。"
  echo "https://nodejs.org/ から LTS版 を入れ直してください。"
  pause; exit 1
fi

# ---- 3. 部品がそろっているか（サーバーの部品と、画面のデザイン系ライブラリ） ----
need_install=0
for pkg in express bcryptjs compression three gsap; do
  node -e "require.resolve(process.argv[1])" "$pkg" >/dev/null 2>&1 || need_install=1
done

if [ "$need_install" = "1" ]; then
  echo "初回の準備をしています（数分かかることがあります）…"
  echo
  if ! npm ci; then
    echo
    echo "準備に失敗しました。ネットワークと上のエラーを確認し、npm install を再実行してください。"
    echo "保存データ（data フォルダ）と package-lock.json は削除しないでください。"
    pause; exit 1
  fi
  echo
fi

# RG_OPEN=1 を渡すと、起動が終わってから実際に使えたポートの URL をブラウザで開きます。
export RG_OPEN=1
npm start

echo
echo "アプリを終了しました。"
pause
