#!/bin/sh
# Production deploy (P9): one named project, rules and app together, tests first, smoke test after.
#   npm run deploy -- --project <id> [--domain <custom domain>] [--account <Google account for the Firebase CLI>]
# Needs `npx firebase login` with an account that can deploy to the project, and .env.production.local
# (see .env.example and docs/SETUP_AND_DEPLOY.md). Stops at the first failure; nothing is deployed until every
# check and test has passed.
set -e

project=""
domain=""
account=""
while [ $# -gt 0 ]; do
  case "$1" in
    --project) project="$2"; shift 2 ;;
    --domain) domain="$2"; shift 2 ;;
    --account) account="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 2 ;;
  esac
done
if [ -z "$project" ]; then
  echo "Usage: npm run deploy -- --project <id> [--domain <custom domain>] [--account <email>]"
  exit 2
fi
domain_args=""
if [ -n "$domain" ]; then domain_args="--domain $domain"; fi
account_args=""
if [ -n "$account" ]; then account_args="--account $account"; fi

echo "== 1/6 Production settings"
npx --no-install jiti scripts/deploy-check.ts --project "$project" $domain_args

echo "== 2/6 Types and unit tests"
npm run typecheck
npm test

echo "== 3/6 Security rules, sync and restore tests (Firestore emulator)"
npm run test:emulator

echo "== 4/6 Production build"
npx --no-install vite build

echo "== 5/6 Deploy rules, indexes and app to $project"
sh scripts/firebase.sh deploy $account_args --project "$project" --only firestore:rules,firestore:indexes,hosting --non-interactive

echo "== 6/6 Smoke test"
url="https://${domain:-$project.web.app}"
npx --no-install jiti scripts/smoke.ts "$url" --project "$project"
