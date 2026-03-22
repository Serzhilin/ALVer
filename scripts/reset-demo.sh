#!/usr/bin/env bash
# reset-demo.sh — wipe the database and reload demo data
# Run from the ALVer root: npm run demo:reset

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "→ Stopping postgres..."
cd "$ROOT"
docker compose down postgres

echo "→ Removing data volume..."
docker volume rm alver_alver-postgres-data 2>/dev/null || true

echo "→ Starting fresh postgres..."
docker compose up -d postgres

echo "→ Waiting for postgres to be ready..."
for i in $(seq 1 20); do
  if docker compose exec -T postgres pg_isready -U alver -d alver -q 2>/dev/null; then
    break
  fi
  sleep 1
done

echo "→ Seeding demo data..."
npm run db:seed

echo ""
echo "✓ Done — demo data loaded."
