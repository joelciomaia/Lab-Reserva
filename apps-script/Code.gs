/**
 * Public Google Apps Script Web App entry points.
 *
 * Successful responses use { ok: true, data } and failures use
 * { ok: false, error: { code, message, details? } }.
 */

function doGet(event) {
  return respondSafely_(function () {
    var parameters = event && event.parameter ? event.parameter : {};
    var action = requiredQueryParameter_(parameters, 'action');

    if (action === 'serviceInfo') {
      return serviceInfo_();
    }

    if (action === 'bootstrap') {
      return getBootstrapData_(
        requiredQueryParameter_(parameters, 'school'),
        optionalText_(parameters.lab),
      );
    }

    if (action === 'availability') {
      return getAvailability_(requiredQueryParameter_(parameters, 'school'), {
        laboratoryId: requiredQueryParameter_(parameters, 'laboratoryId'),
        date: requiredQueryParameter_(parameters, 'date'),
      });
    }

    throwApiError_('UNKNOWN_ACTION', 'A ação GET informada não existe.');
  });
}

function doPost(event) {
  return respondSafely_(function () {
    var contents = event && event.postData ? event.postData.contents : '';
    if (!contents) {
      throwApiError_('BAD_REQUEST', 'Envie um corpo JSON no pedido.');
    }
    if (contents.length > 65536) {
      throwApiError_('PAYLOAD_TOO_LARGE', 'O corpo do pedido ultrapassa o limite permitido.');
    }

    var payload;
    try {
      payload = JSON.parse(contents);
    } catch (error) {
      throwApiError_('BAD_REQUEST', 'O corpo do pedido não contém um JSON válido.');
    }

    if (!isPlainObject_(payload)) {
      throwApiError_('BAD_REQUEST', 'O corpo do pedido deve ser um objeto JSON.');
    }
    if (payload.action === 'registerSchool') {
      if (!isPlainObject_(payload.request)) {
        throwApiError_('BAD_REQUEST', 'Informe os dados da escola em request.');
      }
      return registerSchool_(payload.request);
    }

    if (payload.action === 'createReservation') {
      if (!isPlainObject_(payload.request)) {
        throwApiError_('BAD_REQUEST', 'Informe a reserva em request.');
      }
      return createReservation_(requiredText_(payload.school, 'school', 128), payload.request);
    }

    throwApiError_('UNKNOWN_ACTION', 'A ação POST informada não existe.');
  });
}

function doOptions() {
  return jsonOutput_({ ok: true, data: null });
}

function respondSafely_(operation) {
  try {
    return jsonOutput_({ ok: true, data: operation() });
  } catch (error) {
    if (isApiError_(error)) {
      var publicError = {
        code: error.apiCode,
        message: error.message,
      };
      if (error.apiDetails !== undefined) {
        publicError.details = error.apiDetails;
      }
      return jsonOutput_({ ok: false, error: publicError });
    }

    console.error(error && error.stack ? error.stack : error);
    return jsonOutput_({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'O serviço não conseguiu concluir a operação.',
      },
    });
  }
}

function jsonOutput_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    .setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
