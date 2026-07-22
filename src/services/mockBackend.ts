import type {
  AdminData,
  AvailabilityRequest,
  AvailabilityResponse,
  BackendClient,
  BootstrapData,
  BootstrapParams,
  ClassPeriod,
  CreateReservationRequest,
  Laboratory,
  Reservation,
  Resource,
  Shift,
  Teacher,
} from '../types';
import { BackendError } from '../types';

const school = {
  id: 'SCHOOL-DEMO',
  name: 'E.E. Horizonte do Saber',
  code: '35000123',
  city: 'Campinas',
  state: 'SP',
  institutionalEmail: 'laboratorio@horizontedosaber.edu.br',
  academicYear: 2026,
  timeZone: 'America/Sao_Paulo',
};

const laboratories: Laboratory[] = [
  {
    id: 'LAB01',
    name: 'Laboratório de Informática',
    description: 'Computadores, projeção e acesso à internet para atividades pedagógicas.',
    capacity: 36,
    useType: 'EXCLUSIVE',
    maxSimultaneousClasses: 1,
    calendarEnabled: true,
    active: true,
    status: 'AVAILABLE',
    statusMessage: 'Disponível para novas reservas',
  },
  {
    id: 'LAB02',
    name: 'Sala Maker',
    description: 'Espaço flexível com kits de robótica e bancadas colaborativas.',
    capacity: 24,
    useType: 'SHARED',
    maxSimultaneousClasses: 2,
    calendarEnabled: true,
    active: true,
    status: 'PARTIAL',
    statusMessage: 'Alguns horários já possuem atividades',
  },
  {
    id: 'LAB03',
    name: 'Laboratório de Ciências',
    description: 'Bancadas para práticas de biologia, química e física.',
    capacity: 32,
    useType: 'EXCLUSIVE',
    maxSimultaneousClasses: 1,
    calendarEnabled: false,
    active: true,
    status: 'MAINTENANCE',
    statusMessage: 'Manutenção preventiva até sexta-feira',
  },
];

const resources: Resource[] = [
  {
    id: 'REC01',
    name: 'Notebooks',
    category: 'Tecnologia',
    controlType: 'QUANTITY',
    totalQuantity: 20,
    availableQuantity: 18,
    laboratoryId: 'LAB01',
    active: true,
    notes: 'Dois equipamentos em manutenção.',
  },
  {
    id: 'REC02',
    name: 'Kits de robótica',
    category: 'Robótica',
    controlType: 'QUANTITY',
    totalQuantity: 10,
    availableQuantity: 10,
    laboratoryId: 'LAB02',
    active: true,
  },
  {
    id: 'REC03',
    name: 'Projetor móvel',
    category: 'Audiovisual',
    controlType: 'INDIVIDUAL',
    totalQuantity: 2,
    availableQuantity: 2,
    active: true,
  },
];

const shifts: Shift[] = [
  { id: 'SHIFT-MORNING', name: 'Manhã', order: 1, active: true },
  { id: 'SHIFT-AFTERNOON', name: 'Tarde', order: 2, active: true },
];

const periods: ClassPeriod[] = [
  ['P01', 'SHIFT-MORNING', 1, '1ª aula', '07:00', '07:50', 1],
  ['P02', 'SHIFT-MORNING', 2, '2ª aula', '07:50', '08:40', 2],
  ['P03', 'SHIFT-MORNING', 3, '3ª aula', '08:40', '09:30', 3],
  ['P04', 'SHIFT-AFTERNOON', 1, '1ª aula — tarde', '13:00', '13:50', 4],
  ['P05', 'SHIFT-AFTERNOON', 2, '2ª aula — tarde', '13:50', '14:40', 5],
].map(([id, shiftId, classNumber, name, startTime, endTime, order]) => ({
  id: String(id),
  shiftId: String(shiftId),
  classNumber: Number(classNumber),
  name: String(name),
  startTime: String(startTime),
  endTime: String(endTime),
  order: Number(order),
  active: true,
}));

const teachers: Teacher[] = [
  {
    id: 'TEACHER01',
    name: 'Ana Paula Ribeiro',
    email: 'ana.ribeiro@horizontedosaber.edu.br',
    role: 'TEACHER',
    active: true,
  },
  {
    id: 'TEACHER02',
    name: 'Carlos Eduardo Lima',
    email: 'carlos.lima@horizontedosaber.edu.br',
    role: 'TEACHER',
    active: true,
  },
  {
    id: 'ADMIN01',
    name: 'Marina Lopes',
    email: 'marina.lopes@horizontedosaber.edu.br',
    role: 'ADMINISTRATOR',
    active: true,
  },
];

const initialReservations: Reservation[] = [
  {
    id: 'RES-2026-0042',
    status: 'ACTIVE',
    date: '2026-08-12',
    laboratoryId: 'LAB01',
    laboratoryName: 'Laboratório de Informática',
    teacherId: 'TEACHER01',
    teacherName: 'Ana Paula Ribeiro',
    teacherEmail: 'ana.ribeiro@horizontedosaber.edu.br',
    classGroup: '8º A',
    subject: 'Matemática',
    purpose: 'Atividade de geometria dinâmica',
    studentCount: 32,
    periodIds: ['P01', 'P02'],
    periodLabels: ['1ª aula', '2ª aula'],
    resources: [],
    notes: '',
    createdAt: '2026-07-18T14:30:00-03:00',
    calendarStatus: 'DISABLED',
  },
  {
    id: 'RES-2026-0038',
    status: 'ACTIVE',
    date: '2026-08-15',
    laboratoryId: 'LAB02',
    laboratoryName: 'Sala Maker',
    teacherId: 'TEACHER01',
    teacherName: 'Ana Paula Ribeiro',
    teacherEmail: 'ana.ribeiro@horizontedosaber.edu.br',
    classGroup: '7º B',
    subject: 'Tecnologia',
    purpose: 'Introdução à robótica',
    studentCount: 22,
    periodIds: ['P04'],
    periodLabels: ['1ª aula — tarde'],
    resources: [{ resourceId: 'REC02', resourceName: 'Kits de robótica', quantity: 6 }],
    notes: 'Organizar as equipes antes da aula.',
    createdAt: '2026-07-16T09:10:00-03:00',
    calendarStatus: 'DISABLED',
  },
];

const clone = <T>(value: T): T => structuredClone(value);

export interface MockBackendOptions {
  latencyMs?: number;
  failBootstrap?: boolean;
}

export class MockBackend implements BackendClient {
  private readonly latencyMs: number;
  private readonly failBootstrap: boolean;
  private readonly reservations: Reservation[];
  private reservationSequence = 43;

  constructor(options: MockBackendOptions = {}) {
    this.latencyMs = options.latencyMs ?? 220;
    this.failBootstrap = options.failBootstrap ?? false;
    this.reservations = clone(initialReservations);
  }

  private async wait(): Promise<void> {
    if (this.latencyMs > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, this.latencyMs));
    }
  }

  async getBootstrapData(params: BootstrapParams = {}): Promise<BootstrapData> {
    await this.wait();
    if (this.failBootstrap) {
      throw new BackendError(
        'BACKEND_UNAVAILABLE',
        'Não foi possível carregar os dados da escola.',
      );
    }

    const requestedLaboratory = laboratories.some(
      (laboratory) => laboratory.id === params.preselectedLaboratoryId && laboratory.active,
    )
      ? params.preselectedLaboratoryId
      : undefined;

    const result: BootstrapData = {
      setupCompleted: true,
      school: clone(school),
      laboratories: clone(laboratories.filter((laboratory) => laboratory.active)),
      resources: clone(resources.filter((resource) => resource.active)),
      shifts: clone(shifts.filter((shift) => shift.active)),
      periods: clone(periods.filter((period) => period.active)),
      reservationRules: {
        preventConflicts: true,
        allowSharing: true,
        validateCapacity: true,
        allowRecurrence: true,
        minimumAdvanceHours: 2,
        maximumAdvanceDays: 120,
        allowCancellation: true,
        cancellationDeadlineHours: 12,
        requireIdentification: true,
      },
      notices: [
        {
          id: 'NOTICE01',
          title: 'Planejamento do semestre',
          message: 'As reservas para agosto já estão abertas para todos os professores.',
          tone: 'info',
        },
        {
          id: 'NOTICE02',
          title: 'Laboratório de Ciências',
          message: 'O espaço está em manutenção preventiva durante esta semana.',
          tone: 'warning',
        },
      ],
      currentUser: {
        id: 'TEACHER01',
        name: 'Ana Paula Ribeiro',
        email: 'ana.ribeiro@horizontedosaber.edu.br',
        role: 'TEACHER',
        authenticationMode: 'INSTITUTIONAL',
      },
    };

    if (requestedLaboratory) {
      result.preselectedLaboratoryId = requestedLaboratory;
    }
    return result;
  }

  async getAvailability(request: AvailabilityRequest): Promise<AvailabilityResponse> {
    await this.wait();
    const laboratory = laboratories.find(
      (candidate) => candidate.id === request.laboratoryId && candidate.active,
    );
    if (!laboratory) {
      throw new BackendError('LABORATORY_NOT_FOUND', 'Laboratório não encontrado ou inativo.');
    }

    const isMaintenance = laboratory.status === 'MAINTENANCE';
    const mappedPeriods = periods.map((period, index) => {
      const isUnavailable = isMaintenance || (laboratory.id === 'LAB01' && index === 2);
      const isPartial = !isUnavailable && laboratory.id === 'LAB02' && (index === 1 || index === 3);
      const occupiedCapacity = isUnavailable
        ? laboratory.capacity
        : isPartial
          ? Math.ceil(laboratory.capacity * 0.5)
          : 0;

      return {
        periodId: period.id,
        label: period.name,
        startTime: period.startTime,
        endTime: period.endTime,
        status: isUnavailable
          ? ('UNAVAILABLE' as const)
          : isPartial
            ? ('PARTIAL' as const)
            : ('AVAILABLE' as const),
        occupiedCapacity,
        availableCapacity: Math.max(0, laboratory.capacity - occupiedCapacity),
        activeReservations: isUnavailable || isPartial ? 1 : 0,
      };
    });

    return { date: request.date, laboratoryId: request.laboratoryId, periods: mappedPeriods };
  }

  async createReservation(request: CreateReservationRequest): Promise<Reservation> {
    await this.wait();
    const laboratory = laboratories.find(
      (candidate) => candidate.id === request.laboratoryId && candidate.active,
    );
    const teacher = teachers.find(
      (candidate) => candidate.id === request.teacherId && candidate.active,
    );

    if (!laboratory) {
      throw new BackendError('LABORATORY_NOT_FOUND', 'Laboratório não encontrado ou inativo.');
    }
    if (teacher?.email !== request.teacherEmail) {
      throw new BackendError('UNAUTHORIZED', 'Professor não autorizado para realizar reservas.');
    }
    if (request.studentCount > laboratory.capacity) {
      throw new BackendError(
        'CAPACITY_EXCEEDED',
        `A capacidade máxima deste laboratório é de ${laboratory.capacity} pessoas.`,
      );
    }

    const availability = await this.getAvailability({
      laboratoryId: request.laboratoryId,
      date: request.date,
    });
    const unavailablePeriod = request.periodIds.some((periodId) =>
      availability.periods.some(
        (period) => period.periodId === periodId && period.status === 'UNAVAILABLE',
      ),
    );
    if (unavailablePeriod) {
      throw new BackendError(
        'TIME_CONFLICT',
        'Um dos horários selecionados não está mais disponível.',
      );
    }

    const selectedPeriods = periods.filter((period) => request.periodIds.includes(period.id));
    const selectedResources = request.resources.map((selection) => {
      const resource = resources.find((candidate) => candidate.id === selection.resourceId);
      if (!resource) {
        throw new BackendError('RESOURCE_NOT_FOUND', 'Um dos materiais não foi encontrado.');
      }
      if (selection.quantity > resource.availableQuantity) {
        throw new BackendError(
          'RESOURCE_UNAVAILABLE',
          `Há somente ${resource.availableQuantity} unidade(s) de ${resource.name} disponível(is).`,
        );
      }
      return {
        resourceId: resource.id,
        resourceName: resource.name,
        quantity: selection.quantity,
      };
    });

    const reservation: Reservation = {
      id: `RES-2026-${String(this.reservationSequence).padStart(4, '0')}`,
      status: 'ACTIVE',
      date: request.date,
      laboratoryId: laboratory.id,
      laboratoryName: laboratory.name,
      teacherId: teacher.id,
      teacherName: teacher.name,
      teacherEmail: teacher.email,
      classGroup: request.classGroup.trim(),
      subject: request.subject.trim(),
      purpose: request.purpose.trim(),
      studentCount: request.studentCount,
      periodIds: selectedPeriods.map((period) => period.id),
      periodLabels: selectedPeriods.map((period) => period.name),
      resources: selectedResources,
      notes: request.notes.trim(),
      createdAt: new Date().toISOString(),
      calendarStatus: 'DISABLED',
    };
    this.reservationSequence += 1;
    this.reservations.unshift(reservation);
    return clone(reservation);
  }

  async cancelReservation(reservationId: string): Promise<void> {
    await this.wait();
    const reservation = this.reservations.find((candidate) => candidate.id === reservationId);
    if (!reservation) {
      throw new BackendError('RESERVATION_NOT_FOUND', 'Reserva não encontrada.');
    }
    reservation.status = 'CANCELLED';
  }

  async getReservation(reservationId: string): Promise<Reservation> {
    await this.wait();
    const reservation = this.reservations.find((candidate) => candidate.id === reservationId);
    if (!reservation) {
      throw new BackendError('RESERVATION_NOT_FOUND', 'Reserva não encontrada.');
    }
    return clone(reservation);
  }

  async getMyReservations(userId = 'TEACHER01'): Promise<Reservation[]> {
    await this.wait();
    return clone(this.reservations.filter((reservation) => reservation.teacherId === userId));
  }

  async getAdminData(): Promise<AdminData> {
    await this.wait();
    return {
      school: clone(school),
      laboratories: clone(laboratories),
      resources: clone(resources),
      teachers: clone(teachers),
      activeReservations: this.reservations.filter((reservation) => reservation.status === 'ACTIVE')
        .length,
      pendingCalendarSynchronizations: this.reservations.filter(
        (reservation) => reservation.calendarStatus === 'PENDING',
      ).length,
    };
  }

  async saveInitialSetup(): Promise<void> {
    await this.wait();
  }
}
