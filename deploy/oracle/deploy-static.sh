#!/usr/bin/env bash
# Publica os estáticos (landing + app React) em /var/www/newdevjobs.
#
# Rodar NA VM. Na PRIMEIRA vez o script ainda não existe no clone local,
# então atualize o repositório antes (depois disso, basta chamar o script,
# que já faz o pull sozinho):
#
#   git -C /opt/newdevjobs fetch --all && git -C /opt/newdevjobs reset --hard origin/main
#   bash /opt/newdevjobs/deploy/oracle/deploy-static.sh
#
# O app React precisa de um `dist` já compilado. São duas formas:
#
#   1. (padrão) Build feito na SUA máquina e enviado por scp:
#        npm run build --prefix frontend
#        tar -czf dist.tgz -C frontend/dist .
#        scp -i SUA-CHAVE.key dist.tgz ubuntu@IP:/tmp/newdevjobs-dist.tar.gz
#      Recomendado nas formas Micro (1 GB de RAM): o `vite build` é o passo mais
#      pesado do projeto e é justamente o que não precisa rodar aqui.
#
#   2. `--build` compila na própria VM. Exige as VITE_* em frontend/.env e
#      folga de memória (a swap do setup.sh ajuda, mas é apertado).
set -euo pipefail

APP_DIR=/opt/newdevjobs
WEB_DIR=/var/www/newdevjobs
TARBALL=/tmp/newdevjobs-dist.tar.gz
BUILD_HERE=false
[ "${1:-}" = "--build" ] && BUILD_HERE=true

say() { echo; echo "==> $*"; }

say "1/4 código mais recente"
git -C "$APP_DIR" fetch --all --quiet
git -C "$APP_DIR" reset --hard origin/main

say "2/4 app React"
sudo mkdir -p "$WEB_DIR/app"
if [ "$BUILD_HERE" = true ]; then
    echo "compilando na VM (--build)"
    npm --prefix "$APP_DIR/frontend" install
    npm --prefix "$APP_DIR/frontend" run build
    sudo rm -rf "$WEB_DIR/app"; sudo mkdir -p "$WEB_DIR/app"
    sudo cp -r "$APP_DIR/frontend/dist/." "$WEB_DIR/app/"
elif [ -f "$TARBALL" ]; then
    echo "usando $TARBALL"
    sudo rm -rf "$WEB_DIR/app"; sudo mkdir -p "$WEB_DIR/app"
    sudo tar -xzf "$TARBALL" -C "$WEB_DIR/app"
else
    echo "❌ sem $TARBALL e sem --build."
    echo "   Envie o dist da sua máquina (veja o cabeçalho deste arquivo)"
    echo "   ou rode:  bash $0 --build"
    exit 1
fi

# _headers / _redirects são do Cloudflare Pages e do Render; aqui quem faz esse
# papel é o próprio nginx. Servidos, virariam arquivos de texto públicos à toa.
sudo rm -f "$WEB_DIR/app/_headers" "$WEB_DIR/app/_redirects"

say "3/4 landing"
# --exclude do _headers pelo mesmo motivo acima. A landing não tem build.
sudo cp -r "$APP_DIR/pages/." "$WEB_DIR/"
sudo rm -f "$WEB_DIR/_headers"

sudo chown -R www-data:www-data "$WEB_DIR"
sudo find "$WEB_DIR" -type d -exec chmod 755 {} +
sudo find "$WEB_DIR" -type f -exec chmod 644 {} +

say "4/4 nginx"
# O arquivo do repo tem só blocos `listen 80`. Quem cria os blocos 443 é o
# certbot, editando a cópia instalada — então sobrescrever cega derruba o HTTPS
# (foi o que aconteceu na primeira vez: a porta 443 passou a recusar conexão e o
# webhook do Stripe começou a falhar). Detectamos e avisamos.
LIVE=/etc/nginx/sites-available/newdevjobs
HAD_TLS=false
if [ -f "$LIVE" ] && grep -q "listen 443" "$LIVE"; then
    HAD_TLS=true
    sudo cp "$LIVE" "$LIVE.bak-$(date +%Y%m%d%H%M%S)"
fi

sudo cp "$APP_DIR/deploy/oracle/nginx-newdevjobs.conf" "$LIVE"
sudo ln -sf "$LIVE" /etc/nginx/sites-enabled/newdevjobs
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

if [ "$HAD_TLS" = true ]; then
    echo
    echo "⚠️  A configuração anterior tinha HTTPS e a nova (do repo) não tem."
    echo "    Backup salvo em $LIVE.bak-*"
    echo "    RODE AGORA para reinstalar os blocos 443 (o certificado já existe,"
    echo "    é rápido e não emite nada novo):"
    echo
    echo "      sudo certbot --nginx -d newdevjobs.xyz -d api.newdevjobs.xyz"
    echo
    echo "    Acrescente -d www.newdevjobs.xyz -d landing.newdevjobs.xyz quando"
    echo "    esses nomes resolverem — se um só não resolver, o pedido TODO falha."
fi

echo
echo "✅ publicado em $WEB_DIR"
echo "   landing : $(ls "$WEB_DIR" | grep -c '\.html$') páginas HTML"
echo "   app     : $([ -f "$WEB_DIR/app/index.html" ] && echo 'index.html ok' || echo 'FALTANDO')"
echo
echo "Teste local (antes do DNS/HTTPS):"
echo "   curl -s -o /dev/null -w '%{http_code}\\n' -H 'Host: newdevjobs.xyz' http://localhost/"
echo "   curl -s -o /dev/null -w '%{http_code}\\n' -H 'Host: newdevjobs.xyz' http://localhost/login"
echo "   curl -s -o /dev/null -w '%{http_code}\\n' -H 'Host: newdevjobs.xyz' http://localhost/api/health"
