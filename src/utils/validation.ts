import { z } from 'zod';

import { isValidIsoDate } from './dates';

function assertPositiveMaxLength(maxLength: number): void {
  if (!Number.isInteger(maxLength) || maxLength < 1) {
    throw new RangeError('maxLength deve ser um inteiro positivo.');
  }
}

export function requiredTextSchema(label: string, maxLength: number) {
  assertPositiveMaxLength(maxLength);

  const fieldLabel = label.trim() || 'Campo';

  return z
    .string()
    .trim()
    .min(1, `${fieldLabel} é obrigatório.`)
    .max(maxLength, `${fieldLabel} deve ter no máximo ${maxLength} caracteres.`);
}

export function optionalTextSchema(maxLength: number) {
  assertPositiveMaxLength(maxLength);

  return z.preprocess(
    (value) => {
      if (typeof value !== 'string') {
        return value;
      }

      const normalizedValue = value.trim();
      return normalizedValue === '' ? undefined : normalizedValue;
    },
    z.string().max(maxLength, `O texto deve ter no máximo ${maxLength} caracteres.`).optional(),
  );
}

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Informe o e-mail.')
  .max(254, 'O e-mail deve ter no máximo 254 caracteres.')
  .email('Informe um e-mail válido.');

export const isoDateSchema = z
  .string()
  .trim()
  .refine(isValidIsoDate, 'Use uma data válida no formato AAAA-MM-DD.');

export const positiveIntegerSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const normalizedValue = value.trim();
  return normalizedValue === '' ? Number.NaN : Number(normalizedValue);
}, z.number().int('Informe um número inteiro.').positive('Informe um número maior que zero.'));

export const idSchema = z
  .string()
  .trim()
  .min(1, 'Selecione uma opção válida.')
  .max(100, 'O identificador deve ter no máximo 100 caracteres.');
