// Valida req.body com um schema zod. Em falha → 400 com a 1ª mensagem.
// Em sucesso, substitui req.body pelos dados já parseados/normalizados.
export function validate(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.body ?? {});
        if (!result.success) {
            const msg = result.error.issues?.[0]?.message || 'Dados inválidos';
            return res.status(400).json({ error: msg });
        }
        req.body = result.data;
        next();
    };
}
