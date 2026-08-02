import { describe, expect, it } from 'vitest';
import stylesheet from './ManagerPage.module.css?raw';

describe('contrato responsivo do painel do gerenciador', () => {
  it('mantém navegação e conteúdo comprimíveis no layout mobile', () => {
    expect(stylesheet).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(stylesheet).toMatch(/\.content\s*\{[^}]*min-width:\s*0;/s);
    expect(stylesheet).toMatch(/\.field\s*\{[^}]*min-width:\s*0;/s);
  });

  it('empilha as ações de salvamento no layout mobile', () => {
    expect(stylesheet).toMatch(/\.saveActions\s*\{[^}]*grid-template-columns:\s*1fr;/);
  });

  it('respeita a área segura do celular na barra fixa', () => {
    expect(stylesheet).toContain('env(safe-area-inset-bottom, 0px)');
  });

  it('move a navegação para uma coluna lateral apenas no desktop', () => {
    expect(stylesheet).toMatch(
      /@media \(min-width: 58rem\)[\s\S]*?\.workspace\s*\{[^}]*grid-template-columns:\s*13rem minmax\(0, 1fr\);/,
    );
  });
});
