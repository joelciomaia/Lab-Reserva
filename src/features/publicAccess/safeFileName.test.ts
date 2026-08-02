import { describe, expect, it } from 'vitest';
import { createQrCodeFileName } from './safeFileName';

describe('createQrCodeFileName', () => {
  it('remove acentos e caracteres inseguros do nome do arquivo', () => {
    expect(createQrCodeFileName('Laboratório de Química / Sala 01')).toBe(
      'qrcode-laboratorio-de-quimica-sala-01.jpg',
    );
  });

  it('usa um nome neutro quando o laboratório ainda não tem nome', () => {
    expect(createQrCodeFileName(' <>:"/\\|?* ')).toBe('qrcode-laboratorio.jpg');
  });

  it('limita nomes muito longos', () => {
    expect(createQrCodeFileName('A'.repeat(200))).toHaveLength(
      'qrcode-'.length + 64 + '.jpg'.length,
    );
  });
});
