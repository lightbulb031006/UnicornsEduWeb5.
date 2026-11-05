#!/usr/bin/env bash
# Backup data stack: pg_dump từng database (giữ 14 ngày) + tar volume storage (giữ 3 ngày).
# Cron (root, VPS chạy UTC → 03:30 giờ VN): 30 20 * * * /root/uniedu-data/backup.sh >> /root/uniedu-data/backups/backup.log 2>&1
# Có r2.env thì đẩy thêm bản này lên Cloudflare R2 (offsite-r2.sh).
set -euo pipefail
umask 077

cd "$(dirname "$0")"
TS="$(date +%Y%m%d-%H%M%S)"
mkdir -p backups/daily

for id in it eng jp; do
  docker exec uniedu-data-db-1 pg_dump -U postgres --format=custom \
    --file "/backups/daily/uniedu_${id}-${TS}.dump" "uniedu_${id}"
  tar -C volumes -czf "backups/daily/storage-${id}-${TS}.tar.gz" "storage-${id}"
done

find backups/daily -name 'uniedu_*.dump' -mtime +14 -delete
find backups/daily -name 'storage-*.tar.gz' -mtime +3 -delete
echo "[${TS}] backup OK: $(du -sh backups/daily | cut -f1)"

if [ -f r2.env ]; then
  ./offsite-r2.sh "${TS}"
fi
