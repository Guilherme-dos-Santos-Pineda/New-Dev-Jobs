import { test } from 'node:test';
import assert from 'node:assert/strict';
import { variantesDoPerfil, melhoresSugestoes, temPoucaVaga } from '../services/ampliarPerfilLogic.js';

test('pouca vaga: menos de uma semana no ritmo do plano (mínimo 30)', () => {
    assert.equal(temPoucaVaga(25, 50), true);
    assert.equal(temPoucaVaga(349, 50), true);
    assert.equal(temPoucaVaga(350, 50), false);
    assert.equal(temPoucaVaga(29, 1), true);
    assert.equal(temPoucaVaga(140, 20), false);
});

test('sugestões: nível vizinho (nunca liderança), área vizinha, híbrido, antigas, exterior', () => {
    const v = variantesDoPerfil({ Levels: ['pleno'], Areas: ['frontend'], Modalities: ['remoto'], PostingDays: 30, Region: 'br' });
    const porId = Object.fromEntries(v.map((x) => [x.id, x]));
    assert.deepEqual(porId.niveis.patch.Levels, ['pleno', 'junior', 'senior']);
    assert.equal(porId.niveis.texto, 'Marcar também júnior e sênior');
    assert.deepEqual(porId.areas.patch.Areas, ['frontend', 'fullstack', 'mobile']);
    assert.deepEqual(porId.hibrido.patch.Modalities, ['remoto', 'hibrido']);
    assert.equal(porId.antigas.patch.PostingDays, 0);
    assert.equal(porId.exterior.patch.Region, 'ambos');
    const senior = variantesDoPerfil({ Levels: ['senior'] });
    assert.deepEqual(senior[0].patch.Levels, ['senior', 'pleno'], 'acima de sênior não entra');
});

test('sem o que mudar, nenhuma sugestão; e só entra o que rende 5 vagas ou mais', () => {
    assert.deepEqual(variantesDoPerfil({ Region: 'ambos' }), []);
    const m = melhoresSugestoes([{ id: 'a', ganho: 3 }, { id: 'b', ganho: 40 }, { id: 'c', ganho: 12 }, { id: 'd', ganho: 8 }, { id: 'e', ganho: 6 }]);
    assert.deepEqual(m.map((x) => x.id), ['b', 'c', 'd']);
});
