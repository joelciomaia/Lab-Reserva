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
  var configuration = diagnosticMeasure_(timings, 'lerConfiguracaoCompletaMs', function () {
    return readConfiguration_(spreadsheet);
  });
  var preselectedLaboratoryId = optionalText_(request.preselectedLaboratoryId);
  var response = diagnosticMeasure_(timings, 'montarRespostaBootstrapMs', function () {
    var activeLaboratories = configuration.laboratories
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
  });

  return {
    mode: 'bootstrap',
    generatedAt: new Date().toISOString(),
    totalServerMs: Date.now() - startedAt,
    timings: timings,
    counts: {
      laboratories: response.laboratories.length,
      periods: response.periods.length,
      subjects: response.subjects.length,
      classGroups: response.classGroups.length,
      resources: response.resources.length,
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
  var configuration = diagnosticMeasure_(timings, 'lerConfiguracaoCompletaMs', function () {
    return readConfiguration_(spreadsheet);
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
  var cancellations = diagnosticMeasure_(timings, 'lerCancelamentosMs', function () {
    return readCancellations_(spreadsheet);
  });
  var cancelled = diagnosticMeasure_(timings, 'processarCancelamentosMs', function () {
    return cancellationSet_(cancellations);
  });
  var context = {
    configuration: configuration,
    laboratory: laboratory,
    reservations: reservations,
    cancelled: cancelled,
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
      cancellations: cancellations.length,
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
