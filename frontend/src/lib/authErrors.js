const MAP = {
    'Invalid login credentials': 'Email ou senha inválidos.',
    'User already registered': 'Este email já está cadastrado.',
    'Email not confirmed': 'Confirme seu email antes de entrar.',
    'Password should be at least 6 characters': 'A senha deve ter ao menos 6 caracteres.',
    'Unable to validate email address: invalid format': 'Email inválido.',
    'For security purposes, you can only request this after 60 seconds': 'Aguarde 60s para tentar de novo.',
    'New password should be different from the old password.': 'A nova senha deve ser diferente da anterior.',
};

export function authError(msg = '') {
    return MAP[msg] || msg || 'Algo deu errado.';
}
