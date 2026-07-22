import { describe, expect, it } from 'vitest';

import {
  emailSchema,
  idSchema,
  isoDateSchema,
  optionalTextSchema,
  positiveIntegerSchema,
  requiredTextSchema,
} from './validation';

describe('requiredTextSchema', () => {
  const schema = requiredTextSchema('Disciplina', 10);

  it('trims valid text', () => {
    expect(schema.parse('  Física  ')).toBe('Física');
  });

  it('rejects blank text', () => {
    expect(schema.safeParse('   ').success).toBe(false);
  });

  it('applies the maximum length after trimming', () => {
    expect(requiredTextSchema('Campo', 3).parse('  abc  ')).toBe('abc');
    expect(schema.safeParse('Matemática 1').success).toBe(false);
  });

  it('rejects an invalid schema limit', () => {
    expect(() => requiredTextSchema('Campo', 0)).toThrow(RangeError);
  });
});

describe('optionalTextSchema', () => {
  const schema = optionalTextSchema(20);

  it('turns blank text into undefined', () => {
    expect(schema.parse('   ')).toBeUndefined();
  });

  it('trims non-empty text', () => {
    expect(schema.parse('  Sem projetor  ')).toBe('Sem projetor');
  });

  it('rejects text beyond the limit', () => {
    expect(schema.safeParse('x'.repeat(21)).success).toBe(false);
  });
});

describe('emailSchema', () => {
  it('accepts and trims an email address', () => {
    expect(emailSchema.parse(' professor@escola.edu.br ')).toBe('professor@escola.edu.br');
  });

  it.each(['', 'professor', '@escola.edu.br'])('rejects invalid email %j', (value) => {
    expect(emailSchema.safeParse(value).success).toBe(false);
  });
});

describe('isoDateSchema', () => {
  it('accepts a real ISO date', () => {
    expect(isoDateSchema.parse(' 2026-07-22 ')).toBe('2026-07-22');
  });

  it.each(['2026-02-30', '22/07/2026', '2026-7-22'])('rejects invalid date %s', (value) => {
    expect(isoDateSchema.safeParse(value).success).toBe(false);
  });
});

describe('positiveIntegerSchema', () => {
  it('coerces a numeric form value', () => {
    expect(positiveIntegerSchema.parse('35')).toBe(35);
  });

  it.each(['', '0', '-1', '1.5', 'texto', true])('rejects invalid positive integer %j', (value) => {
    expect(positiveIntegerSchema.safeParse(value).success).toBe(false);
  });
});

describe('idSchema', () => {
  it('accepts and trims an identifier', () => {
    expect(idSchema.parse(' LAB01 ')).toBe('LAB01');
  });

  it('rejects an empty identifier', () => {
    expect(idSchema.safeParse('   ').success).toBe(false);
  });
});
