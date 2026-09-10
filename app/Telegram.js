const TELEGRAM_CONFIG = Object.freeze({
  TOKEN_PROPERTY: 'TELEGRAM_BOT_TOKEN',
  CHAT_PROPERTY: 'TELEGRAM_CHAT_ID',
  OFFSET_PROPERTY: 'TELEGRAM_UPDATE_OFFSET',
  POLLING_FUNCTION: 'procesarActualizacionesTelegram',
  API_BASE: 'https://api.telegram.org/bot',
  RETRY_LIMIT: 10
});

/**
 * Envia al grupo el reporte recien guardado. Los errores se registran, pero nunca
 * invalidan el reporte creado desde la aplicacion web.
 */
function enviarNuevoReporteTelegram_(report) {
  let chatId = '';
  try {
    const credentials = obtenerCredencialesTelegram_();
    chatId = credentials.chatId;
    asegurarEstructuraTelegramSiFalta_();

    const response = llamarTelegram_('sendMessage', {
      chat_id: chatId,
      text: construirMensajeReporteTelegram_(report, []),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: construirBotonesReporteTelegram_(report.ID_REPORTE)
    }, credentials.token);

    agregarRegistroObjeto_('TELEGRAM_LOG', {
      ID_LOG: crearId_('TGL'),
      ID_REPORTE: report.ID_REPORTE,
      CHAT_ID: String(response.chat.id),
      MESSAGE_ID: response.message_id,
      TIPO_MENSAJE: 'REPORTE',
      ESTATUS: 'ACTIVO',
      INTENTOS: 1,
      ULTIMO_ERROR: '',
      ENVIADO_EN: new Date(),
      RESPONDIDO_EN: '',
      ACTUALIZADO_EN: new Date()
    });
  } catch (error) {
    registrarFalloTelegram_(report.ID_REPORTE, chatId, error);
    throw error;
  }
}

/**
 * Procesa botones y respuestas "Listo". Se ejecuta mediante un activador cada
 * minuto y usa un offset persistente para no repetir actualizaciones.
 */
function procesarActualizacionesTelegram() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    return { ok: false, motivo: 'Ya hay otra ejecucion procesando Telegram.' };
  }

  try {
    const credentials = obtenerCredencialesTelegram_();
    const properties = PropertiesService.getScriptProperties();
    const storedOffset = Number(properties.getProperty(
      TELEGRAM_CONFIG.OFFSET_PROPERTY
    ));
    const request = {
      limit: 100,
      timeout: 0,
      allowed_updates: ['callback_query', 'message']
    };
    if (storedOffset > 0) {
      request.offset = storedOffset;
    }

    const updates = llamarTelegram_('getUpdates', request, credentials.token);
    updates.forEach(function(update) {
      try {
        procesarActualizacionTelegram_(update, credentials);
      } catch (error) {
        console.error('No se pudo procesar la actualizacion ' +
          update.update_id + ': ' + obtenerMensajeErrorTelegram_(error));
        responderCallbackTelegramConError_(update, credentials.token);
      } finally {
        properties.setProperty(
          TELEGRAM_CONFIG.OFFSET_PROPERTY,
          String(update.update_id + 1)
        );
      }
    });

    reintentarCompactacionesTelegram_(credentials);
    return { ok: true, actualizaciones: updates.length };
  } finally {
    lock.releaseLock();
  }
}

function procesarActualizacionTelegram_(update, credentials) {
  if (update.callback_query) {
    procesarCallbackTelegram_(update.callback_query, credentials);
    return;
  }

  const message = update.message;
  if (!message || !message.text || !message.reply_to_message ||
      !/^listo[.!]*$/i.test(String(message.text).trim())) {
    return;
  }
  if (String(message.chat.id) !== credentials.chatId) {
    return;
  }

  const log = buscarLogTelegramPorMensaje_(
    message.chat.id,
    message.reply_to_message.message_id
  );
  if (!log) {
    return;
  }

  const resolution = resolverReporteDesdeTelegram_(
    log.ID_REPORTE,
    message.from,
    message.chat.id,
    message.reply_to_message.message_id,
    credentials.token
  );

  if (resolution.resuelto || resolution.yaResuelto) {
    intentarEliminarMensajeTelegram_(
      message.chat.id,
      message.message_id,
      credentials.token
    );
  }
}

function procesarCallbackTelegram_(callback, credentials) {
  const message = callback.message;
  const data = String(callback.data || '');
  const match = /^(participar|resolver):(.+)$/.exec(data);
  if (!message || !match || String(message.chat.id) !== credentials.chatId) {
    contestarCallbackTelegram_(
      callback.id,
      'Este boton no pertenece al grupo configurado.',
      credentials.token,
      true
    );
    return;
  }

  const action = match[1];
  const reportId = match[2];
  if (action === 'participar') {
    const participation = alternarParticipacionTelegram_(reportId, callback.from);
    if (participation.yaResuelto) {
      contestarCallbackTelegram_(
        callback.id,
        'Este reporte ya fue resuelto.',
        credentials.token,
        false
      );
      return;
    }

    actualizarMensajeActivoTelegram_(
      reportId,
      message.chat.id,
      message.message_id,
      credentials.token
    );
    contestarCallbackTelegram_(
      callback.id,
      participation.activo ?
        'Te agregaste como participante.' :
        'Ya no figuras como participante.',
      credentials.token,
      false
    );
    return;
  }

  const resolution = resolverReporteDesdeTelegram_(
    reportId,
    callback.from,
    message.chat.id,
    message.message_id,
    credentials.token
  );
  contestarCallbackTelegram_(
    callback.id,
    resolution.yaResuelto ?
      'Este reporte ya habia sido resuelto.' :
      'Reporte marcado como resuelto.',
    credentials.token,
    false
  );
}

function alternarParticipacionTelegram_(reportId, user) {
  const report = buscarReporteTelegram_(reportId);
  if (!report) {
    throw new Error('No se encontro el reporte asociado al mensaje.');
  }
  if (normalizarClave_(report.values.ESTATUS) === 'RESUELTO') {
    return { yaResuelto: true, activo: false };
  }

  const participant = obtenerIdentidadTelegram_(user);
  const sheet = obtenerHoja_('REPORTE_PARTICIPANTES');
  const table = leerTablaTelegram_(sheet);
  let existing = null;
  table.rows.some(function(row, index) {
    if (String(row.ID_REPORTE) === reportId &&
        String(row.TELEGRAM_USER_ID) === participant.id) {
      existing = { values: row, rowNumber: index + 2 };
      return true;
    }
    return false;
  });

  const now = new Date();
  let active = true;
  if (existing) {
    active = !esVerdaderoTelegram_(existing.values.ACTIVO);
    actualizarFilaTelegram_(sheet, table.headers, existing.rowNumber, {
      NOMBRE: participant.name,
      USUARIO: participant.username,
      ACTIVO: active,
      ACTUALIZADO_EN: now
    });
  } else {
    agregarRegistroObjeto_('REPORTE_PARTICIPANTES', {
      ID_PARTICIPACION: crearId_('PAR'),
      ID_REPORTE: reportId,
      TELEGRAM_USER_ID: participant.id,
      NOMBRE: participant.name,
      USUARIO: participant.username,
      ACTIVO: true,
      AGREGADO_EN: now,
      ACTUALIZADO_EN: now
    });
  }

  sincronizarEncargadosReporteTelegram_(reportId);
  SpreadsheetApp.flush();
  return { yaResuelto: false, activo: active };
}

function resolverReporteDesdeTelegram_(reportId, user, chatId, messageId, token) {
  let report = buscarReporteTelegram_(reportId);
  if (!report) {
    throw new Error('No se encontro el reporte asociado al mensaje.');
  }

  const participant = obtenerIdentidadTelegram_(user);
  if (normalizarClave_(report.values.ESTATUS) === 'RESUELTO') {
    intentarCompactarMensajeTelegram_(
      report,
      chatId,
      messageId,
      token,
      texto_(report.values.RESUELTO_POR) || participant.name
    );
    return { resuelto: false, yaResuelto: true };
  }

  asegurarParticipanteActivoTelegram_(reportId, participant);
  const participants = obtenerParticipantesTelegram_(reportId);
  const now = new Date();
  actualizarFilaTelegram_(
    report.sheet,
    report.headers,
    report.rowNumber,
    {
      ESTATUS: 'RESUELTO',
      PROGRESO: 100,
      ENCARGADO: participants.map(function(item) {
        return item.name;
      }).join(', '),
      RESUELTO_POR: participant.name,
      RESUELTO_EN: now,
      ACTUALIZADO_EN: now
    }
  );
  agregarRegistroObjeto_('HISTORIAL_REPORTES', {
    ID_HISTORIAL: crearId_('HIS'),
    ID_REPORTE: reportId,
    ACCION: 'RESOLUCION_TELEGRAM',
    ESTATUS_ANTERIOR: report.values.ESTATUS,
    ESTATUS_NUEVO: 'RESUELTO',
    COMENTARIO: construirComentarioResolucionTelegram_(participants),
    REALIZADO_POR: participant.name,
    FECHA_HORA: now
  });
  SpreadsheetApp.flush();

  report = buscarReporteTelegram_(reportId);
  intentarCompactarMensajeTelegram_(
    report,
    chatId,
    messageId,
    token,
    participant.name
  );
  return { resuelto: true, yaResuelto: false };
}

function actualizarMensajeActivoTelegram_(reportId, chatId, messageId, token) {
  const report = buscarReporteTelegram_(reportId);
  if (!report) {
    throw new Error('No se encontro el reporte asociado al mensaje.');
  }
  const participants = obtenerParticipantesTelegram_(reportId);
  llamarTelegram_('editMessageText', {
    chat_id: String(chatId),
    message_id: messageId,
    text: construirMensajeReporteTelegram_(report.values, participants),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: construirBotonesReporteTelegram_(reportId)
  }, token);
  actualizarLogTelegram_(chatId, messageId, {
    ESTATUS: 'ACTIVO',
    ULTIMO_ERROR: '',
    ACTUALIZADO_EN: new Date()
  });
}

function intentarCompactarMensajeTelegram_(report, chatId, messageId, token, resolverName) {
  const participants = obtenerParticipantesTelegram_(report.values.ID_REPORTE);
  const compactText = construirMensajeResueltoTelegram_(
    report.values,
    resolverName,
    participants
  );
  try {
    llamarTelegram_('editMessageText', {
      chat_id: String(chatId),
      message_id: messageId,
      text: compactText
    }, token);
    actualizarLogTelegram_(chatId, messageId, {
      ESTATUS: 'RESUELTO',
      ULTIMO_ERROR: '',
      RESPONDIDO_EN: new Date(),
      ACTUALIZADO_EN: new Date()
    });
  } catch (error) {
    if (obtenerMensajeErrorTelegram_(error).toLowerCase()
      .indexOf('message is not modified') !== -1) {
      actualizarLogTelegram_(chatId, messageId, {
        ESTATUS: 'RESUELTO',
        ULTIMO_ERROR: '',
        RESPONDIDO_EN: new Date(),
        ACTUALIZADO_EN: new Date()
      });
      return;
    }
    actualizarLogTelegram_(chatId, messageId, {
      ESTATUS: 'RESUELTO_PENDIENTE_COMPACTAR',
      ULTIMO_ERROR: obtenerMensajeErrorTelegram_(error),
      RESPONDIDO_EN: new Date(),
      ACTUALIZADO_EN: new Date()
    });
    throw error;
  }
}

function reintentarCompactacionesTelegram_(credentials) {
  const sheet = obtenerHoja_('TELEGRAM_LOG');
  const table = leerTablaTelegram_(sheet);
  let processed = 0;
  table.rows.forEach(function(row) {
    if (processed >= TELEGRAM_CONFIG.RETRY_LIMIT ||
        normalizarClave_(row.ESTATUS) !== 'RESUELTO_PENDIENTE_COMPACTAR') {
      return;
    }
    const report = buscarReporteTelegram_(String(row.ID_REPORTE));
    if (!report) {
      return;
    }
    processed += 1;
    try {
      intentarCompactarMensajeTelegram_(
        report,
        row.CHAT_ID,
        row.MESSAGE_ID,
        credentials.token,
        texto_(report.values.RESUELTO_POR)
      );
    } catch (error) {
      console.error('Compactacion pendiente para ' + row.ID_REPORTE + ': ' +
        obtenerMensajeErrorTelegram_(error));
    }
  });
}

function construirMensajeReporteTelegram_(report, participants) {
  const number = escaparHtmlTelegram_(report.NUMERO_REPORTE);
  const type = escaparHtmlTelegram_(report.TIPO_REPORTE);
  const priority = escaparHtmlTelegram_(report.PRIORIDAD);
  const equipment = escaparHtmlTelegram_(report.NOMBRE_EQUIPO || 'Sin equipo');
  const code = escaparHtmlTelegram_(report.CODIGO_EQUIPO || 'Sin codigo');
  const location = escaparHtmlTelegram_(report.UBICACION || 'Sin ubicacion');
  const area = escaparHtmlTelegram_(report.AREA || 'Sin area');
  const person = escaparHtmlTelegram_(report.PERSONA_REPORTA);
  const description = escaparHtmlTelegram_(report.DESCRIPCION);
  const stopped = normalizarClave_(report.EQUIPO_DETENIDO) === 'SI' ? 'Si' : 'No';
  const lines = [
    '<b>' + iconoPrioridadTelegram_(report.PRIORIDAD) + ' REPORTE #' + number +
      ' · ' + type + '</b>',
    '<b>Prioridad:</b> ' + priority,
    '<b>Equipo:</b> ' + equipment + ' · <code>' + code + '</code>',
    '<b>Ubicacion:</b> ' + location + ' · ' + area,
    '<b>Reporta:</b> ' + person,
    '<b>Equipo detenido:</b> ' + stopped,
    '<b>Falla:</b> ' + description
  ];

  if (texto_(report.EVIDENCIA_URL)) {
    lines.push('<a href="' + escaparHtmlTelegram_(report.EVIDENCIA_URL) +
      '">Ver evidencia</a>');
  }
  lines.push('');
  lines.push('<b>Participantes:</b> ' +
    escaparHtmlTelegram_(resumirParticipantesTelegram_(participants)));
  return lines.join('\n');
}

function construirMensajeResueltoTelegram_(report, resolverName, participants) {
  const resolverId = participants.reduce(function(found, participant) {
    return found || (participant.name === resolverName ? participant.id : '');
  }, '');
  const additional = participants.filter(function(participant) {
    return resolverId ? participant.id !== resolverId : participant.name !== resolverName;
  }).length;
  return '✅ Reporte #' + texto_(report.NUMERO_REPORTE) + ' completado por ' +
    texto_(resolverName) + (additional > 0 ? ' +' + additional : '');
}

function construirBotonesReporteTelegram_(reportId) {
  return {
    inline_keyboard: [[
      {
        text: '🙋 Participar',
        callback_data: 'participar:' + reportId
      },
      {
        text: '✅ Listo',
        callback_data: 'resolver:' + reportId
      }
    ]]
  };
}

function resumirParticipantesTelegram_(participants) {
  if (!participants.length) {
    return 'ninguno';
  }
  const visible = participants.slice(0, 3).map(function(participant) {
    return participant.name;
  });
  const remaining = participants.length - visible.length;
  return visible.join(', ') + (remaining > 0 ? ' +' + remaining : '');
}

function construirComentarioResolucionTelegram_(participants) {
  if (!participants.length) {
    return 'Reporte resuelto desde Telegram.';
  }
  return 'Reporte resuelto desde Telegram. Participantes: ' +
    participants.map(function(participant) {
      return participant.name;
    }).join(', ') + '.';
}

function iconoPrioridadTelegram_(priority) {
  return {
    BAJA: '🟢',
    MEDIA: '🟡',
    ALTA: '🟠',
    CRITICA: '🔴'
  }[normalizarClave_(priority)] || '🔵';
}

function obtenerParticipantesTelegram_(reportId) {
  const table = leerTablaTelegram_(obtenerHoja_('REPORTE_PARTICIPANTES'));
  return table.rows.filter(function(row) {
    return String(row.ID_REPORTE) === reportId &&
      esVerdaderoTelegram_(row.ACTIVO);
  }).map(function(row) {
    return {
      id: String(row.TELEGRAM_USER_ID),
      name: texto_(row.NOMBRE),
      username: texto_(row.USUARIO)
    };
  });
}

function asegurarParticipanteActivoTelegram_(reportId, participant) {
  const sheet = obtenerHoja_('REPORTE_PARTICIPANTES');
  const table = leerTablaTelegram_(sheet);
  let found = false;
  table.rows.some(function(row, index) {
    if (String(row.ID_REPORTE) !== reportId ||
        String(row.TELEGRAM_USER_ID) !== participant.id) {
      return false;
    }
    found = true;
    actualizarFilaTelegram_(sheet, table.headers, index + 2, {
      NOMBRE: participant.name,
      USUARIO: participant.username,
      ACTIVO: true,
      ACTUALIZADO_EN: new Date()
    });
    return true;
  });

  if (!found) {
    agregarRegistroObjeto_('REPORTE_PARTICIPANTES', {
      ID_PARTICIPACION: crearId_('PAR'),
      ID_REPORTE: reportId,
      TELEGRAM_USER_ID: participant.id,
      NOMBRE: participant.name,
      USUARIO: participant.username,
      ACTIVO: true,
      AGREGADO_EN: new Date(),
      ACTUALIZADO_EN: new Date()
    });
  }
}

function sincronizarEncargadosReporteTelegram_(reportId) {
  const report = buscarReporteTelegram_(reportId);
  if (!report) {
    return;
  }
  const names = obtenerParticipantesTelegram_(reportId).map(function(participant) {
    return participant.name;
  });
  actualizarFilaTelegram_(report.sheet, report.headers, report.rowNumber, {
    ENCARGADO: names.join(', '),
    ACTUALIZADO_EN: new Date()
  });
}

function buscarReporteTelegram_(reportId) {
  const sheet = obtenerHoja_('REPORTES');
  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastColumn)
    .getDisplayValues()[0].map(normalizarEncabezado_);
  const idColumn = headers.indexOf('ID_REPORTE');
  if (idColumn === -1 || sheet.getLastRow() < 2) {
    return null;
  }
  const match = sheet.getRange(2, idColumn + 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(reportId)
    .matchEntireCell(true)
    .findNext();
  if (!match) {
    return null;
  }
  const rowNumber = match.getRow();
  const row = sheet.getRange(rowNumber, 1, 1, lastColumn).getValues()[0];
  const values = {};
  headers.forEach(function(header, index) {
    values[header] = row[index];
  });
  return {
    sheet: sheet,
    headers: headers,
    rowNumber: rowNumber,
    values: values
  };
}

function buscarLogTelegramPorMensaje_(chatId, messageId) {
  const table = leerTablaTelegram_(obtenerHoja_('TELEGRAM_LOG'));
  for (let index = table.rows.length - 1; index >= 0; index -= 1) {
    const row = table.rows[index];
    if (String(row.CHAT_ID) === String(chatId) &&
        String(row.MESSAGE_ID) === String(messageId)) {
      return row;
    }
  }
  return null;
}

function actualizarLogTelegram_(chatId, messageId, changes) {
  const sheet = obtenerHoja_('TELEGRAM_LOG');
  const table = leerTablaTelegram_(sheet);
  for (let index = table.rows.length - 1; index >= 0; index -= 1) {
    const row = table.rows[index];
    if (String(row.CHAT_ID) === String(chatId) &&
        String(row.MESSAGE_ID) === String(messageId)) {
      changes.INTENTOS = Number(row.INTENTOS || 0) + 1;
      actualizarFilaTelegram_(sheet, table.headers, index + 2, changes);
      return;
    }
  }
}

function leerTablaTelegram_(sheet) {
  const lastColumn = sheet.getLastColumn();
  const headers = lastColumn > 0 ? sheet.getRange(1, 1, 1, lastColumn)
    .getDisplayValues()[0].map(normalizarEncabezado_) : [];
  if (sheet.getLastRow() < 2) {
    return { headers: headers, rows: [] };
  }
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, lastColumn)
    .getValues();
  return {
    headers: headers,
    rows: values.map(function(valuesRow) {
      const record = {};
      headers.forEach(function(header, index) {
        record[header] = valuesRow[index];
      });
      return record;
    })
  };
}

function actualizarFilaTelegram_(sheet, headers, rowNumber, changes) {
  const range = sheet.getRange(rowNumber, 1, 1, headers.length);
  const row = range.getValues()[0];
  Object.keys(changes).forEach(function(key) {
    const column = headers.indexOf(normalizarEncabezado_(key));
    if (column !== -1) {
      row[column] = changes[key];
    }
  });
  range.setValues([row]);
}

function asegurarEstructuraTelegram_() {
  const database = abrirBaseDatos_();
  asegurarHoja_(database, 'REPORTES', SHEET_SCHEMAS.REPORTES);
  asegurarHoja_(database, 'HISTORIAL_REPORTES', SHEET_SCHEMAS.HISTORIAL_REPORTES);
  asegurarHoja_(database, 'TELEGRAM_LOG', SHEET_SCHEMAS.TELEGRAM_LOG);
  asegurarHoja_(
    database,
    'REPORTE_PARTICIPANTES',
    SHEET_SCHEMAS.REPORTE_PARTICIPANTES
  );
}

function asegurarEstructuraTelegramSiFalta_() {
  const database = abrirBaseDatos_();
  const requiredSheets = [
    'REPORTES',
    'HISTORIAL_REPORTES',
    'TELEGRAM_LOG',
    'REPORTE_PARTICIPANTES'
  ];
  const missingSheet = requiredSheets.some(function(sheetName) {
    return !database.getSheetByName(sheetName);
  });
  if (missingSheet) {
    asegurarEstructuraTelegram_();
  }
}

function obtenerIdentidadTelegram_(user) {
  const firstName = texto_(user && user.first_name);
  const lastName = texto_(user && user.last_name);
  const username = texto_(user && user.username);
  const name = (firstName + ' ' + lastName).trim() ||
    (username ? '@' + username : 'Usuario de Telegram');
  return {
    id: String(user && user.id || ''),
    name: limitarTexto_(name, 120),
    username: username ? '@' + limitarTexto_(username, 100) : ''
  };
}

function obtenerCredencialesTelegram_() {
  const properties = PropertiesService.getScriptProperties();
  const token = String(properties.getProperty(
    TELEGRAM_CONFIG.TOKEN_PROPERTY
  ) || '').trim();
  const chatId = String(properties.getProperty(
    TELEGRAM_CONFIG.CHAT_PROPERTY
  ) || '').trim();
  if (!token || !chatId) {
    throw new Error('Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID en Script Properties.');
  }
  return { token: token, chatId: chatId };
}

function llamarTelegram_(method, payload, optionalToken) {
  const token = optionalToken || String(
    PropertiesService.getScriptProperties().getProperty(
      TELEGRAM_CONFIG.TOKEN_PROPERTY
    ) || ''
  ).trim();
  if (!token) {
    throw new Error('Falta TELEGRAM_BOT_TOKEN en Script Properties.');
  }

  let response = null;
  try {
    response = UrlFetchApp.fetch(
      TELEGRAM_CONFIG.API_BASE + token + '/' + method,
      {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload || {}),
        muteHttpExceptions: true
      }
    );
  } catch (error) {
    const safeMessage = String(error && error.message || error || '')
      .split(token).join('[TOKEN_OCULTO]');
    throw new Error('No se pudo conectar con Telegram: ' + safeMessage);
  }
  const status = response.getResponseCode();
  let body = null;
  try {
    body = JSON.parse(response.getContentText());
  } catch (error) {
    throw new Error('Telegram devolvio una respuesta no valida (HTTP ' + status + ').');
  }
  if (status < 200 || status >= 300 || !body.ok) {
    throw new Error('Telegram rechazo la operacion (HTTP ' + status + '): ' +
      texto_(body.description || 'Error desconocido.'));
  }
  return body.result;
}

function contestarCallbackTelegram_(callbackId, message, token, showAlert) {
  llamarTelegram_('answerCallbackQuery', {
    callback_query_id: callbackId,
    text: message,
    show_alert: Boolean(showAlert)
  }, token);
}

function responderCallbackTelegramConError_(update, token) {
  if (!update.callback_query) {
    return;
  }
  try {
    contestarCallbackTelegram_(
      update.callback_query.id,
      'No se pudo completar la accion. Intenta nuevamente.',
      token,
      true
    );
  } catch (ignored) {
    console.error('Tampoco se pudo responder el boton con el error.');
  }
}

function intentarEliminarMensajeTelegram_(chatId, messageId, token) {
  try {
    llamarTelegram_('deleteMessage', {
      chat_id: String(chatId),
      message_id: messageId
    }, token);
  } catch (error) {
    console.error('No se pudo eliminar la respuesta Listo: ' +
      obtenerMensajeErrorTelegram_(error));
  }
}

function registrarFalloTelegram_(reportId, chatId, error) {
  try {
    asegurarHoja_(abrirBaseDatos_(), 'TELEGRAM_LOG', SHEET_SCHEMAS.TELEGRAM_LOG);
    agregarRegistroObjeto_('TELEGRAM_LOG', {
      ID_LOG: crearId_('TGL'),
      ID_REPORTE: reportId,
      CHAT_ID: chatId,
      MESSAGE_ID: '',
      TIPO_MENSAJE: 'REPORTE',
      ESTATUS: 'ERROR',
      INTENTOS: 1,
      ULTIMO_ERROR: obtenerMensajeErrorTelegram_(error),
      ENVIADO_EN: '',
      RESPONDIDO_EN: '',
      ACTUALIZADO_EN: new Date()
    });
  } catch (logError) {
    console.error('No se pudo registrar el fallo de Telegram: ' +
      obtenerMensajeErrorTelegram_(logError));
  }
}

function escaparHtmlTelegram_(value) {
  return texto_(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function esVerdaderoTelegram_(value) {
  return value === true || ['TRUE', 'VERDADERO', 'SI', '1'].indexOf(
    normalizarClave_(value)
  ) !== -1;
}

function obtenerMensajeErrorTelegram_(error) {
  const message = error && error.message ? error.message : String(error || 'Error desconocido');
  const token = String(PropertiesService.getScriptProperties().getProperty(
    TELEGRAM_CONFIG.TOKEN_PROPERTY
  ) || '');
  return token ? message.split(token).join('[TOKEN_OCULTO]') : message;
}

/**
 * Busca el grupo donde se envio el comando de activacion mas reciente, guarda su
 * chat ID y confirma la conexion dentro del propio grupo. Nunca devuelve ni
 * registra el token.
 */
function detectarYGuardarGrupoTelegram() {
  const properties = PropertiesService.getScriptProperties();
  const token = String(properties.getProperty(
    TELEGRAM_CONFIG.TOKEN_PROPERTY
  ) || '').trim();
  if (!token) {
    throw new Error('Guarda primero TELEGRAM_BOT_TOKEN en Script Properties.');
  }
  const updates = llamarTelegram_('getUpdates', {
    limit: 100,
    timeout: 0,
    allowed_updates: ['message']
  }, token);
  let selected = null;
  updates.forEach(function(update) {
    const chat = update.message && update.message.chat;
    const text = texto_(update.message && update.message.text);
    if (chat && ['group', 'supergroup'].indexOf(chat.type) !== -1 &&
        esComandoActivacionTelegram_(text)) {
      selected = {
        id: String(chat.id),
        title: texto_(chat.title),
        updateId: Number(update.update_id)
      };
    }
  });
  if (!selected) {
    throw new Error(
      'No se encontro un grupo para activar. Envia /activar dentro del grupo de prueba e intenta otra vez.'
    );
  }
  properties.setProperty(TELEGRAM_CONFIG.CHAT_PROPERTY, selected.id);
  properties.setProperty(
    TELEGRAM_CONFIG.OFFSET_PROPERTY,
    String(selected.updateId + 1)
  );
  llamarTelegram_('sendMessage', {
    chat_id: selected.id,
    text: '✅ Bot conectado con Mantenimiento PDT. Ya puedes crear un reporte de prueba.'
  }, token);
  return { grupo: selected.title };
}

function esComandoActivacionTelegram_(text) {
  return /^\/?(?:activar|activate|start)(?:@[A-Za-z0-9_]+)?$/i.test(
    texto_(text).trim()
  );
}

/** Devuelve solamente los nombres visibles del bot y del grupo. */
function probarConfiguracionTelegram() {
  const credentials = obtenerCredencialesTelegram_();
  const bot = llamarTelegram_('getMe', {}, credentials.token);
  const group = llamarTelegram_('getChat', {
    chat_id: credentials.chatId
  }, credentials.token);
  return {
    bot: texto_(bot.first_name),
    grupo: texto_(group.title)
  };
}

/** Valida la configuracion e instala un unico activador de polling por minuto. */
function instalarIntegracionTelegram() {
  const test = probarConfiguracionTelegram();
  const credentials = obtenerCredencialesTelegram_();
  llamarTelegram_('deleteWebhook', {
    drop_pending_updates: false
  }, credentials.token);
  PropertiesService.getScriptProperties().deleteProperty(
    TELEGRAM_CONFIG.OFFSET_PROPERTY
  );
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === TELEGRAM_CONFIG.POLLING_FUNCTION) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger(TELEGRAM_CONFIG.POLLING_FUNCTION)
    .timeBased()
    .everyMinutes(1)
    .create();
  asegurarEstructuraTelegram_();
  return test;
}
