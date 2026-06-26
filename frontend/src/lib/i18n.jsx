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
    'Olá, {name} 👋': 'Hi, {name} 👋',
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
