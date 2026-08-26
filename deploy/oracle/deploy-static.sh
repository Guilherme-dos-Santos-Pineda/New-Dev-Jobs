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
FORCE_NGINX=false
for arg in "$@"; do
    case "$arg" in
        --build)  BUILD_HERE=true ;;
        --nginx)  FORCE_NGINX=true ;;
        *) echo "uso: $0 [--build] [--nginx]"; exit 2 ;;
    esac
done

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
# Versão em inglês: derivada do index.html em português pelo dicionário I18N_EN.
# Gerada aqui (e não versionada) para não existirem duas páginas divergindo.
node "$APP_DIR/pages/build-en.mjs" "$APP_DIR/pages/en/index.html"

# --exclude do _headers pelo mesmo motivo acima. A landing não tem build.
sudo cp -r "$APP_DIR/pages/." "$WEB_DIR/"
sudo rm -f "$WEB_DIR/_headers"
# O gerador não precisa ir para a webroot.
sudo rm -f "$WEB_DIR/build-en.mjs"

sudo chown -R www-data:www-data "$WEB_DIR"
sudo find "$WEB_DIR" -type d -exec chmod 755 {} +
sudo find "$WEB_DIR" -type f -exec chmod 644 {} +

say "4/4 nginx"
# Publicar arquivos NÃO exige reinstalar a configuração — e reinstalar cega
# derrubava o HTTPS toda vez: o arquivo do repo só tem `listen 80`, e quem
# escreve os blocos 443 é o certbot, editando a cópia instalada. Por isso a
# config só é tocada quando é mesmo necessário.
LIVE=/etc/nginx/sites-available/newdevjobs
REPO_CONF="$APP_DIR/deploy/oracle/nginx-newdevjobs.conf"
HASH_FILE=/etc/nginx/.newdevjobs-conf-hash
WANT=$(sha256sum "$REPO_CONF" | cut -d" " -f1)
HAVE=$(sudo cat "$HASH_FILE" 2>/dev/null || true)

# O `|| true` é obrigatório: sob `set -e`, uma lista com && que termina em
# falha (arquivo ausente na primeira instalação) abortaria o script aqui.
HAS_TLS=false
if [ -f "$LIVE" ] && grep -q "listen 443" "$LIVE"; then HAS_TLS=true; fi

INSTALL=false
if [ "$FORCE_NGINX" = true ]; then INSTALL=true          # pedido explícito
elif [ ! -f "$LIVE" ];        then INSTALL=true          # primeira instalação
elif [ "$HAS_TLS" = false ];  then INSTALL=true          # ainda sem TLS: seguro
fi

if [ "$INSTALL" = true ]; then
    # `if` e não `[ ... ] && ...`: com HAS_TLS=false a lista retornaria não-zero
    # e o `set -e` abortaria o deploy numa VM nova.
    if [ "$HAS_TLS" = true ]; then
        sudo cp "$LIVE" "$LIVE.bak-$(date +%Y%m%d%H%M%S)"
    fi
    sudo cp "$REPO_CONF" "$LIVE"
    sudo ln -sf "$LIVE" /etc/nginx/sites-enabled/newdevjobs
    sudo rm -f /etc/nginx/sites-enabled/default
    sudo nginx -t && sudo systemctl reload nginx
    echo "$WANT" | sudo tee "$HASH_FILE" >/dev/null
    echo "configuração instalada"

    if [ "$HAS_TLS" = true ]; then
        echo
        echo "⚠️  A configuração anterior tinha HTTPS e a nova (do repo) não tem."
        echo "    Backup em $LIVE.bak-*  ·  RODE AGORA para reinstalar os blocos 443"
        echo "    (o certificado já existe — escolha a opção 1, 'reinstall'):"
        echo
        echo "      sudo certbot --nginx -d newdevjobs.xyz -d www.newdevjobs.xyz \\"
        echo "                           -d landing.newdevjobs.xyz -d api.newdevjobs.xyz"
    fi
elif [ -z "$HAVE" ]; then
    # Primeira execução desta versão do script: não existe hash anterior, então
    # não dá para saber se a config instalada está velha. Registramos o hash
    # atual em vez de gritar "mudou" — a partir do próximo deploy a detecção é
    # confiável. Se você acabou de editar o .conf, rode uma vez com --nginx.
    echo "$WANT" | sudo tee "$HASH_FILE" >/dev/null
    echo "configuração preservada · hash registrado (detecção ativa a partir do próximo deploy)"
elif [ "$WANT" != "$HAVE" ]; then
    echo "⚠️  O nginx-newdevjobs.conf do repo MUDOU desde a última instalação."
    echo "    Os arquivos foram publicados, mas a configuração não."
    echo "    Para aplicá-la (vai pedir o certbot depois):  bash $0 --nginx"
else
    echo "configuração já instalada e idêntica à do repo — HTTPS preservado"
fi

# --- HTTP/2 ---------------------------------------------------------------
# O certbot escreve `listen 443 ssl;` SEM http2, e reescreve isso a cada
# renovação — por isso a checagem roda sempre, não só quando instalamos a
# config. Em HTTP/1.1 o navegador abre no máximo 6 conexões por host: o
# dashboard segura uma por ~2s e todo o resto fica na fila atrás dele. Com h2
# tudo multiplexa numa conexão só.
if sudo grep -q "listen 443 ssl;" "$LIVE" 2>/dev/null; then
    sudo sed -i "s/listen 443 ssl;/listen 443 ssl http2;/g" "$LIVE"
    if sudo nginx -t >/dev/null 2>&1; then
        sudo systemctl reload nginx
        echo "http2 habilitado (o certbot havia deixado só ssl)"
    else
        # Não deixa a config quebrada no ar por causa de uma otimização.
        sudo sed -i "s/listen 443 ssl http2;/listen 443 ssl;/g" "$LIVE"
        echo "⚠️  não foi possível habilitar http2 (nginx -t falhou); config revertida"
    fi
fi

echo
echo "✅ publicado em $WEB_DIR"
echo "   landing : $(ls "$WEB_DIR" | grep -c '\.html$') páginas HTML (+ /en/)"
echo "   app     : $([ -f "$WEB_DIR/app/index.html" ] && echo 'index.html ok' || echo 'FALTANDO')"
echo
echo "Teste local (antes do DNS/HTTPS):"
echo "   curl -s -o /dev/null -w '%{http_code}\\n' -H 'Host: newdevjobs.xyz' http://localhost/"
echo "   curl -s -o /dev/null -w '%{http_code}\\n' -H 'Host: newdevjobs.xyz' http://localhost/login"
echo "   curl -s -o /dev/null -w '%{http_code}\\n' -H 'Host: newdevjobs.xyz' http://localhost/api/health"
