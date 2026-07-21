#!/usr/bin/env bash
set -euo pipefail
cd /home/user/workspace/moche-app
TOKEN="$VERCEL_TOKEN"
SCOPE="moche-ai"
ENVFILE="/tmp/mapp_full.env"

# Parse KEY=VALUE lines (values may be quoted by `vercel env pull`)
while IFS= read -r line; do
  [[ "$line" =~ ^[A-Z0-9_]+= ]] || continue
  key="${line%%=*}"
  val="${line#*=}"
  # strip surrounding double quotes if present
  if [[ "$val" == \"*\" ]]; then
    val="${val:1:${#val}-2}"
  fi
  # Force APP_URL vars to the real custom domain
  if [[ "$key" == "APP_URL" || "$key" == "NEXT_PUBLIC_APP_URL" ]]; then
    val="https://www.moche-ai.com"
  fi
  # Skip empty values
  [[ -z "$val" ]] && { echo "SKIP empty $key"; continue; }
  printf '%s' "$val" | npx vercel --token "$TOKEN" env add "$key" production --scope "$SCOPE" --force >/dev/null 2>&1 \
    && echo "OK  $key" || echo "ERR $key"
done < "$ENVFILE"
echo "DONE"
