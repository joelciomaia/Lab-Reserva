var CONFIGURATION_SHEET_NAMES_ = [
  'CONFIGURACOES',
  'LABORATORIOS',
  'TURNOS',
  'DISCIPLINAS',
  'TURMAS',
  'RECURSOS',
];

var RESERVATIONS_SHEET_NAME_ = 'RESERVAS';
var RESERVATIONS_HEADER_ = [
  'ID',
  'DATA',
  'LABORATORIO_ID',
  'LABORATORIO_NOME',
  'PROFESSOR',
  'DISCIPLINA',
  'TURMA',
  'AULAS_IDS',
  'AULAS_NOMES',
  'OBJETOS_CONHECIMENTO',
  'ITENS_UTILIZADOS',
  'OBSERVACOES',
  'CRIADO_EM',
  'AULAS_HORARIOS',
  'STATUS',
  'AULAS_CANCELADAS_IDS',
  'CANCELADO_EM',
  'CANCELADO_POR',
  'MOTIVO_CANCELAMENTO',
];

var CANCELLATIONS_SHEET_NAME_ = 'CANCELAMENTOS';
var CANCELLATIONS_HEADER_ = [
  'ID',
  'RESERVA_ID',
  'AULA_ID',
  'AULA_NOME',
  'AULA_HORARIO',
  'DATA',
  'LABORATORIO_ID',
  'CANCELADO_EM',
  'CANCELADO_POR',
  'MOTIVO',
];

var RESERVATION_STATUS_ = {
  CONFIRMED: 'CONFIRMED',
  PARTIALLY_CANCELLED: 'PARTIALLY_CANCELLED',
  CANCELLED: 'CANCELLED',
};

var SCHOOL_TO_SPREADSHEET_PROPERTY_PREFIX_ = 'LAB_RESERVA_SCHOOL_TO_SPREADSHEET::';
var SPREADSHEET_TO_SCHOOL_PROPERTY_PREFIX_ = 'LAB_RESERVA_SPREADSHEET_TO_SCHOOL::';
var BACKEND_ACCOUNT_EMAIL_PROPERTY_ = 'BACKEND_ACCOUNT_EMAIL';

function throwApiError_(code, message, details) {
  var error = new Error(message);
  error.name = 'ApiError';
  error.apiCode = code;
  if (details !== undefined) {
    error.apiDetails = details;
  }
  throw error;
}

function isApiError_(error) {
  return Boolean(error && error.name === 'ApiError' && error.apiCode);
}

function isPlainObject_(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function requiredQueryParameter_(parameters, name) {
  var value = optionalText_(parameters[name]);
  if (!value) {
    throwApiError_('BAD_REQUEST', 'O parâmetro ' + name + ' é obrigatório.', { field: name });
  }
  return value;
}

function optionalText_(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

function requiredText_(value, field, maximumLength) {
  if (typeof value !== 'string') {
    throwApiError_('VALIDATION_ERROR', 'O campo ' + field + ' deve conter texto.', {
      field: field,
    });
  }
  var text = optionalText_(value);
  if (!text) {
    throwApiError_('VALIDATION_ERROR', 'Preencha o campo ' + field + '.', { field: field });
  }
  if (text.length > maximumLength) {
    throwApiError_(
      'VALIDATION_ERROR',
      'O campo ' + field + ' ultrapassa ' + maximumLength + ' caracteres.',
      { field: field, maximumLength: maximumLength },
    );
  }
  return text;
}

function boundedOptionalText_(value, field, maximumLength) {
  if (value !== null && value !== undefined && typeof value !== 'string') {
    throwApiError_('VALIDATION_ERROR', 'O campo ' + field + ' deve conter texto.', {
      field: field,
    });
  }
  var text = optionalText_(value);
  if (text.length > maximumLength) {
    throwApiError_(
      'VALIDATION_ERROR',
      'O campo ' + field + ' ultrapassa ' + maximumLength + ' caracteres.',
      { field: field, maximumLength: maximumLength },
    );
  }
  return text;
}

function normalizeHeader_(value) {
  return optionalText_(value).toUpperCase();
}

function isBlankCell_(value) {
  return value === null || value === undefined || optionalText_(value) === '';
}

function rowIsBlank_(row) {
  for (var index = 0; index < row.length; index += 1) {
    if (!isBlankCell_(row[index])) {
      return false;
    }
  }
  return true;
}

function schoolId_(value, field, errorCode) {
  if (typeof value !== 'string') {
    throwApiError_(
      errorCode || 'VALIDATION_ERROR',
      'O identificador público da escola é inválido.',
      {
        field: field || 'school',
      },
    );
  }
  var normalized = optionalText_(value);
  if (!normalized || normalized.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(normalized)) {
    throwApiError_(
      errorCode || 'VALIDATION_ERROR',
      'O identificador público da escola é inválido.',
      {
        field: field || 'school',
      },
    );
  }
  return normalized;
}

function spreadsheetId_(value) {
  if (typeof value !== 'string') {
    throwApiError_('VALIDATION_ERROR', 'O identificador da planilha é inválido.', {
      field: 'spreadsheetId',
    });
  }
  var normalized = optionalText_(value);
  if (!normalized || normalized.length > 256 || !/^[A-Za-z0-9_-]+$/.test(normalized)) {
    throwApiError_('VALIDATION_ERROR', 'O identificador da planilha é inválido.', {
      field: 'spreadsheetId',
    });
  }
  return normalized;
}

function schoolRegistryPropertyKey_(schoolId) {
  return SCHOOL_TO_SPREADSHEET_PROPERTY_PREFIX_ + schoolId;
}

function spreadsheetRegistryPropertyKey_(spreadsheetId) {
  return SPREADSHEET_TO_SCHOOL_PROPERTY_PREFIX_ + spreadsheetId;
}

function configurationIdentity_(spreadsheet) {
  var settingsTable = readTable_(spreadsheet, 'CONFIGURACOES', ['CHAVE', 'VALOR']);
  var settings = settingsMap_(settingsTable);
  return {
    schoolId: schoolId_(settings.ID_ESCOLA, 'ID_ESCOLA', 'DATA_INTEGRITY_ERROR'),
    revision: requiredText_(cellText_(settings.REVISAO), 'REVISAO', 256),
  };
}

function assertSpreadsheetSchool_(spreadsheet, expectedSchoolId) {
  var identity = configurationIdentity_(spreadsheet);
  if (identity.schoolId !== expectedSchoolId) {
    throwApiError_(
      'SPREADSHEET_UNAVAILABLE',
      'O espaço da escola não está disponível ou perdeu o vínculo publicado.',
    );
  }
  return identity;
}

function openRegisteredSpreadsheet_(spreadsheetId) {
  try {
    return SpreadsheetApp.openById(spreadsheetId);
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    throwApiError_('SPREADSHEET_UNAVAILABLE', 'O espaço da escola não está disponível no momento.');
  }
}

function registeredSpreadsheetForSchool_(school) {
  var normalizedSchoolId = schoolId_(school, 'school', 'VALIDATION_ERROR');
  var properties = PropertiesService.getScriptProperties();
  var spreadsheetId = optionalText_(
    properties.getProperty(schoolRegistryPropertyKey_(normalizedSchoolId)),
  );
  if (!spreadsheetId || spreadsheetId.length > 256 || !/^[A-Za-z0-9_-]+$/.test(spreadsheetId)) {
    throwApiError_(
      'SPREADSHEET_UNAVAILABLE',
      'O espaço da escola não foi encontrado ou ainda não foi publicado.',
    );
  }

  var reverseSchoolId = optionalText_(
    properties.getProperty(spreadsheetRegistryPropertyKey_(spreadsheetId)),
  );
  if (reverseSchoolId !== normalizedSchoolId) {
    throwApiError_(
      'SPREADSHEET_UNAVAILABLE',
      'O espaço da escola não está disponível ou perdeu o vínculo publicado.',
    );
  }

  return {
    schoolId: normalizedSchoolId,
    spreadsheet: openRegisteredSpreadsheet_(spreadsheetId),
  };
}

function spreadsheetForSchoolPublicRead_(school) {
  return registeredSpreadsheetForSchool_(school).spreadsheet;
}

function spreadsheetForSchool_(school) {
  var registered = registeredSpreadsheetForSchool_(school);
  assertSpreadsheetSchool_(registered.spreadsheet, registered.schoolId);
  return registered.spreadsheet;
}

function backendAccountEmail_() {
  var properties = PropertiesService.getScriptProperties();
  var configuredEmail = optionalText_(properties.getProperty(BACKEND_ACCOUNT_EMAIL_PROPERTY_));
  var effectiveEmail = '';
  try {
    effectiveEmail = optionalText_(Session.getEffectiveUser().getEmail());
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
  }

  if (
    configuredEmail &&
    effectiveEmail &&
    configuredEmail.toLowerCase() !== effectiveEmail.toLowerCase()
  ) {
    throwApiError_(
      'CONFIGURATION_ERROR',
      'A conta configurada para o backend não corresponde à conta efetiva da implantação.',
    );
  }

  var email = effectiveEmail || configuredEmail;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throwApiError_(
      'CONFIGURATION_ERROR',
      'Não foi possível identificar a conta que recebe acesso às planilhas.',
    );
  }
  return email.toLowerCase();
}

function serviceInfo_() {
  return {
    backendAccountEmail: backendAccountEmail_(),
    googleChatConfigured: googleChatConfigured_(),
  };
}

function assertBackendWriterAccess_(spreadsheetId) {
  try {
    var file = DriveApp.getFileById(spreadsheetId);
    var access = file.getAccess(backendAccountEmail_());
    if (access === DriveApp.Permission.EDIT || access === DriveApp.Permission.OWNER) {
      return;
    }
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
  }
  throwApiError_(
    'SPREADSHEET_UNAVAILABLE',
    'Não foi possível confirmar o acesso de edição à planilha. Tente publicar novamente.',
  );
}

function registerSchool_(rawRequest) {
  var request = isPlainObject_(rawRequest) ? rawRequest : {};
  var requestedSpreadsheetId = spreadsheetId_(request.spreadsheetId);
  var requestedSchoolId = schoolId_(request.schoolId, 'schoolId', 'VALIDATION_ERROR');
  var requestedRevision = requiredText_(request.revision, 'revision', 256);

  return withScriptLock_(function () {
    assertBackendWriterAccess_(requestedSpreadsheetId);
    var spreadsheet;
    try {
      spreadsheet = SpreadsheetApp.openById(requestedSpreadsheetId);
    } catch (error) {
      console.error(error && error.stack ? error.stack : error);
      throwApiError_(
        'SPREADSHEET_UNAVAILABLE',
        'Não foi possível concluir o vínculo automático com a planilha. Tente novamente.',
      );
    }

    var identity = configurationIdentity_(spreadsheet);
    if (identity.schoolId !== requestedSchoolId || identity.revision !== requestedRevision) {
      throwApiError_(
        'CONFIGURATION_CONFLICT',
        'A planilha publicada não corresponde à escola ou à revisão informada.',
      );
    }

    var properties = PropertiesService.getScriptProperties();
    var schoolKey = schoolRegistryPropertyKey_(requestedSchoolId);
    var spreadsheetKey = spreadsheetRegistryPropertyKey_(requestedSpreadsheetId);
    var mappedSpreadsheetId = optionalText_(properties.getProperty(schoolKey));
    var mappedSchoolId = optionalText_(properties.getProperty(spreadsheetKey));
    if (
      (mappedSpreadsheetId && mappedSpreadsheetId !== requestedSpreadsheetId) ||
      (mappedSchoolId && mappedSchoolId !== requestedSchoolId)
    ) {
      throwApiError_(
        'CONFIGURATION_CONFLICT',
        'Esta escola ou planilha já possui outro vínculo e não pode ser substituída.',
      );
    }

    var updates = {};
    if (!mappedSpreadsheetId) updates[schoolKey] = requestedSpreadsheetId;
    if (!mappedSchoolId) updates[spreadsheetKey] = requestedSchoolId;
    if (Object.keys(updates).length > 0) {
      properties.setProperties(updates, false);
    }

    return {
      schoolId: requestedSchoolId,
      sourceSpreadsheetFingerprint: spreadsheetBindingFingerprint_(spreadsheet),
    };
  }, 'O serviço está concluindo outra publicação. Tente novamente em instantes.');
}

function withScriptLock_(operation, busyMessage) {
  var lock = LockService.getScriptLock();
  var acquired = false;
  try {
    acquired = lock.tryLock(30000);
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
  }
  if (!acquired) {
    throwApiError_(
      'LOCK_TIMEOUT',
      busyMessage || 'O serviço está processando outra operação. Tente novamente em instantes.',
    );
  }

  try {
    return operation();
  } finally {
    lock.releaseLock();
  }
}

function ensureOperationalSheets_(spreadsheet) {
  return withScriptLock_(function () {
    ensureOperationalSheetsUnlocked_(spreadsheet);
  });
}

function ensureOperationalSheetsUnlocked_(spreadsheet) {
  ensureAppendOnlySheet_(spreadsheet, RESERVATIONS_SHEET_NAME_, RESERVATIONS_HEADER_, 13);
  ensureAppendOnlySheet_(spreadsheet, CANCELLATIONS_SHEET_NAME_, CANCELLATIONS_HEADER_, 0);
}

function ensureAppendOnlySheet_(spreadsheet, title, expectedHeader, legacyPrefixLength) {
  var sheet = spreadsheet.getSheetByName(title);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(title);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, expectedHeader.length).setValues([expectedHeader]);
    return sheet;
  }

  var headerWidth = Math.max(sheet.getLastColumn(), expectedHeader.length);
  var actualHeader = sheet.getRange(1, 1, 1, headerWidth).getValues()[0];
  if (rowIsBlank_(actualHeader)) {
    sheet.getRange(1, 1, 1, expectedHeader.length).setValues([expectedHeader]);
    return sheet;
  }

  var requiredLength = legacyPrefixLength || expectedHeader.length;
  for (var index = 0; index < requiredLength; index += 1) {
    if (normalizeHeader_(actualHeader[index]) !== expectedHeader[index]) {
      throwApiError_(
        'DATA_INTEGRITY_ERROR',
        'O cabeçalho da aba ' + title + ' não corresponde ao formato esperado.',
        { sheet: title, column: index + 1, expected: expectedHeader[index] },
      );
    }
  }

  for (var extraIndex = requiredLength; extraIndex < expectedHeader.length; extraIndex += 1) {
    var actual = normalizeHeader_(actualHeader[extraIndex]);
    if (actual && actual !== expectedHeader[extraIndex]) {
      throwApiError_(
        'DATA_INTEGRITY_ERROR',
        'A coluna reservada para ' +
          expectedHeader[extraIndex] +
          ' já está ocupada na aba ' +
          title +
          '.',
        { sheet: title, column: extraIndex + 1, expected: expectedHeader[extraIndex] },
      );
    }
    if (!actual) {
      sheet.getRange(1, extraIndex + 1).setValue(expectedHeader[extraIndex]);
    }
  }

  return sheet;
}

function readTable_(spreadsheet, title, requiredHeaders) {
  var sheet = spreadsheet.getSheetByName(title);
  if (!sheet) {
    throwApiError_('CONFIGURATION_ERROR', 'A aba ' + title + ' não existe na planilha.', {
      sheet: title,
    });
  }

  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (lastRow < 1 || lastColumn < 1) {
    throwApiError_('CONFIGURATION_ERROR', 'A aba ' + title + ' não possui cabeçalho.', {
      sheet: title,
    });
  }

  var values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  var header = values[0];
  var indexes = Object.create(null);
  for (var columnIndex = 0; columnIndex < header.length; columnIndex += 1) {
    var normalized = normalizeHeader_(header[columnIndex]);
    if (!normalized) {
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(indexes, normalized)) {
      throwApiError_(
        'DATA_INTEGRITY_ERROR',
        'A aba ' + title + ' possui um cabeçalho repetido: ' + normalized + '.',
        { sheet: title, header: normalized },
      );
    }
    indexes[normalized] = columnIndex;
  }

  var headers = requiredHeaders || [];
  for (var requiredIndex = 0; requiredIndex < headers.length; requiredIndex += 1) {
    if (!Object.prototype.hasOwnProperty.call(indexes, headers[requiredIndex])) {
      throwApiError_(
        'CONFIGURATION_ERROR',
        'A aba ' + title + ' não possui a coluna ' + headers[requiredIndex] + '.',
        { sheet: title, header: headers[requiredIndex] },
      );
    }
  }

  return {
    sheet: sheet,
    title: title,
    indexes: indexes,
    rows: values.slice(1),
    rawValues: values,
  };
}

function tableCell_(table, row, header) {
  var index = table.indexes[header];
  return index === undefined ? '' : row[index];
}

function cellText_(value) {
  var text = optionalText_(value);
  if (/^'[=+\-@]/.test(text)) {
    return text.slice(1);
  }
  return text;
}

function booleanCell_(value, location, blankValue) {
  if (isBlankCell_(value)) {
    return Boolean(blankValue);
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  var normalized = optionalText_(value)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (['TRUE', 'VERDADEIRO', 'SIM', 'YES', '1'].indexOf(normalized) >= 0) {
    return true;
  }
  if (['FALSE', 'FALSO', 'NAO', 'NO', '0'].indexOf(normalized) >= 0) {
    return false;
  }

  throwApiError_('CONFIGURATION_ERROR', location + ' deve conter verdadeiro ou falso.', {
    location: location,
  });
}

function integerCell_(value, location, options) {
  var settings = options || {};
  if (isBlankCell_(value)) {
    if (settings.optional) return null;
    throwApiError_('CONFIGURATION_ERROR', location + ' deve conter um número inteiro.', {
      location: location,
    });
  }
  var parsed = typeof value === 'number' ? value : Number(optionalText_(value).replace(',', '.'));
  if (!Number.isInteger(parsed)) {
    throwApiError_('CONFIGURATION_ERROR', location + ' deve conter um número inteiro.', {
      location: location,
    });
  }
  if (settings.minimum !== undefined && parsed < settings.minimum) {
    throwApiError_('CONFIGURATION_ERROR', location + ' está abaixo do mínimo permitido.', {
      location: location,
      minimum: settings.minimum,
    });
  }
  if (settings.maximum !== undefined && parsed > settings.maximum) {
    throwApiError_('CONFIGURATION_ERROR', location + ' ultrapassa o máximo permitido.', {
      location: location,
      maximum: settings.maximum,
    });
  }
  return parsed;
}

function parseClock_(value, location) {
  var text;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    text = Utilities.formatDate(value, Session.getScriptTimeZone(), 'HH:mm');
  } else {
    text = optionalText_(value);
  }
  var match = /^(\d{2}):(\d{2})$/.exec(text);
  if (!match) {
    throwApiError_('CONFIGURATION_ERROR', location + ' deve usar o formato HH:mm.', {
      location: location,
    });
  }
  var hours = Number(match[1]);
  var minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    throwApiError_('CONFIGURATION_ERROR', location + ' contém um horário inválido.', {
      location: location,
    });
  }
  return hours * 60 + minutes;
}

function formatClock_(minutes) {
  var hours = Math.floor(minutes / 60);
  var remainder = minutes % 60;
  return String(hours).padStart(2, '0') + ':' + String(remainder).padStart(2, '0');
}

function assertIsoDate_(value) {
  if (typeof value !== 'string') {
    throwApiError_('VALIDATION_ERROR', 'Informe uma data válida no formato AAAA-MM-DD.', {
      field: 'date',
    });
  }
  var date = optionalText_(value);
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throwApiError_('VALIDATION_ERROR', 'Informe uma data válida no formato AAAA-MM-DD.', {
      field: 'date',
    });
  }
  var year = Number(match[1]);
  var month = Number(match[2]);
  var day = Number(match[3]);
  var parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throwApiError_('VALIDATION_ERROR', 'Informe uma data existente.', { field: 'date' });
  }
  return date;
}

function isoWeekday_(isoDate) {
  var parts = isoDate.split('-');
  var day = new Date(
    Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])),
  ).getUTCDay();
  return day === 0 ? 7 : day;
}

function sheetDateToIso_(value, spreadsheet, location) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
  // Datas da agenda representam somente o dia, não um instante.
  return Utilities.formatDate(value, 'UTC', 'yyyy-MM-dd');
}
  var text = optionalText_(value);
  var brazilian = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (brazilian) {
    text = brazilian[3] + '-' + brazilian[2] + '-' + brazilian[1];
  }
  try {
    return assertIsoDate_(text);
  } catch (error) {
    if (isApiError_(error)) {
      throwApiError_('DATA_INTEGRITY_ERROR', location + ' contém uma data inválida.', {
        location: location,
      });
    }
    throw error;
  }
}

function safeSheetText_(value) {
  var text = String(value === null || value === undefined ? '' : value);
  // Impede o Sheets de converter uma data ISO em objeto Date e deslocar o dia.
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return "'" + text;
  }
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function appendImmutableRow_(sheet, values) {
  var safeValues = [];
  for (var index = 0; index < values.length; index += 1) {
    safeValues.push(
      typeof values[index] === 'string' ? safeSheetText_(values[index]) : values[index],
    );
  }
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, safeValues.length).setValues([safeValues]);
}

function digest_(value) {
  return digestText_(JSON.stringify(value));
}

function digestText_(value) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value),
    Utilities.Charset.UTF_8,
  );
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function spreadsheetBindingFingerprint_(spreadsheet) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    'lab-reservas:spreadsheet:v1:' + spreadsheet.getId(),
    Utilities.Charset.UTF_8,
  );
  var hexadecimal = '';
  for (var index = 0; index < bytes.length; index += 1) {
    var unsignedByte = (bytes[index] + 256) % 256;
    hexadecimal += ('0' + unsignedByte.toString(16)).slice(-2);
  }
  return 'sha256-v1:' + hexadecimal;
}

function splitList_(value) {
  var text = cellText_(value);
  if (!text) return [];
  if (text.charAt(0) === '[') {
    try {
      var parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map(optionalText_).filter(Boolean);
      }
    } catch (error) {
      // Continue with the legacy delimiter parser.
    }
  }
  var separator =
    text.indexOf('|') >= 0
      ? /\s*\|\s*/
      : text.indexOf(';') >= 0
        ? /\s*;\s*/
        : /\r?\n/.test(text)
          ? /\s*\r?\n\s*/
          : /\s*,\s*/;
  return text.split(separator).map(optionalText_).filter(Boolean);
}

function serializeList_(values) {
  return values.join(' | ');
}

function uniqueStrings_(value, field, maximumItems) {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximumItems) {
    throwApiError_('VALIDATION_ERROR', 'Selecione pelo menos uma aula válida.', { field: field });
  }
  var result = [];
  var seen = Object.create(null);
  for (var index = 0; index < value.length; index += 1) {
    var item = requiredText_(value[index], field, 128);
    if (Object.prototype.hasOwnProperty.call(seen, item)) {
      throwApiError_('VALIDATION_ERROR', 'A mesma aula foi enviada mais de uma vez.', {
        field: field,
        value: item,
      });
    }
    seen[item] = true;
    result.push(item);
  }
  return result;
}
