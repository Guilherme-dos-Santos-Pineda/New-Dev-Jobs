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
- Para publicar (qualquer usuário, não só os de teste) é preciso passar pela
  verificação do Google. Em dev, mantenha em modo Teste com seus emails.
