// =========================
// Email editado só para uma vaga
// =========================
// Pedido de usuário (09/11/2026): tem vaga que exige um assunto ou uma frase no
// corpo do email, e editar o modelo no perfil, enviar e desfazer era chato. A
// prévia passou a aceitar edição, e o texto editado vale SÓ para aquele envio: o
// modelo do perfil não muda.

export const ASSUNTO_MAX = 200;
export const CORPO_MAX = 10000;

/**
 * Lê o assunto e o corpo editados do pedido.
 * { editado: null } quando não veio edição; { erro } quando veio pela metade ou grande demais.
 */
export function emailEditado(corpo = {}) {
    const { subject, body } = corpo;
    if (subject == null && body == null) return { editado: null };
    if (typeof subject !== 'string' || typeof body !== 'string') return { erro: 'Mande o assunto e o texto do email.' };
    const assunto = subject.replace(/\s+/g, ' ').trim();
    const texto = body.replace(/\r\n/g, '\n').trim();
    if (!assunto || !texto) return { erro: 'O assunto e o texto do email não podem ficar vazios.' };
    if (assunto.length > ASSUNTO_MAX) return { erro: `O assunto pode ter até ${ASSUNTO_MAX} caracteres.` };
    if (texto.length > CORPO_MAX) return { erro: `O texto pode ter até ${CORPO_MAX} caracteres.` };
    return { editado: { subject: assunto, body: texto } };
}
