import { createContext, useContext, useCallback, useState } from 'react';

// =========================================================================
// i18n leve (PT/EN), sem dependência externa. A CHAVE é o texto em português;
// o dicionário EN traduz. O que ainda não foi traduzido cai no PT (a própria
// chave) — nunca aparece chave crua. Interpolação: t('Olá, {name}', { name }).
// =========================================================================

const EN = {
    // --- Nav / Layout ---
    'Dashboard': 'Dashboard',
    'Candidaturas': 'Applications',
    'Feedback': 'Feedback',
    'Perfil': 'Profile',
    'Assinatura': 'Subscription',
    'Admin': 'Admin',
    'Sair': 'Log out',
    'Alternar tema': 'Toggle theme',
    'Recolher': 'Collapse',
    'Expandir': 'Expand',
    'Recolher menu': 'Collapse menu',
    'Idioma': 'Language',

    // --- Login ---
    'Entrar': 'Sign in',
    'Acesse seu painel de candidaturas automáticas.': 'Access your automated job applications dashboard.',
    'Continuar com Google': 'Continue with Google',
    'ou': 'or',
    'Email': 'Email',
    'Senha': 'Password',
    'Entrando…': 'Signing in…',
    'Esqueci minha senha': 'Forgot my password',
    'Não tem conta?': "Don't have an account?",
    'Cadastre-se': 'Sign up',
    'Política de Privacidade': 'Privacy Policy',
    'Termos de Uso': 'Terms of Use',
    'Supabase não configurado (veja frontend/.env).': 'Supabase not configured (see frontend/.env).',

    // --- Signup ---
    'Criar conta': 'Create account',
    'Comece a automatizar suas candidaturas.': 'Start automating your job applications.',
    'Nome': 'Name',
    'Seu nome': 'Your name',
    'mínimo 6 caracteres': 'min. 6 characters',
    'Criando…': 'Creating…',
    'Já tem conta?': 'Already have an account?',
    'Confirme seu email': 'Confirm your email',
    'Enviamos um link de confirmação para': 'We sent a confirmation link to',
    'Clique nele para ativar sua conta.': 'Click it to activate your account.',
    'Voltar ao login': 'Back to login',
    'A senha deve ter ao menos 6 caracteres.': 'Password must be at least 6 characters.',

    // --- Dashboard ---
    'Olá, {name}': 'Hi, {name}',
    'Seu radar de oportunidades, em tempo real.': 'Your opportunity radar, in real time.',
    'Procurar Vagas': 'Find jobs',
    'Vagas hoje': 'Jobs today',
    'Vagas compatíveis': 'Matching jobs',
    'prontas para enviar': 'ready to send',
    'Recrutadores': 'Recruiters',
    'Empresas monitoradas': 'Companies tracked',
    'com vagas coletadas': 'with collected jobs',
    'Currículos enviados': 'Resumes sent',
    'Match acima de 90%': 'Match above 90%',
    'Tempo economizado': 'Time saved',
    'pela automação': 'through automation',
    'Envios restantes hoje': 'Sends left today',
    'no total': 'total',
    'aprovados': 'approved',
    'na semana': 'this week',
    'match médio': 'avg. match',
    'de': 'of',
    'do plano': 'on your plan',
    'Próxima melhor oportunidade': 'Next best opportunity',
    'Candidatar agora': 'Apply now',
    'Sem vagas compatíveis no momento. Rode "Procurar Vagas" ou ajuste seu perfil.':
        'No matching jobs right now. Run "Find jobs" or adjust your profile.',
    'Central de atividades': 'Activity center',
    'Sem atividade ainda.': 'No activity yet.',
    'Ranking de usuários': 'User ranking',
    'Candidaturas recentes': 'Recent applications',
    'ver todas': 'see all',
    'Nenhuma candidatura ainda.': 'No applications yet.',
    'Últimos feedbacks': 'Latest feedback',
    'ver todos / avaliar': 'see all / rate',
    'Enviando candidaturas…': 'Sending applications…',
    'Envios concluídos': 'Sends finished',
    'Parar': 'Stop',
    'Conclua sua configuração': 'Finish your setup',
    'Quanto mais completo o perfil, mais certeiras são as vagas que você recebe.':
        'The more complete your profile, the more accurate the jobs you receive.',
    'Escolha sua área profissional': 'Choose your professional area',
    'Define quais vagas você recebe (ex.: um QA não recebe vaga de Dev).':
        "Defines which jobs you receive (e.g. a QA won't get Dev roles).",
    'Escolher área': 'Choose area',
    'Adicione suas skills e keywords': 'Add your skills and keywords',
    'Calculam o match de cada vaga com o seu perfil.': "They compute each job's match with your profile.",
    'Adicionar skills': 'Add skills',
    'Envie seu currículo (PDF)': 'Upload your resume (PDF)',
    'É o PDF anexado nas suas candidaturas.': "It's the PDF attached to your applications.",
    'Enviar CV': 'Upload resume',
    'Conecte sua conta Google': 'Connect your Google account',
    'Os emails são enviados do seu Gmail.': 'Emails are sent from your Gmail.',
    'Conectar Google': 'Connect Google',
    'recomendado': 'recommended',

    // --- Candidaturas ---
    'Histórico de currículos enviados automaticamente.': 'History of resumes sent automatically.',
    'Você ainda não se candidatou a nenhuma vaga.': "You haven't applied to any job yet.",
    'Procurar vagas': 'Find jobs',
    'enviado': 'sent', 'falhou': 'failed', 'pulado': 'skipped',
    'currículo': 'resume',
    'via seu Gmail': 'via your Gmail',
    'ver email': 'view email',
    'candidatura(s)': 'application(s)',
    'página': 'page', 'anterior': 'previous', 'próxima': 'next',
    'Corpo do email não disponível para esta candidatura.': 'Email body not available for this application.',

    // --- Assinatura ---
    'Gerencie seu plano, uso e pagamentos.': 'Manage your plan, usage and payments.',
    'Assinatura e pagamentos': 'Subscription & payments',
    'Gerencie seu plano e veja todo o histórico de pagamentos.': 'Manage your plan and see your full payment history.',
    'Atualizar': 'Refresh',
    'Total de pagamentos': 'Total payments',
    'Aprovados': 'Approved',
    'Pendentes': 'Pending',
    'Total pago': 'Total paid',
    'Status': 'Status',
    'Todos': 'All',
    'Pago': 'Paid',
    'Pendente': 'Pending',
    'Cancelado': 'Canceled',
    'Rascunho': 'Draft',
    'Não paga': 'Unpaid',
    'Método': 'Method',
    'Cartão': 'Card',
    'Período': 'Period',
    'Todo o período': 'All time',
    'Últimos 30 dias': 'Last 30 days',
    'Últimos 90 dias': 'Last 90 days',
    'Últimos 12 meses': 'Last 12 months',
    'Buscar': 'Search',
    'ID da transação ou valor…': 'Transaction ID or amount…',
    'ID da Transação': 'Transaction ID',
    'Data do Pagamento': 'Payment date',
    'Valor': 'Amount',
    'Ações': 'Actions',
    'Plano': 'Plan',
    'Provedor': 'Provider',
    'Ver fatura': 'View invoice',
    'Baixar PDF': 'Download PDF',
    'Nenhum pagamento para os filtros.': 'No payments for these filters.',
    'Mostrando {n} de {total}': 'Showing {n} of {total}',
    'Planos': 'Plans',
    'Automatize suas candidaturas e ganhe tempo. Faça upgrade quando precisar de mais.':
        'Automate your applications and save time. Upgrade when you need more.',
    'cobrança mensal · cancele quando quiser': 'billed monthly · cancel anytime',
    'pagamento único · acesso por 30 dias': 'one-time payment · 30 days of access',
    'acesso até': 'access until',
    'Renovar {plan}': 'Renew {plan}',
    '30 dias': '30 days',
    'grátis': 'free',
    'Fazer upgrade': 'Upgrade',
    'Incluído no seu plano': 'Included in your plan',
    'Seu plano atual': 'Your current plan',
    'mês': 'mo',
    'Precisa de um plano personalizado?': 'Need a custom plan?',
    'Fale com a gente': 'Get in touch',
    'Fale com o suporte': 'Contact support',
    'Comunidade no WhatsApp': 'WhatsApp community',
    'Venha fazer parte da comunidade': 'Come join the community',
    'Dicas de vagas, novidades e suporte no WhatsApp.': 'Job tips, updates and support on WhatsApp.',
    'Entrar no grupo': 'Join the group',
    'Plano atual': 'Current plan',
    'Gerenciar / Cancelar': 'Manage / Cancel',
    'Abrindo…': 'Opening…',
    'Envios hoje': 'Sends today',
    'envios restantes hoje.': 'sends left today.',
    'renova em': 'renews on', 'cancela em': 'cancels on',
    '(acesso até lá)': '(access until then)',
    'dia restante': 'day left', 'dias restantes': 'days left', '(ciclo de 1 mês)': '(1-month cycle)',
    'Pagamentos não configurados no servidor.': 'Payments not configured on the server.',
    'atual': 'current', 'mais popular': 'most popular',
    'Trocar para {plan}': 'Switch to {plan}',
    'Cancelar / downgrade': 'Cancel / downgrade',
    'Assinar {plan}': 'Subscribe to {plan}',
    'Redirecionando…': 'Redirecting…',
    'Plano grátis': 'Free plan', 'Indisponível': 'Unavailable',
    'Histórico de pagamentos': 'Payment history',
    'Nenhum pagamento ainda.': 'No payments yet.',
    'pago': 'paid',
    'ativa': 'active', 'teste': 'trial', 'pagamento pendente': 'past due', 'não paga': 'unpaid', 'cancelada': 'canceled',

    // --- Perfil ---
    'Meu Perfil': 'My Profile',
    'Configure suas preferências para receber as melhores vagas.': 'Set your preferences to get the best jobs.',
    'Resetar configuração': 'Reset settings',
    'Preferências de Trabalho': 'Work Preferences',
    'Filtros': 'Filters',
    'Contato & Currículo': 'Contact & Resume',
    'Salvar configurações': 'Save settings', 'Salvando…': 'Saving…',
    'Área profissional': 'Professional area',
    '% completo': '% complete',

    // --- Feedback ---
    'Feedback da comunidade': 'Community feedback',
    'Sua avaliação': 'Your rating',
    'Editar': 'Edit',
    'Editar sua avaliação': 'Edit your rating',
    'Deixe seu relato': 'Leave your feedback',
    'Como foi sua experiência com a plataforma?': 'How was your experience with the platform?',
    'Cancelar': 'Cancel',
    'Enviando…': 'Sending…',
    'Salvar': 'Save',
    'Enviar relato': 'Send feedback',
    'Você é o primeiro a avaliar. Obrigado!': 'You are the first to rate. Thank you!',
    'Seja o primeiro a deixar um relato.': 'Be the first to leave feedback.',
    'ver mais': 'see more', 'ver menos': 'see less',

    // --- Modal Procurar Vagas ---
    'Buscando vagas disponíveis': 'Searching available jobs',
    'Analisando oportunidades no banco de dados…': 'Analyzing opportunities in the database…',
    'Como deseja enviar os e-mails?': 'How do you want to send the emails?',
    'Enviar automaticamente': 'Send automatically',
    'Iniciando envio…': 'Starting send…',
    'Revise antes de enviar': 'Review before sending',
    'Revisar e selecionar vagas específicas para envio.': 'Review and select specific jobs to send.',
    'Selecionar todas': 'Select all',
    'ver detalhes': 'see details', 'ocultar': 'hide',
};

const DICT = { pt: {}, en: EN };

const LangCtx = createContext(null);

export function LangProvider({ children }) {
    const [lang, setLangState] = useState(() => localStorage.getItem('lang') || 'pt');
    const setLang = useCallback((l) => { localStorage.setItem('lang', l); setLangState(l); }, []);
    const t = useCallback((key, vars) => {
        let s = (DICT[lang] && DICT[lang][key]) || key; // pt: a chave já é o texto
        if (vars) for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(vars[k]);
        return s;
    }, [lang]);
    return <LangCtx.Provider value={{ lang, setLang, t }}>{children}</LangCtx.Provider>;
}

export function useT() {
    const ctx = useContext(LangCtx);
    if (!ctx) throw new Error('useT precisa estar dentro de <LangProvider>');
    return ctx;
}
