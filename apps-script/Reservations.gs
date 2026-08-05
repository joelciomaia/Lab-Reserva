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

function occupyingReservations_(reservations, cancelled, periods, laboratoryId, date, period) {
  var occupying = [];
  for (var reservationIndex = 0; reservationIndex < reservations.length; reservationIndex += 1) {
    var reservation = reservations[reservationIndex];
    if (reservation.laboratoryId !== laboratoryId || reservation.date !== date) continue;
    var entries = reservationEntries_(reservation, periods, cancelled);
    for (var entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
      if (entryConflictsWithPeriod_(entries[entryIndex], period)) {
        occupying.push(reservation);
        break;
      }
    }
  }
  return occupying;
}

function reservationSummary_(reservation) {
  return {
    id: reservation.id,
    teacherName: reservation.teacherName,
    subject: reservation.subject,
    classGroup: reservation.classGroup,
  };
}

function availabilityContext_(school, laboratoryId) {
  var spreadsheet = spreadsheetForSchool_(school);
  var configuration = readConfiguration_(spreadsheet);
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

function buildAvailabilityResponse_(context, laboratoryId, date) {
  var applicable = applicablePeriods_(context.configuration, date);
  var maxConcurrentClasses = context.laboratory.maxConcurrentClasses || 1;
  var result = [];

  for (var index = 0; index < applicable.length; index += 1) {
    var period = applicable[index];
    var occupying = occupyingReservations_(
      context.reservations,
      context.cancelled,
      context.configuration.periods,
      laboratoryId,
      date,
      period,
    );
    var summaries = occupying.map(reservationSummary_);
    var remainingCapacity = Math.max(0, maxConcurrentClasses - summaries.length);
    var availability = {
      periodId: period.id,
      shiftId: period.shiftId,
      shiftName: period.shiftName,
      shiftOrder: period.shiftOrder,
      classNumber: period.classNumber,
      label: period.name,
      startTime: period.startTime,
      endTime: period.endTime,
      status: remainingCapacity > 0 ? 'AVAILABLE' : 'UNAVAILABLE',
      reservations: summaries,
      reservationCount: summaries.length,
      maxConcurrentClasses: maxConcurrentClasses,
      remainingCapacity: remainingCapacity,
    };
    if (summaries.length > 0) {
      availability.reservation = summaries[0];
    }
    result.push(availability);
  }

  return { date: date, laboratoryId: laboratoryId, periods: result };
}

function getAvailability_(school, request) {
  var laboratoryId = requiredText_(request.laboratoryId, 'laboratoryId', 128);
  var date = assertIsoDate_(request.date);
  var context = availabilityContext_(school, laboratoryId);
  return buildAvailabilityResponse_(context, laboratoryId, date);
}

function validateAvailabilityDates_(rawDates) {
  if (!Array.isArray(rawDates) || rawDates.length === 0) {
    throwApiError_('VALIDATION_ERROR', 'Informe pelo menos uma data para consultar.', {
      field: 'dates',
    });
  }
  if (rawDates.length > 31) {
    throwApiError_('VALIDATION_ERROR', 'A consulta de disponibilidade aceita no máximo 31 datas.', {
      field: 'dates',
      maximum: 31,
    });
  }

  var dates = [];
  var seen = Object.create(null);
  for (var index = 0; index < rawDates.length; index += 1) {
    var date = assertIsoDate_(optionalText_(rawDates[index]));
    if (seen[date]) {
      throwApiError_('VALIDATION_ERROR', 'A consulta repete a data ' + date + '.', {
        field: 'dates',
        date: date,
      });
    }
    seen[date] = true;
    dates.push(date);
  }
  return dates;
}

function getWeekAvailability_(school, request) {
  var laboratoryId = requiredText_(request.laboratoryId, 'laboratoryId', 128);
  var dates = validateAvailabilityDates_(request.dates);
  var context = availabilityContext_(school, laboratoryId);

  return dates.map(function (date) {
    return buildAvailabilityResponse_(context, laboratoryId, date);
  });
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

function createReservation_(school, rawRequest) {
  var request = validateCreateRequest_(rawRequest);
  var created = withScriptLock_(function () {
    var spreadsheet = spreadsheetForSchool_(school);
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
    var maxConcurrentClasses = laboratory.maxConcurrentClasses || 1;
    for (var periodIndex = 0; periodIndex < selected.length; periodIndex += 1) {
      var conflicts = occupyingReservations_(
        reservations,
        cancelled,
        configuration.periods,
        laboratory.id,
        request.date,
        selected[periodIndex],
      );
      if (conflicts.length >= maxConcurrentClasses) {
        throwApiError_(
          'TIME_CONFLICT',
          'Um dos horários selecionados atingiu o limite de turmas simultâneas.',
          {
            periodId: selected[periodIndex].id,
            reservationCount: conflicts.length,
            maxConcurrentClasses: maxConcurrentClasses,
          },
        );
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
    return {
      reservation: reservation,
      schoolName: configuration.school.name,
      laboratory: laboratory,
    };
  });

  notifyNewReservationBestEffort_({
    reservation: created.reservation,
    schoolName: created.schoolName,
    laboratory: created.laboratory,
  });
  return created.reservation;
}
