const MAX_SLUG_LENGTH = 64;

export function createQrCodeFileName(laboratoryName: string): string {
  const slug = laboratoryName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');

  return `qrcode-${slug || 'laboratorio'}.jpg`;
}
