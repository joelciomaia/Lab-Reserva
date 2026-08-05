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
  var parameters = event && event.parameter ? event.parameter : {};

  if (parameters.transport === 'iframe') {
    return handleIframeTransport_(parameters);
  }

  return respondSafely_(function () {
    return dispatchWritePayload_(parseJsonPayload_(event && event.postData ? event.postData.contents : ''));
  });
}

function handleIframeTransport_(parameters) {
  var requestId = requiredText_(parameters.requestId, 'requestId', 200);
  var targetOrigin = allowedIframeOrigin_(requiredText_(parameters.origin, 'origin', 300));
  var envelope = executeSafely_(function () {
    var payload = parameters.payloadBase64
      ? parseBase64JsonPayload_(parameters.payloadBase64)
      : parseJsonPayload_(parameters.payload);
    return dispatchBridgePayload_(payload);
  });

  return iframeOutput_(envelope, requestId, targetOrigin);
}

function parseBase64JsonPayload_(contents) {
  var encoded = requiredText_(contents, 'payloadBase64', 100000);

  try {
    var normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
    while (normalized.length % 4) {
      normalized += '=';
    }
    var decoded = Utilities.newBlob(Utilities.base64Decode(normalized)).getDataAsString('UTF-8');
    return parseJsonPayload_(decoded);
  } catch (error) {
    if (isApiError_(error)) {
      throw error;
    }
    throwApiError_('BAD_REQUEST', 'O payload codificado não contém um JSON válido.');
  }
}

function parseJsonPayload_(contents) {
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

  return payload;
}

function dispatchWritePayload_(payload) {
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
}

function dispatchBridgePayload_(payload) {
  if (payload.action === 'serviceInfo') {
    return serviceInfo_();
  }

  if (payload.action === 'bootstrap') {
    return getBootstrapData_(
      requiredText_(payload.school, 'school', 128),
      optionalText_(payload.lab),
    );
  }

  if (payload.action === 'availability') {
    return getAvailability_(requiredText_(payload.school, 'school', 128), {
      laboratoryId: requiredText_(payload.laboratoryId, 'laboratoryId', 128),
      date: requiredText_(payload.date, 'date', 32),
    });
  }

  return dispatchWritePayload_(payload);
}

function allowedIframeOrigin_(origin) {
  var allowedOrigins = {
    'https://joelciomaia.github.io': true,
    'http://localhost:5173': true,
    'http://127.0.0.1:5173': true,
    'http://localhost:4173': true,
    'http://127.0.0.1:4173': true,
  };

  if (!allowedOrigins[origin]) {
    throwApiError_('BAD_REQUEST', 'A origem informada não está autorizada.');
  }

  return origin;
}

function iframeOutput_(envelope, requestId, targetOrigin) {
  var message = {
    source: 'lab-reserva-apps-script',
    requestId: requestId,
    envelope: envelope,
  };
  var serializedMessage = JSON.stringify(message)
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');
  var serializedOrigin = JSON.stringify(targetOrigin);
  var html =
    '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
    '<script>(function(){var message=' +
    serializedMessage +
    ';var targetOrigin=' +
    serializedOrigin +
    ';function send(){window.top.postMessage(message,targetOrigin);}send();setTimeout(send,100);setTimeout(send,500);})();<\/script></body></html>';

  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(
    HtmlService.XFrameOptionsMode.ALLOWALL,
  );
}

function executeSafely_(operation) {
  try {
    return { ok: true, data: operation() };
  } catch (error) {
    if (isApiError_(error)) {
      var publicError = {
        code: error.apiCode,
        message: error.message,
      };
      if (error.apiDetails !== undefined) {
        publicError.details = error.apiDetails;
      }
      return { ok: false, error: publicError };
    }

    console.error(error && error.stack ? error.stack : error);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'O serviço não conseguiu concluir a operação.',
      },
    };
  }
}

function respondSafely_(operation) {
  return jsonOutput_(executeSafely_(operation));
}

function jsonOutput_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
