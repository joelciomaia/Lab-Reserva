function diagnosticMeasure_(timings, name, operation) {
  var startedAt = Date.now();
  var result = operation();
  timings[name] = Date.now() - startedAt;
  return result;
}

function diagnosticPayloadBytes_(value) {
  return Utilities.newBlob(JSON.stringify(value), 'application/json').getBytes().length;
}

function diagnosticBootstrap_(school, request) {
  var timings = {};
  var startedAt = Date.now();
  var spreadsheet = diagnosticMeasure_(timings, 'abrirPlanilhaEVinculoMs', function () {
    return spreadsheetForSchool_(school);
  });
  var configuration = diagnosticMeasure_(timings, 'lerConfiguracaoEssencialMs', function () {
    return readPublicCoreConfiguration_(spreadsheet);
  });
  var preselectedLaboratoryId = optionalText_(request.preselectedLaboratoryId);
  var response = diagnosticMeasure_(timings, 'montarRespostaBootstrapMs', function () {
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
  });

  return {
    mode: 'bootstrap',
    generatedAt: new Date().toISOString(),
    totalServerMs: Date.now() - startedAt,
    timings: timings,
    counts: {
      laboratories: response.laboratories.length,
      periods: response.periods.length,
      subjects: 0,
      classGroups: 0,
      resources: 0,
    },
    responseBytes: diagnosticPayloadBytes_(response),
  };
}

function diagnosticWeek_(school, request) {
  var timings = {};
  var startedAt = Date.now();
  var laboratoryId = requiredText_(request.laboratoryId, 'laboratoryId', 128);
  var dates = validateAvailabilityDates_(request.dates);
  var spreadsheet = diagnosticMeasure_(timings, 'abrirPlanilhaEVinculoMs', function () {
    return spreadsheetForSchool_(school);
  });
  var configuration = diagnosticMeasure_(timings, 'lerConfiguracaoEssencialMs', function () {
    return readPublicCoreConfiguration_(spreadsheet);
  });
  var laboratory = diagnosticMeasure_(timings, 'localizarLaboratorioMs', function () {
    return activeLaboratory_(configuration, laboratoryId);
  });
  if (!laboratory) {
    throwApiError_('LABORATORY_NOT_FOUND', 'Laboratório não encontrado ou inativo.');
  }
  var reservations = diagnosticMeasure_(timings, 'lerReservasMs', function () {
    return readReservations_(spreadsheet);
  });
  var context = {
    configuration: configuration,
    laboratory: laboratory,
    reservations: reservations,
  };
  var responses = diagnosticMeasure_(timings, 'montarDisponibilidadeMs', function () {
    return dates.map(function (date) {
      return buildAvailabilityResponse_(context, laboratoryId, date);
    });
  });
  var responseBytes = diagnosticMeasure_(timings, 'serializarRespostaMs', function () {
    return diagnosticPayloadBytes_(responses);
  });

  return {
    mode: 'week',
    generatedAt: new Date().toISOString(),
    totalServerMs: Date.now() - startedAt,
    timings: timings,
    counts: {
      dates: dates.length,
      periods: configuration.periods.length,
      reservations: reservations.length,
      cancelledReservations: reservations.filter(function (reservation) {
        return reservation.status !== RESERVATION_STATUS_.CONFIRMED;
      }).length,
    },
    responseBytes: responseBytes,
  };
}

function runDiagnostics_(school, request) {
  var normalizedSchool = requiredText_(school, 'school', 128);
  var payload = isPlainObject_(request) ? request : {};
  var mode = optionalText_(payload.mode) || 'week';

  if (mode === 'bootstrap') {
    return diagnosticBootstrap_(normalizedSchool, payload);
  }
  if (mode === 'week') {
    return diagnosticWeek_(normalizedSchool, payload);
  }

  throwApiError_('VALIDATION_ERROR', 'O modo de diagnóstico deve ser bootstrap ou week.', {
    field: 'mode',
  });
}
