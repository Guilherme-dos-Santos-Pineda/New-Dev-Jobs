#!/usr/bin/env bash
# Atualiza a API na VM Oracle: puxa o main, reinstala deps e reinicia o serviço.
# Rodar NA VM:  bash /opt/newdevjobs/deploy/oracle/update.sh
set -euo pipefail

APP_DIR=/opt/newdevjobs
cd "$APP_DIR"

echo "==> git pull"
git fetch --all --quiet
git reset --hard origin/main

echo "==> dependências"
npm ci --omit=dev 2>/dev/null || npm install --omit=dev

echo "==> reiniciando"
sudo systemctl restart newdevjobs
sleep 3
systemctl is-active --quiet newdevjobs && echo "✅ no ar" || { echo "❌ falhou — journalctl -u newdevjobs -n 50"; exit 1; }

# Confirma que o worker subiu junto (sem esta linha, a fila de envios fica parada).
journalctl -u newdevjobs -n 40 --no-pager | grep -q "worker ativo" \
    && echo "✅ worker embutido ativo" \
    || echo "⚠️  não vi '🤖 worker ativo' nos logs — confira RUN_WORKER"
