import { DEFAULT_CLASS_GROUPS, DEFAULT_SUBJECTS } from '../../domain/configuration';
import type { GradeId } from '../../types';

export interface BookingOption {
  readonly id: string;
  readonly label: string;
}

export const SUBJECT_OPTIONS = [
  ...DEFAULT_SUBJECTS.map(({ id, label }) => ({ id, label })),
  { id: 'subject-other', label: 'Outro' },
] satisfies readonly BookingOption[];

export type SubjectOption = BookingOption;
export type SubjectId = string;
export type { GradeId } from '../../types';

export interface ClassGroupOption extends BookingOption {
  readonly gradeId: GradeId;
}

export const CLASS_GROUP_OPTIONS = [
  ...DEFAULT_CLASS_GROUPS.map(({ id, label, gradeId }) => ({ id, label, gradeId })),
  { id: 'class-other', label: 'Outra turma', gradeId: 'other' },
] satisfies readonly ClassGroupOption[];

export type ClassGroupId = string;

export interface KnowledgeObjectOption extends BookingOption {
  readonly subjectId?: SubjectId;
  readonly gradeIds?: readonly GradeId[];
}

const ALL_HIGH_SCHOOL_GRADES = [
  'high-school-1',
  'high-school-2',
  'high-school-3',
] as const satisfies readonly GradeId[];

export const KNOWLEDGE_OBJECT_OPTIONS = [
  {
    id: 'knowledge-portuguese-grade-1-literary-reading',
    label: 'Leitura e apreciação de textos literários',
    subjectId: 'subject-portuguese',
    gradeIds: ['high-school-1'],
  },
  {
    id: 'knowledge-portuguese-grade-1-text-production',
    label: 'Produção textual, autoria e argumentação',
    subjectId: 'subject-portuguese',
    gradeIds: ['high-school-1'],
  },
  {
    id: 'knowledge-portuguese-multiliteracies',
    label: 'Multiletramentos e práticas da cultura digital',
    subjectId: 'subject-portuguese',
    gradeIds: ALL_HIGH_SCHOOL_GRADES,
  },
  {
    id: 'knowledge-mathematics-grade-1-functions',
    label: 'Funções e relações entre grandezas',
    subjectId: 'subject-mathematics',
    gradeIds: ['high-school-1'],
  },
  {
    id: 'knowledge-mathematics-grade-1-statistics',
    label: 'Estatística, tabelas e gráficos',
    subjectId: 'subject-mathematics',
    gradeIds: ['high-school-1'],
  },
  {
    id: 'knowledge-mathematics-grade-2-geometry',
    label: 'Geometria espacial e relações métricas',
    subjectId: 'subject-mathematics',
    gradeIds: ['high-school-2'],
  },
  {
    id: 'knowledge-mathematics-grade-3-probability',
    label: 'Probabilidade e análise combinatória',
    subjectId: 'subject-mathematics',
    gradeIds: ['high-school-3'],
  },
  {
    id: 'knowledge-biology-grade-1-cell',
    label: 'Organização celular e metabolismo',
    subjectId: 'subject-biology',
    gradeIds: ['high-school-1'],
  },
  {
    id: 'knowledge-biology-grade-1-ecology',
    label: 'Ecologia, biodiversidade e sustentabilidade',
    subjectId: 'subject-biology',
    gradeIds: ['high-school-1'],
  },
  {
    id: 'knowledge-physics-grade-1-motion',
    label: 'Movimento, velocidade e aceleração',
    subjectId: 'subject-physics',
    gradeIds: ['high-school-1'],
  },
  {
    id: 'knowledge-physics-grade-1-energy',
    label: 'Força, trabalho e transformações de energia',
    subjectId: 'subject-physics',
    gradeIds: ['high-school-1'],
  },
  {
    id: 'knowledge-chemistry-grade-1-matter',
    label: 'Constituição e propriedades da matéria',
    subjectId: 'subject-chemistry',
    gradeIds: ['high-school-1'],
  },
  {
    id: 'knowledge-chemistry-grade-1-transformations',
    label: 'Transformações químicas e conservação da matéria',
    subjectId: 'subject-chemistry',
    gradeIds: ['high-school-1'],
  },
  {
    id: 'knowledge-history-grade-1-memory',
    label: 'Tempo, memória e patrimônio cultural',
    subjectId: 'subject-history',
    gradeIds: ['high-school-1'],
  },
  {
    id: 'knowledge-history-grade-1-civilizations',
    label: 'Sociedades antigas e diversidade cultural',
    subjectId: 'subject-history',
    gradeIds: ['high-school-1'],
  },
  {
    id: 'knowledge-geography-grade-1-cartography',
    label: 'Cartografia e tecnologias de representação do espaço',
    subjectId: 'subject-geography',
    gradeIds: ['high-school-1'],
  },
  {
    id: 'knowledge-geography-grade-1-territory',
    label: 'Território, paisagem e relações socioambientais',
    subjectId: 'subject-geography',
    gradeIds: ['high-school-1'],
  },
  {
    id: 'knowledge-physical-education-grade-1-body-culture',
    label: 'Cultura corporal de movimento',
    subjectId: 'subject-physical-education',
    gradeIds: ['high-school-1'],
  },
  {
    id: 'knowledge-physical-education-grade-1-invasion-sports',
    label: 'Esportes de invasão',
    subjectId: 'subject-physical-education',
    gradeIds: ['high-school-1'],
  },
  {
    id: 'knowledge-physical-education-grade-1-conditioning',
    label: 'Ginástica de condicionamento físico',
    subjectId: 'subject-physical-education',
    gradeIds: ['high-school-1'],
  },
  {
    id: 'knowledge-physical-education-grade-1-body-health',
    label: 'Corpo, movimento e saúde',
    subjectId: 'subject-physical-education',
    gradeIds: ['high-school-1'],
  },
  {
    id: 'knowledge-physical-education-grade-1-media',
    label: 'Práticas corporais, mídia e tecnologia',
    subjectId: 'subject-physical-education',
    gradeIds: ['high-school-1'],
  },
  {
    id: 'knowledge-physical-education-grade-2-network-sports',
    label: 'Esportes de rede e parede',
    subjectId: 'subject-physical-education',
    gradeIds: ['high-school-2'],
  },
  {
    id: 'knowledge-physical-education-grade-2-dance',
    label: 'Danças e práticas rítmicas',
    subjectId: 'subject-physical-education',
    gradeIds: ['high-school-2'],
  },
  {
    id: 'knowledge-physical-education-grade-3-adventure',
    label: 'Práticas corporais de aventura',
    subjectId: 'subject-physical-education',
    gradeIds: ['high-school-3'],
  },
  {
    id: 'knowledge-physical-education-grade-3-leisure',
    label: 'Lazer, qualidade de vida e protagonismo',
    subjectId: 'subject-physical-education',
    gradeIds: ['high-school-3'],
  },
  {
    id: 'knowledge-art-artistic-languages',
    label: 'Artes visuais, dança, música e teatro',
    subjectId: 'subject-art',
    gradeIds: ALL_HIGH_SCHOOL_GRADES,
  },
  {
    id: 'knowledge-art-digital-creation',
    label: 'Processos de criação e tecnologias digitais',
    subjectId: 'subject-art',
    gradeIds: ALL_HIGH_SCHOOL_GRADES,
  },
  {
    id: 'knowledge-english-multiliteracies',
    label: 'Leitura, oralidade e multiletramentos em língua inglesa',
    subjectId: 'subject-english',
    gradeIds: ALL_HIGH_SCHOOL_GRADES,
  },
  {
    id: 'knowledge-technology-digital-culture',
    label: 'Cultura digital e cidadania',
    subjectId: 'subject-technology',
    gradeIds: ALL_HIGH_SCHOOL_GRADES,
  },
  {
    id: 'knowledge-technology-computational-thinking',
    label: 'Pensamento computacional e resolução de problemas',
    subjectId: 'subject-technology',
    gradeIds: ALL_HIGH_SCHOOL_GRADES,
  },
  {
    id: 'knowledge-life-project-self-knowledge',
    label: 'Autoconhecimento, escolhas e projeto de futuro',
    subjectId: 'subject-life-project',
    gradeIds: ALL_HIGH_SCHOOL_GRADES,
  },
  { id: 'knowledge-other', label: 'Outro' },
] as const satisfies readonly KnowledgeObjectOption[];

export type KnowledgeObjectId = (typeof KNOWLEDGE_OBJECT_OPTIONS)[number]['id'];

export function findOptionById<T extends BookingOption>(
  options: readonly T[],
  id: string | null | undefined,
): T | undefined {
  if (!id) {
    return undefined;
  }

  return options.find((option) => option.id === id);
}

export function getOptionLabel<T extends BookingOption>(
  options: readonly T[],
  id: string | null | undefined,
  fallback = '—',
): string {
  return findOptionById(options, id)?.label ?? fallback;
}

export function getKnowledgeObjectOptions(
  subjectId: string | null | undefined,
  classGroupId: string | null | undefined,
  subjectOptions: readonly BookingOption[] = SUBJECT_OPTIONS,
  classGroupOptions: readonly ClassGroupOption[] = CLASS_GROUP_OPTIONS,
): readonly KnowledgeObjectOption[] {
  const subject = findOptionById(subjectOptions, subjectId);
  const classGroup = findOptionById(classGroupOptions, classGroupId);

  if (!subject || !classGroup) {
    return [];
  }

  return (KNOWLEDGE_OBJECT_OPTIONS as readonly KnowledgeObjectOption[]).filter((option) => {
    const matchesSubject = option.subjectId === undefined || option.subjectId === subject.id;
    const matchesGrade =
      option.gradeIds === undefined || option.gradeIds.includes(classGroup.gradeId);

    return matchesSubject && matchesGrade;
  });
}
