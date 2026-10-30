// O Google devolve quem conectou o Gmail para /app/perfil?google=connected (a
// tela de email). Quem conectou a partir das VAGAS (botão grande ou primeiro
// acesso) deve voltar para as vagas, não cair numa tela de configuração.
// Uma marca no sessionStorage diz de onde a pessoa saiu; sem ela, nada muda.
const CHAVE = 'voltar-para-vagas';

export function marcarVoltaParaVagas() {
    try { sessionStorage.setItem(CHAVE, '1'); } catch { /* modo privado: fica na tela de email */ }
}

/** true uma vez só: lê e apaga a marca. */
export function deveVoltarParaVagas() {
    try {
        const v = sessionStorage.getItem(CHAVE) === '1';
        sessionStorage.removeItem(CHAVE);
        return v;
    } catch { return false; }
}
