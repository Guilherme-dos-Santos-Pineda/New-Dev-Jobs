import { AREAS_FORA_DE_TI } from './areas.js';

// =========================
// Opções que o perfil aceita — LISTA CANÔNICA
// =========================
// Isto vive num arquivo próprio porque a mesma lista existe em três lugares que
// precisam concordar: o classificador (`services/classify.js`, que produz a
// área), a UI (`frontend/src/utils.js`, que oferece a opção) e a validação do
// PUT /profile (que decide o que é salvo).
//
// Quando eles divergem, o erro é SILENCIOSO e do pior tipo: a tela oferece
// "Suporte / Service Desk", o usuário marca, o backend descarta a opção por não
// estar na lista, o perfil salva com `Areas: []` — e a pessoa passa a receber o
// feed inteiro, sem filtro nenhum, sem nenhuma mensagem de erro. Foi exatamente
// isso que aconteceu com `suporte`, e só apareceu quando um teste de ponta a
// ponta releu o perfil depois de salvar.
//
// `backend/test/profileOptions.test.js` trava as três pontas.

/** Áreas profissionais. Espelha AREA_OPTIONS em frontend/src/utils.js. */
// 'dev' continua aceito e NAO vira legado: e a sobra do classificador (titulo
// generico como "Desenvolvedor de Software" ou "Tech Lead") e e o que esta
// salvo na maioria dos perfis antigos. Ver config/areas.js.
export const ALLOWED_AREAS = ['frontend', 'backend', 'fullstack', 'dev', 'mobile', 'data', 'devops', 'qa', 'design', 'po', 'suporte', 'erp', ...AREAS_FORA_DE_TI];

/** Níveis. Espelha LEVEL_OPTIONS em frontend/src/utils.js. */
export const ALLOWED_LEVELS = ['estagio', 'junior', 'pleno', 'senior', 'lead', 'manager'];

/** Modalidades. Espelha detectModality() em services/classify.js. */
export const ALLOWED_MODALITIES = ['remoto', 'hibrido', 'presencial'];

/** Contratos. Espelha contratoDaVaga() em services/classify.js e CONTRACT_OPTIONS em frontend/src/utils.js. */
export const ALLOWED_CONTRACTS = ['clt', 'pj'];

/** Regiões de fora do Brasil. Espelha regioesDaVaga() em services/classify.js e REGION_OPTIONS em frontend/src/utils.js. */
export const ALLOWED_REGIONS = ['america-norte', 'europa', 'latam', 'asia', 'oriente'];

/** Estados. Espelha UF_OPTIONS em frontend/src/utils.js. */
export const ALLOWED_STATES = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

// 'nontech' e 'other' NÃO entram: não são escolha do usuário. 'nontech' é o que
// o sistema barra para todo mundo e 'other' é "não deu para classificar", que
// passa de propósito.
