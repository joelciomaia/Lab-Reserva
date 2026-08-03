var GOOGLE_CHAT_SERVICE_ACCOUNT_PROPERTY_ = 'GOOGLE_CHAT_SERVICE_ACCOUNT_JSON';
var GOOGLE_CHAT_BOT_SCOPE_ = 'https://www.googleapis.com/auth/chat.bot';
var GOOGLE_CHAT_TOKEN_URL_ = 'https://oauth2.googleapis.com/token';
var GOOGLE_CHAT_API_URL_ = 'https://chat.googleapis.com/v1/';
var GOOGLE_CHAT_TOKEN_CACHE_PREFIX_ = 'LAB_RESERVA_CHAT_TOKEN_V1::';
var GOOGLE_CHAT_PRIVATE_SPACE_CACHE_PREFIX_ = 'LAB_RESERVA_PRIVATE_CHAT_V1::';

function googleChatServiceAccountCredentials_() {
  var rawCredentials = optionalText_(
    PropertiesService.getScriptProperties().getProperty(GOOGLE_CHAT_SERVICE_ACCOUNT_PROPERTY_),
  );
  if (!rawCredentials) return null;

  var parsed;
  try {
    parsed = JSON.parse(rawCredentials);
  } catch (error) {
    throw new Error(
      'A Script Property GOOGLE_CHAT_SERVICE_ACCOUNT_JSON não contém um JSON válido.',
    );
  }

  if (!isPlainObject_(parsed)) {
    throw new Error(
      'A Script Property GOOGLE_CHAT_SERVICE_ACCOUNT_JSON deve conter um objeto JSON.',
    );
  }

  var clientEmail = optionalText_(parsed.client_email);
  var privateKey = optionalText_(parsed.private_key).replace(/\\n/g, '\n');
  var privateKeyId = optionalText_(parsed.private_key_id);
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail) ||
    privateKey.indexOf('-----BEGIN PRIVATE KEY-----') !== 0 ||
    privateKey.indexOf('-----END PRIVATE KEY-----') < 0
  ) {
    throw new Error(
      'A Script Property GOOGLE_CHAT_SERVICE_ACCOUNT_JSON não possui uma service account válida.',
    );
  }

  return {
    clientEmail: clientEmail,
    privateKey: privateKey,
    privateKeyId: privateKeyId,
  };
}

function googleChatConfigured_() {
  try {
    return Boolean(googleChatServiceAccountCredentials_());
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return false;
  }
}

function base64UrlEncode_(value) {
  return Utilities.base64EncodeWebSafe(value).replace(/=+$/g, '');
}

function googleChatTokenCacheKey_(credentials) {
  var identity = credentials.clientEmail + ':' + credentials.privateKeyId;
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    identity,
    Utilities.Charset.UTF_8,
  );
  return (
    GOOGLE_CHAT_TOKEN_CACHE_PREFIX_ +
    Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '').slice(0, 32)
  );
}

function readCachedGoogleChatToken_(cacheKey) {
  try {
    return optionalText_(CacheService.getScriptCache().get(cacheKey));
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return '';
  }
}

function removeCachedGoogleChatToken_(cacheKey) {
  try {
    CacheService.getScriptCache().remove(cacheKey);
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
  }
}

function cacheGoogleChatToken_(cacheKey, accessToken, expiresInSeconds) {
  try {
    var cacheDuration = Math.max(1, Math.min(expiresInSeconds - 60, 3300));
    CacheService.getScriptCache().put(cacheKey, accessToken, cacheDuration);
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
  }
}

function createGoogleChatJwt_(credentials) {
  var now = Math.floor(Date.now() / 1000);
  var tokenHeader = { alg: 'RS256', typ: 'JWT' };
  if (credentials.privateKeyId) {
    tokenHeader.kid = credentials.privateKeyId;
  }
  var header = base64UrlEncode_(JSON.stringify(tokenHeader));
  var claims = base64UrlEncode_(
    JSON.stringify({
      iss: credentials.clientEmail,
      scope: GOOGLE_CHAT_BOT_SCOPE_,
      aud: GOOGLE_CHAT_TOKEN_URL_,
      iat: now - 30,
      exp: now + 3300,
    }),
  );
  var unsignedToken = header + '.' + claims;
  var signature = Utilities.computeRsaSha256Signature(unsignedToken, credentials.privateKey);
  return unsignedToken + '.' + Utilities.base64EncodeWebSafe(signature).replace(/=+$/g, '');
}

function requestGoogleChatAccessToken_(credentials) {
  var response = UrlFetchApp.fetch(GOOGLE_CHAT_TOKEN_URL_, {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: createGoogleChatJwt_(credentials),
    },
    muteHttpExceptions: true,
  });
  var responseCode = response.getResponseCode();
  var payload;
  try {
    payload = JSON.parse(response.getContentText());
  } catch (error) {
    payload = null;
  }

  var accessToken = payload && optionalText_(payload.access_token);
  if (responseCode < 200 || responseCode >= 300 || !accessToken) {
    throw new Error(
      'Não foi possível autenticar o aplicativo no Google Chat (HTTP ' + responseCode + ').',
    );
  }

  var expiresInSeconds = Number(payload.expires_in);
  return {
    accessToken: accessToken,
    expiresInSeconds:
      Number.isFinite(expiresInSeconds) && expiresInSeconds > 60 ? expiresInSeconds : 3600,
  };
}

function googleChatAccessToken_(credentials, forceRefresh) {
  var cacheKey = googleChatTokenCacheKey_(credentials);
  if (forceRefresh) {
    removeCachedGoogleChatToken_(cacheKey);
  } else {
    var cachedToken = readCachedGoogleChatToken_(cacheKey);
    if (cachedToken) return cachedToken;
  }

  var token = requestGoogleChatAccessToken_(credentials);
  cacheGoogleChatToken_(cacheKey, token.accessToken, token.expiresInSeconds);
  return token.accessToken;
}

function normalizedGoogleChatSpace_(value) {
  var spaceName = optionalText_(value);
  return /^spaces\/[A-Za-z0-9_-]+$/.test(spaceName) ? spaceName : '';
}

function googleChatPrivateSpaceCacheKey_(spaceName) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    spaceName,
    Utilities.Charset.UTF_8,
  );
  return (
    GOOGLE_CHAT_PRIVATE_SPACE_CACHE_PREFIX_ +
    Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '').slice(0, 32)
  );
}

function assertPrivateGoogleChatSpace_(credentials, spaceName) {
  var cacheKey = googleChatPrivateSpaceCacheKey_(spaceName);
  try {
    if (CacheService.getScriptCache().get(cacheKey) === 'true') return;
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
  }

  function read_(forceRefresh) {
    return UrlFetchApp.fetch(GOOGLE_CHAT_API_URL_ + spaceName, {
      method: 'get',
      headers: {
        Authorization: 'Bearer ' + googleChatAccessToken_(credentials, forceRefresh),
      },
      muteHttpExceptions: true,
    });
  }

  var response = read_(false);
  if (response.getResponseCode() === 401) {
    response = read_(true);
  }
  var responseCode = response.getResponseCode();
  var payload;
  try {
    payload = JSON.parse(response.getContentText());
  } catch (error) {
    payload = null;
  }
  if (
    responseCode < 200 ||
    responseCode >= 300 ||
    !payload ||
    payload.name !== spaceName ||
    payload.spaceType !== 'DIRECT_MESSAGE' ||
    payload.singleUserBotDm !== true
  ) {
    throw new Error(
      'A conversa configurada não é uma mensagem direta privada entre o usuário e o Chat app.',
    );
  }

  try {
    CacheService.getScriptCache().put(cacheKey, 'true', 21600);
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
  }
}

function postGoogleChatMessage_(spaceName, text, requestId) {
  var credentials = googleChatServiceAccountCredentials_();
  if (!credentials) {
    throw new Error('A integração com o Google Chat ainda não foi configurada no backend.');
  }

  assertPrivateGoogleChatSpace_(credentials, spaceName);

  var endpoint =
    GOOGLE_CHAT_API_URL_ + spaceName + '/messages?requestId=' + encodeURIComponent(requestId);

  function send_(forceRefresh) {
    return UrlFetchApp.fetch(endpoint, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + googleChatAccessToken_(credentials, forceRefresh),
      },
      payload: JSON.stringify({ text: text }),
      muteHttpExceptions: true,
    });
  }

  var response = send_(false);
  if (response.getResponseCode() === 401) {
    response = send_(true);
  }
  var responseCode = response.getResponseCode();
  if (responseCode < 200 || responseCode >= 300) {
    throw new Error('O Google Chat recusou a notificação da reserva (HTTP ' + responseCode + ').');
  }
}

function formatReservationDateForChat_(isoDate) {
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(optionalText_(isoDate));
  return match ? match[3] + '/' + match[2] + '/' + match[1] : optionalText_(isoDate);
}

function reservationPeriodsForChat_(reservation) {
  var periods = [];
  for (var index = 0; index < reservation.periodIds.length; index += 1) {
    var label = optionalText_(reservation.periodLabels[index]) || reservation.periodIds[index];
    var time = optionalText_(reservation.periodTimes[index]);
    periods.push(time ? label + ' (' + time + ')' : label);
  }
  return periods.join(', ');
}

function newReservationChatMessage_(notification) {
  var reservation = notification.reservation;
  return [
    '*Nova reserva de laboratório*',
    'Escola: ' + notification.schoolName,
    'Laboratório: ' + reservation.laboratoryName,
    'Data: ' + formatReservationDateForChat_(reservation.date),
    'Aulas: ' + reservationPeriodsForChat_(reservation),
    'Professor(a): ' + reservation.teacherName,
    'Disciplina: ' + reservation.subject,
    'Turma: ' + reservation.classGroup,
  ].join('\n');
}

function notifyNewReservationBestEffort_(notification) {
  try {
    var laboratory = notification.laboratory;
    if (!laboratory || !laboratory.notifyOnNewBooking || !laboratory.googleChatEnabled) {
      return;
    }

    var spaceName = normalizedGoogleChatSpace_(laboratory.googleChatSpaceName);
    if (!spaceName) {
      throw new Error(
        'O laboratório ativou o Google Chat, mas não possui uma conversa privada válida.',
      );
    }

    postGoogleChatMessage_(
      spaceName,
      newReservationChatMessage_(notification),
      notification.reservation.id,
    );
  } catch (error) {
    console.error(
      'A reserva foi salva, mas a notificação do Google Chat falhou: ' +
        (error && error.stack ? error.stack : error),
    );
  }
}
