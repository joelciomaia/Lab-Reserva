import { describe, expect, it } from 'vitest';

import {
  CLASS_GROUP_OPTIONS,
  KNOWLEDGE_OBJECT_OPTIONS,
  SUBJECT_OPTIONS,
  findOptionById,
  getKnowledgeObjectOptions,
  getOptionLabel,
  type BookingOption,
  type ClassGroupOption,
} from './bookingOptions';

const curriculumClassGroupOptions: readonly ClassGroupOption[] = [
  { id: 'class-grade-1-a', label: '1ª série A', gradeId: 'high-school-1' },
  { id: 'class-grade-1-b', label: '1ª série B', gradeId: 'high-school-1' },
  { id: 'class-grade-2-a', label: '2ª série A', gradeId: 'high-school-2' },
  { id: 'class-eja', label: 'EJA', gradeId: 'eja' },
  { id: 'class-other', label: 'Outra turma', gradeId: 'other' },
];

describe('booking option catalogs', () => {
  it.each([
    ['subjects', SUBJECT_OPTIONS],
    ['class groups', CLASS_GROUP_OPTIONS],
    ['knowledge objects', KNOWLEDGE_OBJECT_OPTIONS],
  ] as const)('provides unique stable IDs for %s', (_name, options) => {
    const ids = options.map((option) => option.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it('contains the expected physical education, initial class, and other options', () => {
    expect(SUBJECT_OPTIONS).toContainEqual({
      id: 'subject-physical-education',
      label: 'Educação Física',
    });
    expect(CLASS_GROUP_OPTIONS).toContainEqual({
      id: 'class-grade-1-a',
      label: '1ª série A',
      gradeId: 'high-school-1',
    });
    expect(CLASS_GROUP_OPTIONS).toHaveLength(2);
    expect(CLASS_GROUP_OPTIONS).toContainEqual({
      id: 'class-other',
      label: 'Outra turma',
      gradeId: 'other',
    });
    expect(SUBJECT_OPTIONS).toContainEqual({ id: 'subject-other', label: 'Outro' });
    expect(KNOWLEDGE_OBJECT_OPTIONS).toContainEqual({
      id: 'knowledge-other',
      label: 'Outro',
    });
  });
});

describe('option lookup helpers', () => {
  it('finds an option by its stable ID', () => {
    expect(findOptionById(SUBJECT_OPTIONS, 'subject-mathematics')).toEqual({
      id: 'subject-mathematics',
      label: 'Matemática',
    });
  });

  it('returns undefined for an absent option', () => {
    expect(findOptionById(SUBJECT_OPTIONS, 'subject-unknown')).toBeUndefined();
    expect(findOptionById(SUBJECT_OPTIONS, null)).toBeUndefined();
  });

  it('returns the selected label or a caller-provided fallback', () => {
    expect(getOptionLabel(SUBJECT_OPTIONS, 'subject-mathematics')).toBe('Matemática');
    expect(getOptionLabel(SUBJECT_OPTIONS, 'subject-unknown')).toBe('—');
    expect(getOptionLabel(SUBJECT_OPTIONS, undefined, 'Não informado')).toBe('Não informado');
  });

  it('works with caller-owned option catalogs', () => {
    const localOptions: readonly BookingOption[] = [{ id: 'local-option', label: 'Opção local' }];

    expect(findOptionById(localOptions, 'local-option')).toEqual(localOptions[0]);
    expect(getOptionLabel(localOptions, 'local-option')).toBe('Opção local');
  });
});

describe('contextual knowledge objects', () => {
  it('returns useful physical education options for a first-grade class', () => {
    const options = getKnowledgeObjectOptions('subject-physical-education', 'class-grade-1-a');

    expect(options.map((option) => option.id)).toEqual([
      'knowledge-physical-education-grade-1-body-culture',
      'knowledge-physical-education-grade-1-invasion-sports',
      'knowledge-physical-education-grade-1-conditioning',
      'knowledge-physical-education-grade-1-body-health',
      'knowledge-physical-education-grade-1-media',
      'knowledge-other',
    ]);
    expect(options.map((option) => option.label)).toContain('Corpo, movimento e saúde');
  });

  it('uses the grade rather than the class letter as curriculum context', () => {
    const firstA = getKnowledgeObjectOptions(
      'subject-physical-education',
      'class-grade-1-a',
      SUBJECT_OPTIONS,
      curriculumClassGroupOptions,
    );
    const firstB = getKnowledgeObjectOptions(
      'subject-physical-education',
      'class-grade-1-b',
      SUBJECT_OPTIONS,
      curriculumClassGroupOptions,
    );

    expect(firstB).toEqual(firstA);
  });

  it('does not leak first-grade knowledge objects into another grade', () => {
    const secondGrade = getKnowledgeObjectOptions(
      'subject-physical-education',
      'class-grade-2-a',
      SUBJECT_OPTIONS,
      curriculumClassGroupOptions,
    );
    const ids = secondGrade.map((option) => option.id);

    expect(ids).toContain('knowledge-physical-education-grade-2-network-sports');
    expect(ids).toContain('knowledge-other');
    expect(ids).not.toContain('knowledge-physical-education-grade-1-body-culture');
  });

  it('does not mix knowledge objects from different subjects', () => {
    const mathematics = getKnowledgeObjectOptions('subject-mathematics', 'class-grade-1-a');
    const ids = mathematics.map((option) => option.id);

    expect(ids).toContain('knowledge-mathematics-grade-1-functions');
    expect(ids).toContain('knowledge-other');
    expect(ids).not.toContain('knowledge-physical-education-grade-1-body-culture');
  });

  it('returns only the global other option for custom subject or class selections', () => {
    expect(getKnowledgeObjectOptions('subject-other', 'class-other')).toEqual([
      { id: 'knowledge-other', label: 'Outro' },
    ]);
    expect(
      getKnowledgeObjectOptions(
        'subject-physical-education',
        'class-eja',
        SUBJECT_OPTIONS,
        curriculumClassGroupOptions,
      ),
    ).toEqual([{ id: 'knowledge-other', label: 'Outro' }]);
  });

  it('returns no options until both selections are valid', () => {
    expect(getKnowledgeObjectOptions(undefined, 'class-grade-1-a')).toEqual([]);
    expect(getKnowledgeObjectOptions('subject-physical-education', undefined)).toEqual([]);
    expect(getKnowledgeObjectOptions('subject-unknown', 'class-grade-1-a')).toEqual([]);
    expect(getKnowledgeObjectOptions('subject-physical-education', 'class-unknown')).toEqual([]);
  });
});
