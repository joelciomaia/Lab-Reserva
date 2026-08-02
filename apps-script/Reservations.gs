function readReservations_(spreadsheet) {
  var table = readTable_(spreadsheet, RESERVATIONS_SHEET_NAME_, RESERVATIONS_HEADER_);
  var reservations = [];
  var seenIds = Object.create(null);

  for (var rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
    var row = table.rows[rowIndex];
    if (rowIsBlank_(row)) continue;
    var location = RESERVATIONS_SHEET_NAME_ + '!linha ' + (rowIndex + 2);
    var id = cellText_(tableCell_(table, row, 'ID'));
    if (!id) {
      throwApiError_('DATA_INTEGRITY_ERROR', location + ' não possui ID.');
    }
    if (seenIds[id]) {
      throwApiError_('DATA_INTEGRITY_ERROR', 'A reserva ' + id + ' está repetida.');
    }
    seenIds[id] = true;

    var periodIds = splitList_(tableCell_(table, row, 'AULAS_IDS'));
    if (periodIds.length === 0) {
      throwApiError_('DATA_INTEGRITY_ERROR', location + ' não possui aulas vinculadas.');
    }
    var uniquePeriodIds = Object.create(null);
    for (var periodIndex = 0; periodIndex < periodIds.length; periodIndex += 1) {
      if (uniquePeriodIds[periodIds[periodIndex]]) {
        throwApiError_('DATA_INTEGRITY_ERROR', location + ' repete a mesma aula.');
      }
      uniquePeriodIds[periodIds[periodIndex]] = true;
    }

    reservations.push({
      id: id,
      date: sheetDateToIso_(tableCell_(table, row, 'DATA'), spreadsheet, location + ' (DATA)'),
      laboratoryId: cellText_(tableCell_(table, row, 'LABORATORIO_ID')),
      laboratoryName: cellText_(tableCell_(table, row, 'LABORATORIO_NOME')),
      teacherName: cellText_(tableCell_(table, row, 'PROFESSOR')),
      subject: cellText_(tableCell_(table, row, 'DISCIPLINA')),
      classGroup: cellText_(tableCell_(table, row, 'TURMA')),
      periodIds: periodIds,
      periodLabels: splitList_(tableCell_(table, row, 'AULAS_NOMES')),
      periodTimes: splitList_(tableCell_(table, row, 'AULAS_HORARIOS')),
      knowledgeObjects: cellText_(tableCell_(table, row, 'OBJETOS_CONHECIMENTO')),
      itemsUsed: cellText_(tableCell_(table, row, 'ITENS_UTILIZADOS')),
      notes: cellText_(tableCell_(table, row, 'OBSERVACOES')),
      createdAt: cellText_(tableCell_(table, row, 'CRIADO_EM')),
    });
  }
  return reservations;
}

function readCancellations_(spreadsheet) {
  var table = readTable_(spreadsheet, CANCELLATIONS_SHEET_NAME_, CANCELLATIONS_HEADER_);
  var cancellations = [];
  var seenIds = Object.create(null);
  for (var rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
    var row = table.rows[rowIndex];
    if (rowIsBlank_(row)) continue;
    var location = CANCELLATIONS_SHEET_NAME_ + '!linha ' + (rowIndex + 2);
    var id = cellText_(tableCell_(table, row, 'ID'));
    var reservationId = cellText_(tableCell_(table, row, 'RESERVA_ID'));
    var periodId = cellText_(tableCell_(table, row, 'AULA_ID'));
    if (!id || !reservationId || !periodId) {
      throwApiError_('DATA_INTEGRITY_ERROR', location + ' deve conter ID, RESERVA_ID e AULA_ID.');
    }
    if (seenIds[id]) {
      throwApiError_('DATA_INTEGRITY_ERROR', 'O cancelamento ' + id + ' está repetido.');
    }
    seenIds[id] = true;
    cancellations.push({ id: id, reservationId: reservationId, periodId: periodId });
  }
  return cancellations;
}

function cancellationKey_(reservationId, periodId) {
  return reservationId + '\u0000' + periodId;
}

function cancellationSet_(cancellations) {
  var result = Object.create(null);
  for (var index = 0; index < cancellations.length; index += 1) {
    var cancellation = cancellations[index];
    result[cancellationKey_(cancellation.reservationId, cancellation.periodId)] = true;
  }
  return result;
}

function parsePeriodTime_(value) {
  var match = /^(\d{2}:\d{2})\s*[-–—]\s*(\d{2}:\d{2})$/.exec(optionalText_(value));
  if (!match) return null;
  var startParts = match[1].split(':');
  var endParts = match[2].split(':');
  var start = Number(startParts[0]) * 60 + Number(startParts[1]);
  var end = Number(endParts[0]) * 60 + Number(endParts[1]);
  if (start < 0 || start >= 1440 || end <= start || end > 1440) return null;
  return { start: start, end: end };
}

function findPeriodForReservationEntry_(periodId, index, periods) {
  for (var periodIndex = 0; periodIndex < periods.length; periodIndex += 1) {
    if (periods[periodIndex].id === periodId) return periods[periodIndex];
  }
  var legacyMatch = /^P(\d+)$/i.exec(periodId);
  if (legacyMatch) {
    var ordinal = Number(legacyMatch[1]) - 1;
    return periods[ordinal] || null;
  }
  return periods[index] && periods[index].id === periodId ? periods[index] : null;
}

function reservationEntries_(reservation, periods, cancelled) {
  var entries = [];
  for (var index = 0; index < reservation.periodIds.length; index += 1) {
    var periodId = reservation.periodIds[index];
    if (cancelled[cancellationKey_(reservation.id, periodId)]) continue;
    var configuredPeriod = findPeriodForReservationEntry_(periodId, index, periods);
    var time = parsePeriodTime_(reservation.periodTimes[index]);
    if (!time && configuredPeriod) {
      time = parsePeriodTime_(configuredPeriod.startTime + '-' + configuredPeriod.endTime);
    }
    entries.push({ id: periodId, time: time });
  }
  return entries;
}

function periodsOverlap_(left, right) {
  return left && right && left.start < right.end && right.start < left.end;
}

function entryConflictsWithPeriod_(entry, period) {
  if (entry.id === period.id) return true;
  var periodTime = parsePeriodTime_(period.startTime + '-' + period.endTime);
  return periodsOverlap_(entry.time, periodTime);
}

function occupyingReservation_(reservations, cancelled, periods, laboratoryId, date, period) {
  for (var reservationIndex = 0; reservationIndex < reservations.length; reservationIndex += 1) {
    var reservation = reservations[reservationIndex];
    if (reservation.laboratoryId !== laboratoryId || reservation.date !== date) continue;
    var entries = reservationEntries_(reservation, periods, cancelled);
    for (var entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
      if (entryConflictsWithPeriod_(entries[entryIndex], period)) return reservation;
    }
  }
  return null;
}

function getAvailability_(request) {
  var laboratoryId = requiredText_(request.laboratoryId, 'laboratoryId', 128);
  var date = assertIsoDate_(request.date);
  var spreadsheet = spreadsheet_();
  ensureOperationalSheets_(spreadsheet);
  var configuration = readConfiguration_(spreadsheet);
  if (!activeLaboratory_(configuration, laboratoryId)) {
    throwApiError_('LABORATORY_NOT_FOUND', 'Laboratório não encontrado ou inativo.');
  }
  var reservations = readReservations_(spreadsheet);
  var cancelled = cancellationSet_(readCancellations_(spreadsheet));
  var applicable = applicablePeriods_(configuration, date);
  var result = [];

  for (var index = 0; index < applicable.length; index += 1) {
    var period = applicable[index];
    var reservation = occupyingReservation_(
      reservations,
      cancelled,
      configuration.periods,
      laboratoryId,
      date,
      period,
    );
    var availability = {
      periodId: period.id,
      shiftId: period.shiftId,
      shiftName: period.shiftName,
      shiftOrder: period.shiftOrder,
      classNumber: period.classNumber,
      label: period.name,
      startTime: period.startTime,
      endTime: period.endTime,
      status: reservation ? 'UNAVAILABLE' : 'AVAILABLE',
    };
    if (reservation) {
      availability.reservation = {
        id: reservation.id,
      };
    }
    result.push(availability);
  }

  return { date: date, laboratoryId: laboratoryId, periods: result };
}

function validateCreateRequest_(request) {
  return {
    laboratoryId: requiredText_(request.laboratoryId, 'laboratoryId', 128),
    teacherName: requiredText_(request.teacherName, 'teacherName', 120),
    subject: requiredText_(request.subject, 'subject', 100),
    classGroup: requiredText_(request.classGroup, 'classGroup', 80),
    date: assertIsoDate_(request.date),
    periodIds: uniqueStrings_(request.periodIds, 'periodIds', 100),
    knowledgeObjects: requiredText_(request.knowledgeObjects, 'knowledgeObjects', 800),
    itemsUsed: requiredText_(request.itemsUsed, 'itemsUsed', 500),
    notes: boundedOptionalText_(request.notes, 'notes', 800),
  };
}

function createReservation_(rawRequest) {
  var request = validateCreateRequest_(rawRequest);
  return withScriptLock_(function () {
    var spreadsheet = spreadsheet_();
    ensureOperationalSheetsUnlocked_(spreadsheet);
    var configuration = readConfiguration_(spreadsheet);
    var laboratory = activeLaboratory_(configuration, request.laboratoryId);
    if (!laboratory) {
      throwApiError_('LABORATORY_NOT_FOUND', 'Laboratório não encontrado ou inativo.');
    }

    var applicable = applicablePeriods_(configuration, request.date);
    var applicableById = Object.create(null);
    for (var applicableIndex = 0; applicableIndex < applicable.length; applicableIndex += 1) {
      applicableById[applicable[applicableIndex].id] = applicable[applicableIndex];
    }
    var selected = [];
    for (var requestedIndex = 0; requestedIndex < request.periodIds.length; requestedIndex += 1) {
      var selectedPeriod = applicableById[request.periodIds[requestedIndex]];
      if (!selectedPeriod) {
        throwApiError_('VALIDATION_ERROR', 'Uma das aulas selecionadas não existe nessa data.', {
          field: 'periodIds',
          periodId: request.periodIds[requestedIndex],
        });
      }
      selected.push(selectedPeriod);
    }

    var reservations = readReservations_(spreadsheet);
    var cancelled = cancellationSet_(readCancellations_(spreadsheet));
    for (var periodIndex = 0; periodIndex < selected.length; periodIndex += 1) {
      var conflict = occupyingReservation_(
        reservations,
        cancelled,
        configuration.periods,
        laboratory.id,
        request.date,
        selected[periodIndex],
      );
      if (conflict) {
        throwApiError_('TIME_CONFLICT', 'Um dos horários selecionados não está mais disponível.', {
          periodId: selected[periodIndex].id,
        });
      }
    }

    var reservation = {
      id: Utilities.getUuid(),
      date: request.date,
      laboratoryId: laboratory.id,
      laboratoryName: laboratory.name,
      teacherName: request.teacherName,
      subject: request.subject,
      classGroup: request.classGroup,
      periodIds: selected.map(function (period) {
        return period.id;
      }),
      periodLabels: selected.map(function (period) {
        return period.name;
      }),
      periodTimes: selected.map(function (period) {
        return period.startTime + '-' + period.endTime;
      }),
      knowledgeObjects: request.knowledgeObjects,
      itemsUsed: request.itemsUsed,
      notes: request.notes,
      createdAt: new Date().toISOString(),
      status: RESERVATION_STATUS_.CONFIRMED,
    };

    var sheet = spreadsheet.getSheetByName(RESERVATIONS_SHEET_NAME_);
    appendImmutableRow_(sheet, [
      reservation.id,
      reservation.date,
      reservation.laboratoryId,
      reservation.laboratoryName,
      reservation.teacherName,
      reservation.subject,
      reservation.classGroup,
      serializeList_(reservation.periodIds),
      serializeList_(reservation.periodLabels),
      reservation.knowledgeObjects,
      reservation.itemsUsed,
      reservation.notes,
      reservation.createdAt,
      serializeList_(reservation.periodTimes),
    ]);
    SpreadsheetApp.flush();
    return reservation;
  });
}
