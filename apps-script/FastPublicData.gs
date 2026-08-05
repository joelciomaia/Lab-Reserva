function readPublicCoreConfiguration_(spreadsheet) {
  var settingsTable = readTable_(spreadsheet, 'CONFIGURACOES', ['CHAVE', 'VALOR']);
  var laboratoriesTable = readTable_(spreadsheet, 'LABORATORIOS', ['ID', 'NOME', 'ATIVO']);
  var shiftsTable = readTable_(spreadsheet, 'TURNOS', [
    'ID',
    'NOME',
    'HORA_INICIO',
    'DURACAO_AULA',
    'QUANTIDADE_AULAS',
    'INTERVALO_APOS',
    'DURACAO_INTERVALO',
    'DIAS_SEMANA',
    'ATIVO',
  ]);

  var settings = settingsMap_(settingsTable);
  var laboratories = readLaboratories_(laboratoriesTable);
  var shifts = readShifts_(shiftsTable);

  return {
    school: {
      id: optionalText_(settings.ID_ESCOLA),
      name: optionalText_(settings.NOME_ESCOLA),
    },
    laboratories: laboratories,
    shifts: shifts,
    periods: createPeriods_(shifts),
    revision: digest_([
      settingsTable.rawValues,
      laboratoriesTable.rawValues,
      shiftsTable.rawValues,
    ]),
  };
}

function readPublicBookingOptions_(spreadsheet) {
  var settingsTable = readTable_(spreadsheet, 'CONFIGURACOES', ['CHAVE', 'VALOR']);
  var subjectsTable = readTable_(spreadsheet, 'DISCIPLINAS', ['ID', 'NOME', 'ATIVO']);
  var classGroupsTable = readTable_(spreadsheet, 'TURMAS', [
    'ID',
    'NOME',
    'ETAPA',
    'QUANTIDADE_ALUNOS',
    'ATIVO',
  ]);
  var resourcesTable = readTable_(spreadsheet, 'RECURSOS', ['ID', 'NOME', 'ATIVO']);
  var settings = settingsMap_(settingsTable);

  return {
    subjects: readSimpleOptions_(subjectsTable, 'disciplina'),
    classGroups: readClassGroups_(classGroupsTable),
    resources: readSimpleOptions_(resourcesTable, 'recurso'),
    bookingForm: {
      showObservations: booleanCell_(
        settings.EXIBIR_OBSERVACOES,
        'CONFIGURACOES (EXIBIR_OBSERVACOES)',
        false,
      ),
    },
    optionsRevision: digest_([
      settingsTable.rawValues,
      subjectsTable.rawValues,
      classGroupsTable.rawValues,
      resourcesTable.rawValues,
    ]),
  };
}

function activePublicLaboratories_(configuration) {
  return configuration.laboratories
    .filter(function (laboratory) {
      return laboratory.active;
    })
    .map(function (laboratory) {
      return {
        id: laboratory.id,
        name: laboratory.name,
        active: laboratory.active,
      };
    });
}

function getFastBootstrapData_(school, preselectedLaboratoryId) {
  var spreadsheet = spreadsheetForSchool_(school);
  var configuration = readPublicCoreConfiguration_(spreadsheet);
  var data = {
    school: configuration.school,
    laboratories: activePublicLaboratories_(configuration),
    periods: configuration.periods,
    classGroups: [],
    subjects: [],
    resources: [],
    bookingForm: { showObservations: false },
    configurationRevision: configuration.revision,
    sourceSpreadsheetFingerprint: spreadsheetBindingFingerprint_(spreadsheet),
  };

  if (preselectedLaboratoryId && activeLaboratory_(configuration, preselectedLaboratoryId)) {
    data.preselectedLaboratoryId = preselectedLaboratoryId;
  }
  return data;
}

function getBookingOptionsData_(school) {
  var spreadsheet = spreadsheetForSchool_(school);
  return readPublicBookingOptions_(spreadsheet);
}

function fastAvailabilityContext_(school, laboratoryId) {
  var spreadsheet = spreadsheetForSchool_(school);
  var configuration = readPublicCoreConfiguration_(spreadsheet);
  var laboratory = activeLaboratory_(configuration, laboratoryId);
  if (!laboratory) {
    throwApiError_('LABORATORY_NOT_FOUND', 'Laboratório não encontrado ou inativo.');
  }

  return {
    configuration: configuration,
    laboratory: laboratory,
    reservations: readReservations_(spreadsheet),
    cancelled: cancellationSet_(readCancellations_(spreadsheet)),
  };
}

function getFastAvailability_(school, request) {
  var laboratoryId = requiredText_(request.laboratoryId, 'laboratoryId', 128);
  var date = assertIsoDate_(request.date);
  var context = fastAvailabilityContext_(school, laboratoryId);
  return buildAvailabilityResponse_(context, laboratoryId, date);
}

function getFastWeekAvailability_(school, request) {
  var laboratoryId = requiredText_(request.laboratoryId, 'laboratoryId', 128);
  var dates = validateAvailabilityDates_(request.dates);
  var context = fastAvailabilityContext_(school, laboratoryId);

  return dates.map(function (date) {
    return buildAvailabilityResponse_(context, laboratoryId, date);
  });
}
