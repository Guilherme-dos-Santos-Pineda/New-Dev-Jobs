// Circuit breaker simples: abre após N falhas seguidas e fica aberto por um cooldown.
// Enquanto aberto, o chamador deve usar o fallback (sem chamar a API externa).
export function createCircuitBreaker({ threshold = 3, cooldownMs = 120000 } = {}) {
    let failures = 0;
    let openUntil = 0;
    return {
        isOpen() { return Date.now() < openUntil; },
        recordSuccess() { failures = 0; openUntil = 0; },
        recordFailure() {
            failures += 1;
            if (failures >= threshold) { openUntil = Date.now() + cooldownMs; failures = 0; }
        },
        state() { return { open: Date.now() < openUntil, openUntil, failures }; },
    };
}
