function readConfiguration_(spreadsheet) {
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
  var laboratories = readLaboratories_(laboratoriesTable);
  var shifts = readShifts_(shiftsTable);
  var periods = createPeriods_(shifts);

  return {
    school: {
      id: optionalText_(settings.ID_ESCOLA),
      name: optionalText_(settings.NOME_ESCOLA),
    },
    laboratories: laboratories,
    shifts: shifts,
    periods: periods,
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
    revision: digest_([
      settingsTable.rawValues,
      laboratoriesTable.rawValues,
      shiftsTable.rawValues,
      subjectsTable.rawValues,
      classGroupsTable.rawValues,
      resourcesTable.rawValues,
    ]),
  };
}

function settingsMap_(table) {
  var result = Object.create(null);
  for (var rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
    var row = table.rows[rowIndex];
    if (rowIsBlank_(row)) continue;
    var key = normalizeHeader_(tableCell_(table, row, 'CHAVE'));
    if (!key) {
      throwApiError_(
        'CONFIGURATION_ERROR',
        'CONFIGURACOES!A' + (rowIndex + 2) + ' deve conter uma chave.',
      );
    }
    if (Object.prototype.hasOwnProperty.call(result, key)) {
      throwApiError_('CONFIGURATION_ERROR', 'A chave ' + key + ' está repetida em CONFIGURACOES.');
    }
    result[key] = tableCell_(table, row, 'VALOR');
  }
  return result;
}

function readLaboratories_(table) {
  var result = [];
  var seenIds = Object.create(null);
  for (var rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
    var row = table.rows[rowIndex];
    if (rowIsBlank_(row)) continue;
    var location = 'LABORATORIOS!linha ' + (rowIndex + 2);
    var id = cellText_(tableCell_(table, row, 'ID'));
    var name = cellText_(tableCell_(table, row, 'NOME'));
    if (!id || !name) {
      throwApiError_('CONFIGURATION_ERROR', location + ' deve conter ID e NOME.');
    }
    if (seenIds[id]) {
      throwApiError_('CONFIGURATION_ERROR', 'O laboratório ' + id + ' está repetido.');
    }
    seenIds[id] = true;
    result.push({
      id: id,
      name: name,
      active: booleanCell_(tableCell_(table, row, 'ATIVO'), location + ' (ATIVO)', false),
    });
  }
  return result;
}

function readWeekdays_(value, location) {
  var items = splitList_(value);
  var result = [];
  var seen = Object.create(null);
  for (var index = 0; index < items.length; index += 1) {
    var weekday = Number(items[index]);
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7 || seen[weekday]) {
      throwApiError_('CONFIGURATION_ERROR', location + ' deve listar dias ISO únicos de 1 a 7.', {
        location: location,
      });
    }
    seen[weekday] = true;
    result.push(weekday);
  }
  result.sort(function (left, right) {
    return left - right;
  });
  return result;
}

function readShifts_(table) {
  var result = [];
  var seenIds = Object.create(null);
  for (var rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
    var row = table.rows[rowIndex];
    if (rowIsBlank_(row)) continue;
    var location = 'TURNOS!linha ' + (rowIndex + 2);
    var id = cellText_(tableCell_(table, row, 'ID'));
    var name = cellText_(tableCell_(table, row, 'NOME'));
    if (!id || !name) {
      throwApiError_('CONFIGURATION_ERROR', location + ' deve conter ID e NOME.');
    }
    if (seenIds[id]) {
      throwApiError_('CONFIGURATION_ERROR', 'O turno ' + id + ' está repetido.');
    }
    seenIds[id] = true;

    var active = booleanCell_(tableCell_(table, row, 'ATIVO'), location + ' (ATIVO)', false);
    if (!active) {
      continue;
    }
    var weekdays = readWeekdays_(
      tableCell_(table, row, 'DIAS_SEMANA'),
      location + ' (DIAS_SEMANA)',
    );
    if (weekdays.length === 0) {
      throwApiError_('CONFIGURATION_ERROR', location + ' precisa ter pelo menos um dia da semana.');
    }
    var breakAfter = integerCell_(
      tableCell_(table, row, 'INTERVALO_APOS'),
      location + ' (INTERVALO_APOS)',
      {
        optional: true,
        minimum: 1,
        maximum: 99,
      },
    );
    var classCount = integerCell_(
      tableCell_(table, row, 'QUANTIDADE_AULAS'),
      location + ' (QUANTIDADE_AULAS)',
      { minimum: 1, maximum: 100 },
    );
    if (breakAfter !== null && breakAfter >= classCount) {
      throwApiError_(
        'CONFIGURATION_ERROR',
        location + ' possui intervalo depois de uma aula inexistente.',
      );
    }

    result.push({
      id: id,
      name: name,
      order: result.length + 1,
      startMinutes: parseClock_(tableCell_(table, row, 'HORA_INICIO'), location + ' (HORA_INICIO)'),
      classDurationMinutes: integerCell_(
        tableCell_(table, row, 'DURACAO_AULA'),
        location + ' (DURACAO_AULA)',
        { minimum: 1, maximum: 1440 },
      ),
      classCount: classCount,
      breakAfterClass: breakAfter,
      breakDurationMinutes: integerCell_(
        tableCell_(table, row, 'DURACAO_INTERVALO'),
        location + ' (DURACAO_INTERVALO)',
        { minimum: 0, maximum: 1440 },
      ),
      activeWeekdays: weekdays,
      active: true,
    });
  }
  return result;
}

function generatedPeriodId_(shiftId, classNumber) {
  var normalizedShiftId = shiftId.replace(/[^a-zA-Z0-9_-]/g, '-');
  return normalizedShiftId + '-CLASS-' + classNumber;
}

function createPeriods_(shifts) {
  var periods = [];
  for (var shiftIndex = 0; shiftIndex < shifts.length; shiftIndex += 1) {
    var shift = shifts[shiftIndex];
    var cursor = shift.startMinutes;
    for (var classIndex = 0; classIndex < shift.classCount; classIndex += 1) {
      var classNumber = classIndex + 1;
      var end = cursor + shift.classDurationMinutes;
      if (end >= 1440) {
        throwApiError_(
          'CONFIGURATION_ERROR',
          'O turno ' + shift.name + ' ultrapassa o fim do dia.',
        );
      }
      periods.push({
        id: generatedPeriodId_(shift.id, classNumber),
        shiftId: shift.id,
        shiftName: shift.name,
        shiftOrder: shift.order,
        classNumber: classNumber,
        name: classNumber + 'ª aula',
        startTime: formatClock_(cursor),
        endTime: formatClock_(end),
        order: classNumber,
        active: true,
        activeWeekdays: shift.activeWeekdays.slice(),
      });
      cursor = end;
      if (shift.breakAfterClass === classNumber && classNumber < shift.classCount) {
        cursor += shift.breakDurationMinutes;
      }
    }
  }
  return periods;
}

function readSimpleOptions_(table, itemName) {
  var result = [];
  var seenIds = Object.create(null);
  for (var rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
    var row = table.rows[rowIndex];
    if (rowIsBlank_(row)) continue;
    var id = cellText_(tableCell_(table, row, 'ID'));
    var label = cellText_(tableCell_(table, row, 'NOME'));
    if (!id || !label) {
      throwApiError_(
        'CONFIGURATION_ERROR',
        table.title + '!linha ' + (rowIndex + 2) + ' deve conter ID e NOME.',
      );
    }
    if (seenIds[id]) {
      throwApiError_(
        'CONFIGURATION_ERROR',
        'O ID ' + id + ' está repetido em ' + table.title + '.',
      );
    }
    seenIds[id] = true;
    var active = booleanCell_(
      tableCell_(table, row, 'ATIVO'),
      table.title + '!linha ' + (rowIndex + 2) + ' (ATIVO)',
      false,
    );
    if (active) {
      result.push({ id: id, label: label, order: result.length + 1, active: true });
    }
  }
  return result;
}

function readClassGroups_(table) {
  var options = readSimpleOptions_(table, 'turma');
  var rowsById = Object.create(null);
  for (var rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
    var row = table.rows[rowIndex];
    if (rowIsBlank_(row)) continue;
    rowsById[cellText_(tableCell_(table, row, 'ID'))] = row;
  }
  for (var index = 0; index < options.length; index += 1) {
    var option = options[index];
    var sourceRow = rowsById[option.id];
    option.gradeId = cellText_(tableCell_(table, sourceRow, 'ETAPA')) || 'other';
    var countValue = tableCell_(table, sourceRow, 'QUANTIDADE_ALUNOS');
    option.studentCount = isBlankCell_(countValue)
      ? 0
      : integerCell_(countValue, 'TURMAS (' + option.id + ', QUANTIDADE_ALUNOS)', {
          minimum: 0,
          maximum: 100000,
        });
  }
  return options;
}

function applicablePeriods_(configuration, isoDate) {
  var weekday = isoWeekday_(isoDate);
  return configuration.periods.filter(function (period) {
    return period.active && period.activeWeekdays.indexOf(weekday) >= 0;
  });
}

function activeLaboratory_(configuration, laboratoryId) {
  for (var index = 0; index < configuration.laboratories.length; index += 1) {
    var laboratory = configuration.laboratories[index];
    if (laboratory.id === laboratoryId && laboratory.active) {
      return laboratory;
    }
  }
  return null;
}

function getBootstrapData_(school, preselectedLaboratoryId) {
  var spreadsheet = spreadsheetForSchool_(school);
  var configuration = readConfiguration_(spreadsheet);
  var activeLaboratories = configuration.laboratories.filter(function (laboratory) {
    return laboratory.active;
  });
  var data = {
    school: configuration.school,
    laboratories: activeLaboratories,
    periods: configuration.periods,
    classGroups: configuration.classGroups,
    subjects: configuration.subjects,
    resources: configuration.resources,
    bookingForm: configuration.bookingForm,
    configurationRevision: configuration.revision,
    sourceSpreadsheetFingerprint: spreadsheetBindingFingerprint_(spreadsheet),
  };

  if (preselectedLaboratoryId && activeLaboratory_(configuration, preselectedLaboratoryId)) {
    data.preselectedLaboratoryId = preselectedLaboratoryId;
  }
  return data;
}
