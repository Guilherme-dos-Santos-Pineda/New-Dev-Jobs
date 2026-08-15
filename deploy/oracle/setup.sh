#!/usr/bin/env bash
# =============================================================================
# Bootstrap da VM Oracle Cloud (Always Free, ARM/Ubuntu) para a API newdevjobs.
#
# Rodar NA VM, como o usuário `ubuntu`:
#   git clone https://github.com/Guilherme-dos-Santos-Pineda/New-Dev-Jobs.git /tmp/ndj \
#     && bash /tmp/ndj/deploy/oracle/setup.sh
#
# É IDEMPOTENTE: pode rodar de novo sem quebrar nada.
# Ao final, falta só criar o /opt/newdevjobs/.env e rodar o certbot (o script diz como).
# =============================================================================
set -euo pipefail

APP_DIR=/opt/newdevjobs
REPO=https://github.com/Guilherme-dos-Santos-Pineda/New-Dev-Jobs.git
NODE_MAJOR=22
DOMAIN=${DOMAIN:-api.newdevjobs.xyz}

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }

say "1/7 Pacotes base"
sudo apt-get update -y
sudo apt-get install -y curl git nginx ca-certificates

say "2/7 Node.js ${NODE_MAJOR}.x (build ARM64 nativo)"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt "$NODE_MAJOR" ]; then
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
    sudo apt-get install -y nodejs
fi
node -v

# ---------------------------------------------------------------------------
# PEGADINHA DA ORACLE: as imagens Ubuntu da OCI vêm com iptables bloqueando
# tudo menos SSH. Abrir a porta na Security List do painel NÃO basta — o
# pacote chega na VM e morre no firewall local. Por isso os dois passos.
# ---------------------------------------------------------------------------
say "3/7 Firewall local (iptables) — liberando 80/443"
# O -C testa EXATAMENTE a mesma regra que o -I insere; se divergirem, cada
# execução do script empilha uma regra duplicada.
for port in 80 443; do
    if ! sudo iptables -C INPUT -m state --state NEW -p tcp --dport "$port" -j ACCEPT 2>/dev/null; then
        # Insere ANTES do REJECT final que as imagens da OCI trazem por padrão.
        sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport "$port" -j ACCEPT
    fi
done
sudo apt-get install -y iptables-persistent netfilter-persistent
sudo netfilter-persistent save
echo "⚠️  Falta liberar 80/443 TAMBÉM na Security List da OCI (painel web)."

say "4/7 Código em ${APP_DIR}"
sudo mkdir -p "$APP_DIR"
sudo chown -R "$USER":"$USER" "$APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
    git -C "$APP_DIR" fetch --all --quiet && git -C "$APP_DIR" reset --hard origin/main
else
    git clone --depth 1 "$REPO" "$APP_DIR"
fi

say "5/7 Dependências (sem devDependencies)"
cd "$APP_DIR"
npm ci --omit=dev 2>/dev/null || npm install --omit=dev

say "6/7 systemd"
sudo cp "$APP_DIR/deploy/oracle/newdevjobs.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable newdevjobs

say "7/7 nginx"
sudo cp "$APP_DIR/deploy/oracle/nginx-newdevjobs.conf" /etc/nginx/sites-available/newdevjobs
sudo sed -i "s/api\.newdevjobs\.xyz/${DOMAIN}/g" /etc/nginx/sites-available/newdevjobs
sudo ln -sf /etc/nginx/sites-available/newdevjobs /etc/nginx/sites-enabled/newdevjobs
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

cat <<EOF

=============================================================================
Infra pronta. Faltam 3 passos MANUAIS (precisam de segredos / DNS):

1) Criar o .env  (copie os valores do antigo env group do Render):
     nano ${APP_DIR}/.env
   Mínimo: DATABASE_URL, SUPABASE_*, GOOGLE_*, FRONTEND_URL, ADMIN_EMAILS,
           APIFY_TOKEN*, RESEND_API_KEY, STRIPE_*, GROQ_API_KEY
   Importante: GOOGLE_REDIRECT_URI=https://${DOMAIN}/api/auth/google/callback

2) Subir a API:
     sudo systemctl restart newdevjobs
     journalctl -u newdevjobs -f     # espere '🤖 worker ativo (embutido na API)'

3) HTTPS (só depois do DNS de ${DOMAIN} apontar para o IP público desta VM):
     sudo certbot --nginx -d ${DOMAIN}
   (instale antes: sudo apt-get install -y certbot python3-certbot-nginx)

Teste final:  curl -s https://${DOMAIN}/api/health
=============================================================================
EOF
