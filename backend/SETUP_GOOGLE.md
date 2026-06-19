# Configurar Google OAuth + Gmail API

Siga este passo-a-passo para o envio **real** de emails pela conta do usuário.
Enquanto não configurar, o app funciona em **modo mock** (emails são simulados).

## 1. Criar o projeto no Google Cloud

1. Acesse <https://console.cloud.google.com/> e crie um projeto (ex.: `newdevjobs`).
2. No menu **APIs e serviços → Biblioteca**, procure **Gmail API** e clique em **Ativar**.

## 2. Tela de consentimento OAuth

1. **APIs e serviços → Tela de consentimento OAuth**.
2. Tipo de usuário: **Externo** → Criar.
3. Preencha nome do app, email de suporte e email do desenvolvedor.
4. Em **Escopos**, adicione: `https://www.googleapis.com/auth/gmail.send`.
5. Em **Usuários de teste**, adicione os emails que vão testar (enquanto o app
   estiver em modo "Teste", só esses emails conseguem autorizar).

## 3. Criar as credenciais

1. **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**.
2. Tipo de aplicativo: **Aplicativo da Web**.
3. **URIs de redirecionamento autorizados**, adicione exatamente:
   ```
   http://localhost:3001/api/auth/google/callback
   ```
4. Crie e copie o **Client ID** e o **Client Secret**.

## 4. Configurar o .env

Na raiz do projeto, copie `.env.example` para `.env` e preencha:

```env
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3001/api/auth/google/callback
FRONTEND_URL=http://localhost:5173
```

## 5. Rodar

```bash
npm start            # backend (lê o .env automaticamente)
cd frontend && npm run dev
```

No app, vá em **Configurações → Conectar Google**. Você será levado à tela de
consentimento; ao autorizar, volta para o app já conectado e pronto para enviar
de verdade pela sua conta (`gmail.send`).

## Notas

- Usamos **apenas** o escopo `gmail.send` (somente envio) — não lemos seus emails.
- O `refresh_token` é guardado para permitir envios futuros; **Desconectar**
  revoga o acesso.

---

# Produção

Para colocar o envio real no ar, além do que está acima:

## 1. Redirect URI e origens de produção

Em **Credenciais → seu ID do cliente OAuth (Web)**, adicione (mantendo o de localhost):

- **URIs de redirecionamento autorizados:**
  ```
  https://newdevjobs-api.onrender.com/api/auth/google/callback
  ```
  (troque pelo domínio real da sua **API**; se usar domínio próprio na API, adicione o dele também.)
- **Origens JavaScript autorizadas:** a URL do **frontend** (ex.: `https://www.SEU-DOMINIO`).

## 2. Variáveis de ambiente no Render (serviço da API + worker)

```env
GOOGLE_REDIRECT_URI=https://newdevjobs-api.onrender.com/api/auth/google/callback
FRONTEND_URL=https://www.SEU-DOMINIO        # ou https://newdevjobs-frontend.onrender.com
```
O `GOOGLE_REDIRECT_URI` tem que ser **idêntico** ao cadastrado no Google.

## 3. Tela de consentimento (necessária para verificação)

Preencha em **Tela de consentimento OAuth**:
- **Página inicial do app:** sua landing (ex.: `https://landing.SEU-DOMINIO`).
- **Política de Privacidade:** `https://landing.SEU-DOMINIO/privacidade.html`.
- **Termos de Serviço:** `https://landing.SEU-DOMINIO/termos.html`.
- **Domínios autorizados:** seu domínio próprio (precisa ser verificado no Google
  Search Console — domínios `onrender.com` **não** servem para verificação).

## 4. ⚠️ O ponto que pega: publicar + verificar (`gmail.send` é escopo RESTRITO)

- **Modo Teste:** até 100 usuários de teste conseguem conectar **sem** verificação.
  Porém, com escopo sensível/restrito, o **refresh_token expira a cada 7 dias** —
  ou seja, cada usuário teria que reconectar o Gmail toda semana. Serve para um
  beta fechado, não para operar de verdade.
- **Modo Produção (publicado):** o `refresh_token` passa a ser duradouro (conectar
  uma vez), mas para um escopo **restrito** como `gmail.send` o Google exige
  **verificação completa**: domínio verificado, política/termos publicados, vídeo
  de demonstração e, normalmente, uma **avaliação de segurança CASA** (auditoria
  por terceiro, anual e paga). O processo leva semanas.

**Resumo prático:** dá para lançar um **beta fechado** já (modo Teste, ≤100 emails,
reconectando o Gmail a cada 7 dias). Para abrir ao público com "conectar uma vez",
publique o app e inicie a **verificação do Google** — comece cedo, é o item de
maior prazo do lançamento.
