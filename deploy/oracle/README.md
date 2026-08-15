# Deploy no Oracle Cloud (Always Free) — API + worker

Hospedagem **US$ 0/mês** para a parte que precisa ficar acordada. Ao contrário
dos free tiers que dormem, a VM da Oracle roda 24/7 — que é o que o worker
embutido (fila de envios, runs do scraper, agendador de robôs) exige.

**Divisão final da infra:**

| Parte | Onde | Custo |
| --- | --- | --- |
| API + worker | **Oracle Cloud** (esta pasta) | US$ 0 |
| App (`frontend/dist`) | **Cloudflare Pages** | US$ 0 |
| Landing (`pages/`) | **Cloudflare Pages** | US$ 0 |
| Banco / Auth / Storage | **Supabase** free | US$ 0 |

---

## 1. Criar a VM

1. [cloud.oracle.com](https://cloud.oracle.com) → conta **Always Free** (pede
   cartão só para verificação; a conta *Always Free* não é cobrada).
2. **Compute → Instances → Create Instance**:
   - **Image:** Ubuntu 22.04 ou 24.04
   - **Shape:** `VM.Standard.A1.Flex` (**Ampere/ARM** — é o que é Always Free)
   - **OCPUs / RAM:** até 2 OCPU / 12 GB (o limite Always Free desde jun/2026)
   - Salve a **chave SSH** e anote o **IP público**.

> **"Out of host capacity"** é comum ao criar instâncias ARM. Não é erro seu —
> é falta de estoque na região. Tente outra *Availability Domain*, outra região,
> ou repita mais tarde.

3. **Networking → Security List** da subnet → *Add Ingress Rules*:
   `0.0.0.0/0` TCP **80** e **443**.

## 2. Rodar o bootstrap

```bash
ssh -i sua-chave.key ubuntu@SEU_IP_PUBLICO
git clone https://github.com/Guilherme-dos-Santos-Pineda/New-Dev-Jobs.git /tmp/ndj
bash /tmp/ndj/deploy/oracle/setup.sh
```

Instala Node 22 (ARM64), nginx, abre o firewall **local** (a Security List do
passo 1 sozinha não basta — as imagens Ubuntu da OCI bloqueiam tudo no
`iptables`), clona em `/opt/newdevjobs` e registra o serviço no systemd.

## 3. Segredos

```bash
nano /opt/newdevjobs/.env
```

Copie os valores do antigo env group do Render. Dois ajustes importantes:

- `GOOGLE_REDIRECT_URI=https://api.newdevjobs.xyz/api/auth/google/callback`
- `FRONTEND_URL=` a URL do app no Cloudflare Pages

> A app lê o `.env` sozinha (dotenv) — por isso o systemd **não** usa
> `EnvironmentFile`, cujo parser trataria aspas e escapes de forma diferente.

```bash
sudo systemctl restart newdevjobs
journalctl -u newdevjobs -f     # espere: 🤖 worker ativo (embutido na API)
```

## 4. DNS + HTTPS

1. No seu DNS: **A** `api.newdevjobs.xyz` → IP público da VM.
2. Depois que propagar:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.newdevjobs.xyz
```

O certbot instala o certificado, cria o redirect 80→443 e renova sozinho.

```bash
curl -s https://api.newdevjobs.xyz/api/health   # → {"ok":true}
```

## 5. Reapontar os serviços externos

Com a API em domínio novo, atualize:

- **Google Cloud → OAuth client → Authorized redirect URIs:**
  `https://api.newdevjobs.xyz/api/auth/google/callback`
- **Stripe → Webhooks:** `https://api.newdevjobs.xyz/api/billing/webhook`
  (o *signing secret* muda → atualize `STRIPE_WEBHOOK_SECRET` no `.env`)
- **Supabase → Auth → Redirect URLs:** a URL do app no Cloudflare Pages
- **Frontend:** `VITE_API_URL=https://api.newdevjobs.xyz` (variável de *build*
  no Cloudflare Pages — exige rebuild para valer)

## 6. Atualizar depois de um push

```bash
bash /opt/newdevjobs/deploy/oracle/update.sh
```

---

## Operação

| Ação | Comando |
| --- | --- |
| Status | `systemctl status newdevjobs` |
| Logs ao vivo | `journalctl -u newdevjobs -f` |
| Reiniciar | `sudo systemctl restart newdevjobs` |
| Erros do nginx | `sudo tail -f /var/log/nginx/newdevjobs.error.log` |

O systemd usa `Restart=always`, então a app volta sozinha após crash ou reboot.

## Cuidados

- **Ociosidade:** a Oracle pode recuperar instâncias Always Free ociosas
  (avalia CPU/rede). Uma app real com tráfego + o cron do scraper mantêm uso
  suficiente. O `keepalive.yml` do GitHub Actions deixa de ser necessário aqui
  (a VM não dorme), mas serve como *health check* externo se quiser manter.
- **Sem SLA.** É grátis, não é gerenciado: mantenha o Supabase (que guarda os
  dados) e trate a VM como descartável — o `setup.sh` recria tudo do zero.
- **Um processo só.** Não suba um segundo `node backend/server.js` com
  `RUN_WORKER=true`: dois workers na mesma fila duplicam envios.
