import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    gerarCodigo, normalizarCodigo, limiteComBonus, novoBonusAte, podeIndicar, premioVale,
    canalDaOrigem, origemParaGravar, BONUS_ENVIOS, TETO_DIAS,
} from '../services/indicacaoLogic.js';

const DIA = 86400000;
const AGORA = Date.parse('2026-11-14T12:00:00Z');

test('código: 6 caracteres sem letras que se confundem, e a URL normaliza', () => {
    const c = gerarCodigo();
    assert.match(c, /^[A-HJKMNP-Z2-9]{6}$/);
    assert.equal(normalizarCodigo(' ab3k9x '), 'AB3K9X');
    assert.equal(normalizarCodigo('<script>'), null);
    assert.equal(normalizarCodigo(''), null);
});

test('bônus: +10 enquanto vale, nada depois', () => {
    assert.equal(limiteComBonus(20, new Date(AGORA + DIA), AGORA), 20 + BONUS_ENVIOS);
    assert.equal(limiteComBonus(20, new Date(AGORA - 1), AGORA), 20);
    assert.equal(limiteComBonus(50, null, AGORA), 50);
});

test('bônus soma 7 dias ao que sobrou e para em 60', () => {
    assert.equal(novoBonusAte(null, AGORA).getTime(), AGORA + 7 * DIA);
    assert.equal(novoBonusAte(new Date(AGORA - 3 * DIA), AGORA).getTime(), AGORA + 7 * DIA, 'bônus vencido recomeça de hoje');
    assert.equal(novoBonusAte(new Date(AGORA + 5 * DIA), AGORA).getTime(), AGORA + 12 * DIA);
    assert.equal(novoBonusAte(new Date(AGORA + 58 * DIA), AGORA).getTime(), AGORA + TETO_DIAS * DIA);
});

test('indicação só em conta nova, sem envio, uma vez e nunca de si mesma', () => {
    const nova = { Id: 'a', CreatedAt: new Date(AGORA - 3600000) };
    const quem = { Id: 'b' };
    assert.equal(podeIndicar({ indicado: nova, quemIndicou: quem, jaEnviou: false }, AGORA), true);
    assert.equal(podeIndicar({ indicado: nova, quemIndicou: { Id: 'a' }, jaEnviou: false }, AGORA), false);
    assert.equal(podeIndicar({ indicado: nova, quemIndicou: quem, jaEnviou: true }, AGORA), false);
    assert.equal(podeIndicar({ indicado: { ...nova, IndicadoPor: 'c' }, quemIndicou: quem }, AGORA), false);
    assert.equal(podeIndicar({ indicado: { Id: 'a', CreatedAt: new Date(AGORA - 10 * DIA) }, quemIndicou: quem }, AGORA), false);
    assert.equal(podeIndicar({ indicado: nova, quemIndicou: undefined }, AGORA), false, 'código que não existe');
});

test('prêmio: uma vez, e não para o mesmo Gmail nas duas contas', () => {
    const indicado = { IndicadoPor: 'b', Email: 'x@a.com', GoogleEmail: 'x@gmail.com' };
    const quem = { Email: 'y@a.com', GoogleEmail: 'y@gmail.com' };
    assert.equal(premioVale({ indicado, quemIndicou: quem }), true);
    assert.equal(premioVale({ indicado: { ...indicado, IndicacaoPremiadaEm: new Date() }, quemIndicou: quem }), false);
    assert.equal(premioVale({ indicado, quemIndicou: { ...quem, GoogleEmail: 'X@gmail.com' } }), false);
    assert.equal(premioVale({ indicado: { ...indicado, IndicadoPor: null }, quemIndicou: quem }), false);
});

test('canal: utm vence, depois indicação, depois o site de onde veio', () => {
    assert.equal(canalDaOrigem({ utm_source: 'Reddit', ref: 'ABC234' }), 'reddit');
    assert.equal(canalDaOrigem({ utm_source: 'grupo-zap' }), 'grupo-zap');
    assert.equal(canalDaOrigem({ ref: 'abc234', referrer: 'https://www.google.com/' }), 'indicacao');
    assert.equal(canalDaOrigem({ referrer: 'https://www.google.com.br/' }), 'google');
    assert.equal(canalDaOrigem({ referrer: 'https://l.facebook.com/x' }), 'meta');
    assert.equal(canalDaOrigem({ referrer: 'https://lnkd.in/abc' }), 'linkedin');
    assert.equal(canalDaOrigem({ referrer: 'https://newdevjobs.xyz/docs.html' }), 'direto');
    assert.equal(canalDaOrigem({}), 'direto');
    assert.equal(canalDaOrigem({ referrer: 'https://blog.qualquer.dev/post' }), 'blog.qualquer.dev');
    // App no Android: o referrer é o pacote (visto em produção: com.reddit.frontpage).
    assert.equal(canalDaOrigem({ referrer: 'android-app://com.reddit.frontpage/' }), 'reddit');
    assert.equal(canalDaOrigem({ referrer: 'android-app://com.linkedin.android/' }), 'linkedin');
    assert.equal(canalDaOrigem({ referrer: 'android-app://com.google.android.gm/' }), 'email');
});

test('origem gravada: só campos conhecidos, curtos, e o referrer vira só o host', () => {
    const o = origemParaGravar({ utm_source: 'linkedin', utm_campaign: 'x'.repeat(500), referrer: 'https://www.linkedin.com/feed/?q=email@x.com', lixo: 1 });
    assert.equal(o.canal, 'linkedin');
    assert.equal(o.utm_campaign.length, 60);
    assert.equal(o.referrer, 'linkedin.com');
    assert.equal('lixo' in o, false);
});

test('o bônus vale nos três tetos: uso, worker e "enviar você mesmo"', () => {
    const ler = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.match(ler('../services/usage.js'), /limiteComBonus\(plan\.dailyLimit/);
    assert.match(ler('../worker.js'), /limiteComBonus\(planOf\(user\?\.Plan\)\.dailyLimit, user\?\.BonusEnviosAte\)/);
    assert.match(ler('../services/compose.js'), /limiteComBonus\(planOf\(planName\)\.dailyLimit, user\.BonusEnviosAte\)/);
    // O prêmio sai só do envio real pelo Gmail (sender), não do compose.
    assert.match(ler('../services/sender.js'), /premiarIndicacao\(userId\)/);
    assert.doesNotMatch(ler('../services/compose.js'), /premiarIndicacao/);
});
