import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildLaboratoryPublicUrl } from './publicUrl';

describe('buildLaboratoryPublicUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('cria a URL canônica do HashRouter a partir da URL atual', () => {
    expect(
      buildLaboratoryPublicUrl('SCHOOL-01', 'LAB01', {
        currentUrl: 'https://agenda.escola.edu.br/app/#/gerenciar/geral',
      }),
    ).toBe('https://agenda.escola.edu.br/app/#/?school=SCHOOL-01&lab=LAB01');
  });

  it('respeita a URL pública configurada no ambiente', () => {
    vi.stubEnv('VITE_PUBLIC_APP_URL', 'https://agenda.educacao.sc.gov.br/laboratorios');

    expect(
      buildLaboratoryPublicUrl('SCHOOL-01', 'LAB-QUIMICA', {
        currentUrl: 'http://localhost:5173/#/gerenciar/geral',
      }),
    ).toBe('https://agenda.educacao.sc.gov.br/laboratorios/#/?school=SCHOOL-01&lab=LAB-QUIMICA');
  });

  it('permite sobrescrever a URL do ambiente explicitamente', () => {
    vi.stubEnv('VITE_PUBLIC_APP_URL', 'https://ambiente.example/');

    expect(
      buildLaboratoryPublicUrl('SCHOOL-01', 'LAB01', {
        currentUrl: 'http://localhost:5173/',
        publicAppUrl: 'https://piloto.example/agenda/',
      }),
    ).toBe('https://piloto.example/agenda/#/?school=SCHOOL-01&lab=LAB01');
  });

  it('codifica o identificador sem acrescentar dados da planilha', () => {
    const publicUrl = buildLaboratoryPublicUrl(' escola/01?# ', ' laboratório/01?# ', {
      currentUrl: 'https://agenda.example/#/gerenciar',
    });

    expect(publicUrl).toBe(
      'https://agenda.example/#/?school=escola%2F01%3F%23&lab=laborat%C3%B3rio%2F01%3F%23',
    );
    expect(publicUrl).not.toContain('spreadsheet');
    expect(publicUrl).not.toContain('token');
  });

  it('recusa um identificador vazio', () => {
    expect(() =>
      buildLaboratoryPublicUrl('SCHOOL-01', '   ', {
        currentUrl: 'https://agenda.example/',
      }),
    ).toThrow('identificador público');
  });

  it('recusa uma escola vazia', () => {
    expect(() =>
      buildLaboratoryPublicUrl('   ', 'LAB01', {
        currentUrl: 'https://agenda.example/',
      }),
    ).toThrow('identificador público da escola');
  });
});
