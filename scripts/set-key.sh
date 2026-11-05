#!/usr/bin/env bash
# Save the Anthropic API key to .env.local without it ever appearing on screen, in shell history or in git.
# Usage: npm run set-key
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env.local"

if [ ! -t 0 ]; then
  echo "Run this in an interactive terminal: npm run set-key" >&2
  exit 1
fi

while true; do
  printf 'Paste your Anthropic API key and press Enter: '
  IFS= read -rs key
  printf '\n'
  # Trim surrounding whitespace that a paste can bring along.
  key="${key#"${key%%[![:space:]]*}"}"
  key="${key%"${key##*[![:space:]]}"}"

  if [ -z "$key" ]; then
    echo "Nothing was entered – try again."
  elif [[ "$key" != sk-ant-* ]]; then
    echo "That doesn't look like an Anthropic key (it should start with sk-ant-) – try again."
  elif [ "$key" = "sk-ant-REPLACE-ME" ]; then
    echo "That's the placeholder, not a real key – try again."
  elif [[ "$key" =~ [[:space:]\"\'] ]]; then
    echo "The key must not contain spaces or quotes – try again."
  else
    break
  fi
done

# Owner-only before the key is written: umask covers a new file, chmod an existing one.
umask 077
if [ -f "$ENV_FILE" ]; then chmod 600 "$ENV_FILE"; fi
printf 'ANTHROPIC_API_KEY=%s\n' "$key" > "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo "Saved .env.local (${#key} characters). Now restart npm run dev."
