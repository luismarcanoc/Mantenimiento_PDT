// --- CONFIGURACIÓN PRINCIPAL (DATOS INTRODUCIDOS POR EL USUARIO) ---
const TELEGRAM_BOT_TOKEN = '7648123088:AAG7FQUrskP9I_9Hwj1ytGcvRyJ2HW6SDmI'; // Tu token de bot de Telegram
const ADMIN_TELEGRAM_CHAT_ID = '-4984594538'; // Tu ID de chat/grupo de Telegram. ¡Es un número negativo!
const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId(); // ID de tu Google Sheet (se obtiene automáticamente)

// --- CONFIGURACIÓN DE HOJAS (NOMBRES EXACTOS DE TUS PESTAÑAS) ---
const SHEET_DATA_NAME = 'REPORTES'; // Nombre exacto de tu hoja de formulario.
const SHEET_LOG_NAME = 'Registro Telegram'; // Nombre exacto de tu hoja de registro de Telegram.
const SHEET_BOT_RESPONSES_NAME = 'Respuestas del Bot'; // Nombre exacto de tu hoja para registrar respuestas del bot. ¡Cuidado con la "B" mayúscula!
const SHEET_LECTURA_OPTIMIZADA_NAME = 'Actividades pendientes'

// --- CONFIGURACIÓN DE COLUMNAS (¡CRÍTICO que coincidan con tus hojas!) ---
// Para la hoja 'REPORTES'
const HEADER_ID_REPORTE = 'Nro de reporte'; // El nombre del encabezado que contenga el ID del reporte
const HEADER_LINK_PRELLENADO = 'Link Prellenado'; // Nombre del encabezado para el enlace de prellenado

// Nombres de los encabezados de las columnas a incluir en el mensaje de Telegram
// El orden en esta lista es el orden en el que aparecerán en el mensaje.
// Se ha eliminado 'Nro de reporte' de esta lista para evitar la duplicación.
const COLUMNA_HEADERS_A_ENVIAR = [
  'Persona que reporta',
  'Fecha (DD/MM/AA)',
  'Hora',
  'Ubicación',
  'Nombre del equipo',
  'Código del equipo',
  'Descripción de la anomalía presentada',
  'Fotografía o video',
  'Link Prellenado' // Se mantiene en esta posición para que aparezca después de la foto.
];
// ¡CRÍTICO! AÑADE EL NOMBRE EXACTO DE TU NUEVA COLUMNA EN LA HOJA 'REPORTES' AQUÍ
const HEADER_TIEMPO_ATENCION = 'Tiempo de atención';

// Para 'Registro Telegram' (estas columnas deben existir y estar en orden en tu hoja 'Registro Telegram')
const COLUMNA_LOG_FECHA_INICIAL = 0;       // Columna A (0-indexado)
const COLUMNA_LOG_ID_MENSAJE_ORIGINAL = 1; // Columna B (0-indexado)
const COLUMNA_LOG_IDS_MENSAJE_TODOS = 2;   // Columna C (0-indexado): Contiene todos los IDs de reenvío
const COLUMNA_LOG_CONTENIDO_MENSAJE = 3; // Columna D (0-indexado)
const COLUMNA_LOG_CONTADOR_REENVIOS = 4;   // Columna E (0-indexado): Contador de reenvíos (0, 1, 2, ...)
const COLUMNA_LOG_RESPUESTA_RECIBIDA = 5; // Columna F (0-indexado): TRUE/FALSE si se recibió respuesta
const COLUMNA_LOG_FECHA_SIGUIENTE_REENVIO = 6; // Columna G (0-indexado): Guarda la fecha/hora del próximo reenvío programado
const COLUMNA_LOG_TIEMPO_RESPUESTA = 7; // NUEVA Columna H (0-indexado): Tiempo que tardó la respuesta
const COLUMNA_LOG_TIEMPO_RESPUESTA_VALIDACION = 8; // Columna I (0-indexado)
// Asegúrate de que esta constante esté definida en la parte superior de tu script
const COLUMNA_LOG_PROCESSING_STATUS = 10; // Columna J (0-indexado). ¡Verifica que sea la columna correcta!

// Hora a la que se deben realizar los reenvíos (en formato 24 horas)
const REENVIO_HORA = 7; // Reenvío a las 8 AM (8 para 8:00 AM)

// --- CONSTANTES PARA POLLING Y SEGUIMIENTO INTERNO (NO CAMBIAR) ---
const USER_PROPS = PropertiesService.getUserProperties();
const LAST_TELEGRAM_UPDATE_ID_KEY = 'last_telegram_update_id';
const LAST_ROW_PROCESSED_DATA_SHEET_KEY = 'last_row_processed_data_sheet'; // Para saber qué filas de 'REPORTES' ya se procesaron.


/**
 * Envía un mensaje de texto a un chat específico de Telegram y devuelve el message_id.
 * @param {string} text El texto del mensaje a enviar.
 * @param {string} targetChatId El ID del chat o grupo al que enviar el mensaje.
 * @returns {string|null} El ID del mensaje de Telegram si el envío fue exitoso, de lo contrario, null.
 */
function sendTelegramMessage(text, targetChatId) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const options = {
    method: 'post',
    payload: {
      chat_id: targetChatId,
      text: text,
      parse_mode: 'HTML' // Para que el formato HTML (bold, underline) funcione
    }
  };
  try {
    const response = UrlFetchApp.fetch(url, options);
    const jsonResponse = JSON.parse(response.getContentText());
    if (!jsonResponse.ok) {
      console.error("Error al enviar mensaje a Telegram: " + jsonResponse.description);
      return null;
    } else {
      console.log("Mensaje de Telegram enviado con éxito a " + targetChatId);
      return jsonResponse.result.message_id; // Devuelve el ID del mensaje de Telegram
    }
  } catch (error) {
    console.error("Error al conectar con la API de Telegram: " + error.toString());
    return null;
  }
}

/**
 * (NUEVA FUNCIÓN AUXILIAR)
 * Construye, envía y registra el mensaje inicial de un nuevo reporte.
 * @param {Array} rowDisplayData Los valores visibles de la fila del reporte.
 * @param {Array} rowFormulasData Las fórmulas de la fila del reporte.
 * @param {object} headerMap Un mapa de los nombres de encabezado a sus índices (base 0).
 * @param {GoogleAppsScript.Spreadsheet.Sheet} logSheet La hoja de registro de Telegram.
 */
function sendAndLogInitialReport(rowDisplayData, rowFormulasData, headerMap, logSheet) {
  const reporteIdIndex = headerMap[HEADER_ID_REPORTE];
  let reporteId = "N/A";
  if (reporteIdIndex !== undefined && reporteIdIndex < rowDisplayData.length) {
    reporteId = rowDisplayData[reporteIdIndex];
  }

  // --- Construcción del mensaje ---
  let fullMessageContent = `<b>📢 ¡Nuevo Reporte! #${reporteId} 📢</b>\n\n`;
  COLUMNA_HEADERS_A_ENVIAR.forEach(headerName => {
    const colIndex = headerMap[headerName];
    if (colIndex !== undefined && colIndex < rowDisplayData.length) {
      const value = rowDisplayData[colIndex];
      
      if (headerName === HEADER_LINK_PRELLENADO) {
        // Extraer la URL de la fórmula HYPERLINK para asegurar que es la correcta
        const formula = rowFormulasData[colIndex];
        const urlMatch = formula.match(/=HYPERLINK\("([^"]+)"/);
        if (urlMatch && urlMatch[1]) {
           fullMessageContent += `<b><u>${headerName}</u></b>:\n<a href="${urlMatch[1]}">Abrir formulario</a>\n\n`;
        } else {
           // Si falla la extracción, se usa el valor visible como respaldo
           fullMessageContent += `<b><u>${headerName}</u></b>:\n${value}\n\n`;
        }
      } else {
        fullMessageContent += `<b><u>${headerName}</u></b>:\n${value}\n\n`;
      }
    }
  });

  // --- Envío y registro ---
  const telegramMessageId = sendTelegramMessage(fullMessageContent, ADMIN_TELEGRAM_CHAT_ID);

  if (telegramMessageId) {
    const initialSendDateTime = new Date();
    const nextResendTime = new Date(initialSendDateTime);
    nextResendTime.setDate(nextResendTime.getDate() + 1);
    nextResendTime.setHours(REENVIO_HORA, 0, 0, 0);

    logSheet.appendRow([
      initialSendDateTime,
      String(telegramMessageId),
      "'" + String(telegramMessageId),
      fullMessageContent,
      0,
      'FALSE',
      nextResendTime,
      ''
    ]);
    Logger.log(`Mensaje y registro inicial creados para reporte #${reporteId} desde onFormSubmit.`);
  }
}

/**
 * Función principal para obtener y procesar actualizaciones de Telegram (Polling).
 * Esta función se debe ejecutar periódicamente mediante un activador de tiempo.
 */
function getTelegramUpdates() {
  Logger.log("Intentando obtener actualizaciones de Telegram...");
  try {
    const lastUpdateId = parseInt(USER_PROPS.getProperty(LAST_TELEGRAM_UPDATE_ID_KEY) || '0');
    Logger.log(`Último update_id procesado: ${lastUpdateId}`);

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}`;
    const options = { method: 'get', muteHttpExceptions: true };

    const response = UrlFetchApp.fetch(url, options);
    const jsonResponse = JSON.parse(response.getContentText());

    if (!jsonResponse.ok) {
      console.error("Error al obtener actualizaciones: " + jsonResponse.description);
      Logger.log("Error al obtener actualizaciones: " + jsonResponse.description);
      return;
    }

    if (jsonResponse.result && jsonResponse.result.length > 0) {
      Logger.log(`Se recibieron ${jsonResponse.result.length} nuevas actualizaciones.`);
      let highestUpdateId = lastUpdateId;

      const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
      const botResponsesSheet = spreadsheet.getSheetByName(SHEET_BOT_RESPONSES_NAME);
      const logSheet = spreadsheet.getSheetByName(SHEET_LOG_NAME);
      const dataSheet = spreadsheet.getSheetByName(SHEET_DATA_NAME);

      if (!botResponsesSheet) {
        console.error(`Hoja de registro de respuestas del bot '${SHEET_BOT_RESPONSES_NAME}' no encontrada.`);
        sendTelegramMessage(`⚠️ *Error*: Hoja '${SHEET_BOT_RESPONSES_NAME}' no encontrada. No se pueden registrar respuestas del bot.`, ADMIN_TELEGRAM_CHAT_ID);
        return;
      }
      if (!logSheet) {
        console.error(`Hoja de registro '${SHEET_LOG_NAME}' no encontrada.`);
        sendTelegramMessage(`⚠️ *Error*: Hoja de registro '${SHEET_LOG_NAME}' no encontrada. No se puede actualizar el estado de reenvío.`, ADMIN_TELEGRAM_CHAT_ID);
        return;
      }
      if (!dataSheet) {
        console.error(`Hoja de datos '${SHEET_DATA_NAME}' no encontrada.`);
        sendTelegramMessage(`⚠️ *Error*: Hoja de datos '${SHEET_DATA_NAME}' no encontrada. No se puede registrar el tiempo de reacción.`, ADMIN_TELEGRAM_CHAT_ID);
        return;
      }

      // Pre-obtener los datos del log relevantes para la lógica de respuesta
      let logData = [];
      const lastLogRow = logSheet.getLastRow();
      if (lastLogRow >= 2) {
          // Obtener todas las columnas desde A (COLUMNA_LOG_FECHA_INICIAL) hasta la última columna necesaria.
          logData = logSheet.getRange(2, COLUMNA_LOG_FECHA_INICIAL + 1, lastLogRow - 1, COLUMNA_LOG_TIEMPO_RESPUESTA + 1).getValues();
          Logger.log(`Se cargaron ${logData.length} filas del log de Telegram.`);
      } else {
          Logger.log("La hoja de log está vacía o solo tiene encabezados.");
      }

      jsonResponse.result.forEach(update => {
        const message = update.message;
        if (message) {
          const chatId = message.chat.id;
          const from = message.from;
          const username = from.username ? `@${from.username}` : (from.first_name || 'N/A');
          const messageText = message.text || '[Mensaje sin texto]';
          const messageType = message.text ? 'text' : (message.photo ? 'photo' : (message.sticker ? 'sticker' : 'other'));
          const messageId = message.message_id;

          let respondingToMessageId = '';
          if (message.reply_to_message) {
            // CORRECCIÓN CLAVE AQUÍ: debe ser message_id directamente, no anidado bajo 'message'
            respondingToMessageId = message.reply_to_message.message_id;
            Logger.log(`Mensaje entrante (ID: ${messageId}) es una respuesta. Respondiendo a message_id: ${respondingToMessageId}`);
          } else {
            Logger.log(`Mensaje entrante (ID: ${messageId}) no es una respuesta.`);
          }

          botResponsesSheet.appendRow([
            new Date(),
            String(chatId),
            username,
            messageText,
            messageType,
            String(messageId),
            String(respondingToMessageId)
          ]);
          Logger.log(`Mensaje de Telegram de '${username}' (Chat ID: ${chatId}) registrado en Respuestas del Bot. Respondiendo a: ${respondingToMessageId || 'ninguno'}`);

          // Lógica: Actualizar 'Respuesta Recibida?' en Registro Telegram y calcular tiempo de respuesta
          if (respondingToMessageId && logData.length > 0) {
            let matchFoundInLog = false;
            for (let j = 0; j < logData.length; j++) {
              const logEntry = logData[j];
              
              const allTelegramIdsStr = String(logEntry[COLUMNA_LOG_IDS_MENSAJE_TODOS]);
              const respuestaRecibidaStatus = String(logEntry[COLUMNA_LOG_RESPUESTA_RECIBIDA]).toUpperCase();

              Logger.log(`Analizando fila de log ${j + 2}: IDs en log: ${allTelegramIdsStr}, Respuesta Recibida?: ${respuestaRecibidaStatus}`);

              if (respuestaRecibidaStatus === 'FALSE') { // Solo procesar si aún no ha sido respondido
                const cleanAllTelegramIdsStr = allTelegramIdsStr.startsWith("'") ? allTelegramIdsStr.substring(1) : allTelegramIdsStr;
                const allIds = cleanAllTelegramIdsStr.split(',').map(id => id.trim());

                if (allIds.includes(String(respondingToMessageId))) {
                  const rowInLogSheet = j + 2; // Fila real en la hoja 'Registro Telegram'
                  matchFoundInLog = true;

                  // Actualizar 'Respuesta Recibida?' en Registro Telegram
                  logSheet.getRange(rowInLogSheet, COLUMNA_LOG_RESPUESTA_RECIBIDA + 1).setValue('TRUE');
                  Logger.log(`'Respuesta Recibida?' actualizado a TRUE para fila ${rowInLogSheet} (respondido a ${respondingToMessageId}).`);

                  // **** CÓDIGO PARA CALCULAR Y REGISTRAR TIEMPO DE RESPUESTA EN REGISTRO TELEGRAM ****

                  // 1. Obtener la Fecha/Hora de Envío Inicial del log
                  const initialSendDateTime = logEntry[COLUMNA_LOG_FECHA_INICIAL];
                  // 2. La Fecha/Hora de Respuesta es la actual (cuando se detecta la respuesta)
                  const responseDateTime = new Date();

                  // 3. Calcular la diferencia de tiempo
                  const timeDiffMs = responseDateTime.getTime() - initialSendDateTime.getTime();
                  const hours = Math.floor(timeDiffMs / (1000 * 60 * 60));
                  const minutes = Math.floor((timeDiffMs % (1000 * 60 * 60)) / (1000 * 60));
                  const seconds = Math.floor((timeDiffMs % (1000 * 60)) / 1000);
                  const formattedTimeDiff = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

                  // 4. Escribir el tiempo de respuesta en la nueva columna de Registro Telegram
                  logSheet.getRange(rowInLogSheet, COLUMNA_LOG_TIEMPO_RESPUESTA + 1).setValue(formattedTimeDiff);
                  Logger.log(`Tiempo de respuesta '${formattedTimeDiff}' registrado en Registro Telegram, fila ${rowInLogSheet}.`);

                  // **** NUEVA LÓGICA: COPIAR EL TIEMPO A LA HOJA 'REPORTES' ****
                  
                  // Obtener el número de reporte del mensaje original
                  const originalMessageContent = logEntry[COLUMNA_LOG_CONTENIDO_MENSAJE];
                  const match = originalMessageContent.match(/#(\d+)/);
                  if (match && match[1]) {
                    const reporteNumber = match[1];
                    
                    // Buscar la fila correspondiente en la hoja 'REPORTES'
                    const headers = dataSheet.getRange(1, 1, 1, dataSheet.getLastColumn()).getValues()[0];
                    const reporteIdColIndex = headers.indexOf(HEADER_ID_REPORTE);
                    const tiempoAtencionColIndex = headers.indexOf(HEADER_TIEMPO_ATENCION);

                    if (reporteIdColIndex !== -1 && tiempoAtencionColIndex !== -1) {
                      const allReportesData = dataSheet.getRange(2, reporteIdColIndex + 1, dataSheet.getLastRow() - 1, 1).getDisplayValues();
                      
                      let foundRow = -1;
                      for (let k = 0; k < allReportesData.length; k++) {
                        if (allReportesData[k][0] === reporteNumber) {
                          foundRow = k + 2; // Sumar 2 porque el rango empieza en la fila 2 y el array es 0-indexado
                          break;
                        }
                      }

                      if (foundRow !== -1) {
                        dataSheet.getRange(foundRow, tiempoAtencionColIndex + 1).setValue(formattedTimeDiff);
                        Logger.log(`Tiempo de atención '${formattedTimeDiff}' copiado a la hoja 'REPORTES' para el reporte #${reporteNumber}.`);
                      } else {
                        Logger.log(`Advertencia: No se encontró la fila para el reporte #${reporteNumber} en la hoja 'REPORTES'.`);
                      }
                    } else {
                      Logger.log('Error: Las columnas "Nro de reporte" o "Tiempo de atención" no se encontraron en la hoja "REPORTES".');
                    }
                  } else {
                    Logger.log('Error: No se pudo extraer el número de reporte del mensaje de log.');
                  }

                  // **** FIN DE LA NUEVA LÓGICA ****

                  break; // Salir del bucle j, ya que encontramos y procesamos la respuesta
                }
              }
            }
            if (!matchFoundInLog) {
                Logger.log(`No se encontró una entrada coincidente y no respondida en el log para respondingToMessageId: ${respondingToMessageId}`);
            }
          } else if (respondingToMessageId) {
            Logger.log(`No hay datos en el log o respondingToMessageId es nulo/vacío, no se procesa la respuesta.`);
          }
        }
        if (update.update_id > highestUpdateId) {
          highestUpdateId = update.update_id;
        }
      });
      USER_PROPS.setProperty(LAST_TELEGRAM_UPDATE_ID_KEY, highestUpdateId.toString());
      Logger.log(`Nuevo last_telegram_update_id guardado: ${highestUpdateId}`);
    } else {
      Logger.log("No hay nuevas actualizaciones de Telegram.");
    }
  } catch (error) {
    console.error("Error en getTelegramUpdates: " + error.toString());
    Logger.log("Error en getTelegramUpdates: " + error.toString());
  }
}

/**
 * (VERSIÓN FINAL v3.1 - CON MEDICIÓN DE TIEMPO)
 * Reenvía mensajes pendientes en lotes utilizando un estado con fecha y mide el tiempo de ejecución del lote.
 */
function sendPeriodicMessages() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    Logger.log("Ejecución omitida: ya hay un proceso en ejecución.");
    return;
  }
  
  const startTime = new Date();
  Logger.log("Buscando lote de mensajes para REENVIAR (con bloqueo fechado)...");
  const BATCH_SIZE = 20;
  const CHAT_ID = ADMIN_TELEGRAM_CHAT_ID;

  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // 1. HOJA MAESTRA (ESCRITURA: Registro Telegram)
    const logSheet = spreadsheet.getSheetByName(SHEET_LOG_NAME); 
    // 2. HOJA DE LECTURA (FILTRO: Actividades pendientes)
    const readSheet = spreadsheet.getSheetByName(SHEET_LECTURA_OPTIMIZADA_NAME);
    
    if (!logSheet || logSheet.getLastRow() < 2 || !readSheet || readSheet.getLastRow() < 2) {
      Logger.log("Faltan datos en la hoja maestra o en la hoja de lectura optimizada.");
      lock.releaseLock(); return;
    }
    
    const now = new Date();
    const todayString = Utilities.formatDate(now, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), "yyyy-MM-dd");
    
    // BLOQUE DE RESTRICCIÓN DE TIEMPO (Mantener comentado para pruebas)
    const startOfWindow = new Date(now);
    startOfWindow.setHours(REENVIO_HORA, 0, 0, 0);
    const endOfWindow = new Date(now);
    endOfWindow.setHours(REENVIO_HORA+5, 59, 59, 999);

    
    if (now < startOfWindow || now > endOfWindow) {
      Logger.log("Fuera de la ventana de tiempo para reenvíos.");
      lock.releaseLock(); return;
    }
    

    // --- CONFIGURACIÓN DE BÚSQUEDA ---
    const COLUMNA_CLAVE_ID_NAME = 'ID Mensaje Telegram Original';

    // Obtener encabezados y data
    const masterHeaders = logSheet.getRange(1, 1, 1, logSheet.getLastColumn()).getValues()[0];
    const readHeaders = readSheet.getRange(1, 1, 1, readSheet.getLastColumn()).getValues()[0];
    const masterData = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, logSheet.getLastColumn()).getValues();
    const readData = readSheet.getRange(2, 1, readSheet.getLastRow() - 1, readSheet.getLastColumn()).getValues();
    
    // Índices de columna en la hoja MAESTRA (para la búsqueda y escritura)
    const colIndexIDMaster = masterHeaders.indexOf(COLUMNA_CLAVE_ID_NAME);
    const colIndexNroReenviosMaster = masterHeaders.indexOf('Contador Reenvíos'); 
    const colIndexMessageIdsMaster = masterHeaders.indexOf('IDs de Mensaje Telegram (todos)');
    const colIndexFechaSiguienteReenvioMaster = masterHeaders.indexOf('Fecha/Hora Siguiente Reenvío Programado');
    const colIndexProcessingStatusMaster = masterHeaders.indexOf('Processing Status');

    // Índices de columna en la hoja de LECTURA (solo necesitamos el ID y el Contenido)
    const colIndexIDRead = readHeaders.indexOf(COLUMNA_CLAVE_ID_NAME);
    const colIndexMensajeCompletoRead = readHeaders.indexOf('Contenido del Mensaje');
    
    if (colIndexIDMaster === -1 || colIndexIDRead === -1 || colIndexMensajeCompletoRead === -1 || colIndexProcessingStatusMaster === -1) {
        Logger.log(`Error: Faltan columnas críticas para el mapeo.`);
        lock.releaseLock(); return;
    }
    
    let messagesToProcess = [];
    
    // 🟥 CORRECCIÓN #1: Eliminar el límite de BATCH_SIZE del bucle de LECTURA. 
    // Ahora leemos TODAS las tareas pendientes.
    for (let i = 0; i < readData.length; i++) {
        const rowDataRead = readData[i];
        
        messagesToProcess.push({ 
            idReporte: rowDataRead[colIndexIDRead],
            messageText: rowDataRead[colIndexMensajeCompletoRead]
        });
        // Se elimina el 'break' aquí.
    }

    if (messagesToProcess.length === 0) {
      Logger.log("No se encontraron mensajes disponibles para procesar.");
      lock.releaseLock(); return;
    }

    Logger.log(`Se encontraron ${messagesToProcess.length} mensajes pendientes. Procesando lote de ${BATCH_SIZE}...`);
    
    let messagesSentCount = 0;

    for (const message of messagesToProcess) {
      // 🟥 CORRECCIÓN #2: Aplicar el límite de BATCH_SIZE en el bucle de PROCESAMIENTO/ENVÍO.
      if (messagesSentCount >= BATCH_SIZE) {
          Logger.log(`Límite de lote (${BATCH_SIZE}) alcanzado. Finalizando ejecución.`);
          break; 
      }

      const { idReporte, messageText } = message;

      // 1. BUSCAR FILA EN MAESTRO POR ID (Mapeo)
      let masterRowIndex = -1;
      let masterEntry = null;

      for (let j = 0; j < masterData.length; j++) {
          if (masterData[j][colIndexIDMaster] == idReporte) {
              masterEntry = masterData[j];
              masterRowIndex = j + 2; 
              break;
          }
      }
      
      if (masterRowIndex === -1) {
          Logger.log(`Advertencia: ID ${idReporte} no encontrado en la hoja maestra. Saltando.`);
          continue; 
      }
      
      // 2. VERIFICACIÓN CRÍTICA (Detener el bucle infinito)
      const processingStatus = String(masterEntry[colIndexProcessingStatusMaster]);
      
      if (processingStatus.includes(todayString)) {
          Logger.log(`Skipping ID ${idReporte}: Already processed today.`);
          continue; 
      }
      
      // 3. ENVIAR MENSAJE (Orden corregido: texto, chat_id)
      const newTelegramMessageId = sendTelegramMessage(messageText, CHAT_ID); 
      
      if (newTelegramMessageId) {
        // 4. OBTENER Y CALCULAR VALORES PARA ESCRITURA
        const currentReenvios = parseInt(masterEntry[colIndexNroReenviosMaster]) || 0;
        const nextReenviosCount = currentReenvios + 1;
        
        const updatedTelegramIdsTodos = masterEntry[colIndexMessageIdsMaster] + ', ' + String(newTelegramMessageId);
        
        const nextResendTimePlanned = new Date(masterEntry[colIndexFechaSiguienteReenvioMaster]);
        nextResendTimePlanned.setDate(nextResendTimePlanned.getDate() + 1);

        // 5. ESCRITURA EN LA HOJA MAESTRA (logSheet)
        logSheet.getRange(masterRowIndex, colIndexFechaSiguienteReenvioMaster + 1).setValue(nextResendTimePlanned);
        logSheet.getRange(masterRowIndex, colIndexNroReenviosMaster + 1).setValue(nextReenviosCount);
        logSheet.getRange(masterRowIndex, colIndexMessageIdsMaster + 1).setValue("'" + updatedTelegramIdsTodos);
        logSheet.getRange(masterRowIndex, colIndexProcessingStatusMaster + 1).setValue(`PROCESADO ${todayString}`);

        SpreadsheetApp.flush();
        Logger.log(`Fila ${masterRowIndex} procesada y bloqueada para hoy.`);
        Utilities.sleep(1500);
        messagesSentCount++; // Aumentar el contador de envíos exitosos
      }
    }
    
    const endTime = new Date();
    const executionTime = (endTime - startTime) / 1000;
    Logger.log(`Lote finalizado. Total de mensajes enviados: ${messagesSentCount}. Tiempo de ejecución: ${executionTime} segundos.`);

  } catch (error) {
    Logger.log("Error en sendPeriodicMessages (vFINAL_LOTE): " + error.toString());
  } finally {
    lock.releaseLock();
    Logger.log("Bloqueo liberado.");
  }
}
/**
 * Establece la última fila procesada a la última fila con datos en la hoja 'REPORTES'.
 * Útil para ignorar datos históricos y empezar a procesar solo nuevas entradas.
 * Ejecuta esta función SOLO UNA VEZ cuando quieras que el bot comience desde la fila actual.
 */
function setLastRowToCurrent() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const dataSheet = spreadsheet.getSheetByName(SHEET_DATA_NAME);

  if (!dataSheet) {
    Logger.log(`ERROR: Hoja de datos '${SHEET_DATA_NAME}' no encontrada. No se puede establecer la última fila.`);
    sendTelegramMessage(`⚠️ *Error*: Hoja de datos '${SHEET_DATA_NAME}' no encontrada. No se pudo configurar el inicio del bot.`, ADMIN_TELEGRAM_CHAT_ID);
    return;
  }

  const currentLastDataRow = dataSheet.getLastRow();

  // Si la hoja solo tiene encabezados, la última fila procesada es 1.
  // Si tiene datos, será la última fila con datos.
  const newLastRowToSet = Math.max(1, currentLastDataRow);

  USER_PROPS.setProperty(LAST_ROW_PROCESSED_DATA_SHEET_KEY, String(newLastRowToSet));
  Logger.log(`La última fila procesada ha sido establecida a: ${newLastRowToSet}.`);
  sendTelegramMessage(`✅ El bot ahora comenzará a procesar nuevos reportes a partir de la fila ${newLastRowToSet + 1} de la hoja '${SHEET_DATA_NAME}'.`, ADMIN_TELEGRAM_CHAT_ID);
}

// **--- FUNCIONES DE GESTIÓN DE ACTIVADORES (PARA CONFIGURAR O BORRAR) ---**

/**
 * Crea o asegura que el activador periódico para getTelegramUpdates exista.
 * Ejecuta esta función una vez para iniciar el polling.
 */
function setupPollingTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  let triggerExists = false;
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'getTelegramUpdates') {
      triggerExists = true;
      break;
    }
  }
  if (!triggerExists) {
    ScriptApp.newTrigger('getTelegramUpdates')
      .timeBased()
      .everyMinutes(1) // Se ejecuta cada minuto. Puedes ajustar en la interfaz de activadores.
      .create();
    Logger.log(`Activador de polling para getTelegramUpdates creado.`);
    sendTelegramMessage(`✅ El sistema de polling para recibir mensajes está configurado y activo.`, ADMIN_TELEGRAM_CHAT_ID);
  } else {
    Logger.log("Activador de polling para getTelegramUpdates ya existe.");
    sendTelegramMessage("El activador de polling ya existe. Si deseas cambiar el intervalo, debes eliminarlo y crearlo de nuevo manualmente.", ADMIN_TELEGRAM_CHAT_ID);
  }
}

/**
 * Elimina el activador de polling para getTelegramUpdates.
 * Ejecuta esta función para detener la recepción de mensajes por polling.
 */
function disablePollingTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'getTelegramUpdates') {
      ScriptApp.deleteTrigger(triggers[i]);
      Logger.log("Activador de polling para getTelegramUpdates eliminado.");
      sendTelegramMessage("🛑 El activador de polling ha sido DESHABILITADO. El bot ya no recibirá mensajes.", ADMIN_TELEGRAM_CHAT_ID);
      return;
    }
  }
  Logger.log("No se encontró ningún activador de polling para eliminar.");
  sendTelegramMessage("No se encontró ningún activador de polling activo para deshabilitar.", ADMIN_TELEGRAM_CHAT_ID);
}

/**
 * Crea o asegura que el activador periódico para sendPeriodicMessages exista.
 * Esta función DEBE ejecutarse MANUALMENTE una vez para establecer el activador.
 * Crea un activador que se ejecuta cada minuto por defecto.
 */
function setupPeriodicTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  let triggerExists = false;
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendPeriodicMessages') {
      triggerExists = true;
      break;
    }
  }
  if (!triggerExists) {
    ScriptApp.newTrigger('sendPeriodicMessages')
      .timeBased()
      .everyMinutes(1) // Por defecto, cada minuto. Puedes editarlo manualmente después en la interfaz de activadores.
      .create();
    Logger.log(`Activador periódico para sendPeriodicMessages creado. Puedes ajustar el intervalo en la interfaz de Apps Script.`);
    sendTelegramMessage(`✅ El sistema de envío/reenvío periódico está configurado y activo. Revisa el activador en Apps Script para el intervalo.`, ADMIN_TELEGRAM_CHAT_ID);
  } else {
    Logger.log("Activador periódico para sendPeriodicMessages ya existe.");
    sendTelegramMessage("El activador periódico ya existe. Si deseas cambiar el intervalo, debes eliminarlo y crearlo de nuevo manualmente.", ADMIN_TELEGRAM_CHAT_ID);
  }
}

/**
 * Elimina el activador periódico para sendPeriodicMessages.
 * Esta función DEBE ejecutarse MANUALMENTE si quieres detener el bot por completo.
 */
function disablePeriodicTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendPeriodicMessages') {
      ScriptApp.deleteTrigger(triggers[i]);
      Logger.log("Activador periódico para sendPeriodicMessages eliminado.");
      sendTelegramMessage("🛑 El activador de envío/reenvío periódico ha sido DESHABILITADO. El bot no buscará mensajes para enviar.", ADMIN_TELEGRAM_CHAT_ID);
      return;
    }
  }
  Logger.log("No se encontró ningún activador periódico para eliminar.");
  sendTelegramMessage("No se encontró ningún activador periódico activo para deshabilitar.", ADMIN_TELEGRAM_CHAT_ID);
}

// **--- FUNCIONES OBSOLETAS/NO USADAS PARA POLLING (NO BORRAR) ---**
// Estas funciones no se usan en un modelo de polling, pero se mantienen para evitar errores si fueron referenciadas antes.

/**
 * @deprecated Esta función ya no es necesaria con el modelo de polling (getUpdates).
 */
function doPost(e) {
  Logger.log("La función doPost fue invocada, pero no es usada en este modelo de polling. Por favor, asegúrate de que no haya un webhook activo.");
  return ContentService.createTextOutput(JSON.stringify({ status: 'info', message: 'Webhook is not the primary method for this bot.' }))
                       .setMimeType(ContentService.MimeType.JSON);
}

/**
 * @deprecated Esta función ya no es necesaria con el modelo de polling (getUpdates).
 */
function setWebhook() {
  Logger.log("La función setWebhook fue invocada, pero no es necesaria en este modelo de polling.");
  // Nota: La URL del webhook aquí es un marcador de posición, no se usa.
  const webAppUrl = 'https://script.google.com/macros/s/xxxx/exec'; // URL ficticia
  UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  Logger.log("Se ha intentado desconfigurar cualquier webhook existente.");
}
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * RECALCULA el tiempo de respuesta real y lo escribe en la columna I.
 * Se debe ejecutar periódicamente con un activador de tiempo.
 */
function recalcularTiempoDeRespuestaEnI() {
  Logger.log("Iniciando la revisión para rellenar la columna I...");

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const logSheet = spreadsheet.getSheetByName(SHEET_LOG_NAME);
  const botResponsesSheet = spreadsheet.getSheetByName(SHEET_BOT_RESPONSES_NAME);

  if (!logSheet || !botResponsesSheet) {
    Logger.log('ERROR: No se pudieron encontrar las hojas de Registro Telegram o Respuestas del Bot.');
    return;
  }
  
  const lastLogRow = logSheet.getLastRow();
  if (lastLogRow < 2) {
    Logger.log('No hay datos en la hoja de log para procesar.');
    return;
  }
  
  // Obtener los datos de las columnas relevantes (A, C, F, I)
  const logData = logSheet.getRange(2, 1, lastLogRow - 1, logSheet.getLastColumn()).getValues();

  // Obtener los datos de las columnas relevantes de la hoja de respuestas del bot (A, G)
  const lastBotResponseRow = botResponsesSheet.getLastRow();
  if (lastBotResponseRow < 2) {
      Logger.log('No hay datos en la hoja de respuestas del bot para procesar.');
      return;
  }
  const botResponsesData = botResponsesSheet.getRange(2, 1, lastBotResponseRow - 1, botResponsesSheet.getLastColumn()).getValues();

  // Variables de columna (basadas en tu script original)
  const COLUMNA_RESPUESTA_FECHA = 0; // Columna A en 'Respuestas del Bot'
  const COLUMNA_RESPUESTA_A = 6;     // Columna G en 'Respuestas del Bot' (respondingToMessageId)
  const COLUMNA_LOG_FECHA_INICIAL = 0; // Columna A en 'Registro Telegram'
  const COLUMNA_LOG_IDS_MENSAJE_TODOS = 2; // Columna C en 'Registro Telegram'
  const COLUMNA_LOG_RESPUESTA_RECIBIDA = 5; // Columna F en 'Registro Telegram'
  const COLUMNA_LOG_TIEMPO_RESPUESTA_VALIDACION = 8; // Columna I en 'Registro Telegram'
  
  const updatesForI = [];
  let changesMade = false;

  logData.forEach((logEntry, index) => {
    const respuestaRecibidaStatus = String(logEntry[COLUMNA_LOG_RESPUESTA_RECIBIDA]).toUpperCase();
    const tiempoEnI = logEntry[COLUMNA_LOG_TIEMPO_RESPUESTA_VALIDACION];

    // Solo procesar si el mensaje ha sido respondido y la columna I está vacía
    if (respuestaRecibidaStatus === 'TRUE' && !tiempoEnI) {
      const initialSendDateTime = logEntry[COLUMNA_LOG_FECHA_INICIAL];
      const allTelegramIdsStr = String(logEntry[COLUMNA_LOG_IDS_MENSAJE_TODOS]);
      const allIds = allTelegramIdsStr.startsWith("'") ? allTelegramIdsStr.substring(1).split(',').map(id => id.trim()) : allTelegramIdsStr.split(',').map(id => id.trim());
      const lastSentMessageId = allIds[allIds.length - 1];

      let foundResponse = false;
      for (const responseRow of botResponsesData) {
        const respondingToId = String(responseRow[COLUMNA_RESPUESTA_A]);
        if (respondingToId === lastSentMessageId) {
          const responseDateTime = responseRow[COLUMNA_RESPUESTA_FECHA];

          if (initialSendDateTime instanceof Date && responseDateTime instanceof Date) {
            const timeDiffMs = responseDateTime.getTime() - initialSendDateTime.getTime();
            const hours = Math.floor(timeDiffMs / (1000 * 60 * 60));
            const minutes = Math.floor((timeDiffMs % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeDiffMs % (1000 * 60)) / 1000);
            const formattedTimeDiff = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            updatesForI.push([formattedTimeDiff]);
            changesMade = true;
          } else {
            updatesForI.push(['']);
          }
          foundResponse = true;
          break;
        }
      }
      if (!foundResponse) {
        updatesForI.push(['']);
      }
    } else {
        updatesForI.push([tiempoEnI]); // Conserva el valor existente si no hay que actualizar
    }
  });

  if (changesMade) {
      logSheet.getRange(2, COLUMNA_LOG_TIEMPO_RESPUESTA_VALIDACION + 1, updatesForI.length, 1).setValues(updatesForI);
      Logger.log("Recálculo en la columna I finalizado. Se rellenaron los valores faltantes.");
  } else {
      Logger.log("No se encontraron celdas para actualizar en la columna I.");
  }
}
/**
 * Actualiza los tiempos de atención en la hoja 'REPORTES'
 * a partir de los datos históricos de 'Registro Telegram'.
 * Esta es una función de uso único y manual.
 * * NOTA: Esta versión sobrescribe la información existente.
 */
function actualizarTiemposHistoricos() {
  Logger.log('Iniciando la actualización de tiempos de atención históricos...');

  const SHEET_DATA_NAME = 'REPORTES';
  const SHEET_LOG_NAME = 'Registro Telegram';
  const HEADER_ID_REPORTE = 'Nro de reporte';
  const HEADER_TIEMPO_ATENCION = 'Tiempo de atención';
  const HEADER_TIEMPO_LOG_ORIGEN = 'TEST_OK';

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const reportesSheet = spreadsheet.getSheetByName(SHEET_DATA_NAME);
  const logSheet = spreadsheet.getSheetByName(SHEET_LOG_NAME);

  if (!reportesSheet || !logSheet) {
    Logger.log('Error: Las hojas "REPORTES" o "Registro Telegram" no se encontraron.');
    return;
  }

  // Obtener los encabezados de ambas hojas para encontrar los índices de columna
  const reportesHeaders = reportesSheet.getRange(1, 1, 1, reportesSheet.getLastColumn()).getValues()[0];
  const reporteIdColIndex = reportesHeaders.indexOf(HEADER_ID_REPORTE);
  const tiempoAtencionColIndex = reportesHeaders.indexOf(HEADER_TIEMPO_ATENCION);

  const logHeaders = logSheet.getRange(1, 1, 1, logSheet.getLastColumn()).getValues()[0];
  const logContenidoColIndex = logHeaders.indexOf('Contenido del Mensaje');
  const logTiempoRespuestaColIndex = logHeaders.indexOf(HEADER_TIEMPO_LOG_ORIGEN);

  // Verificar que todas las columnas necesarias existan
  if (reporteIdColIndex === -1 || tiempoAtencionColIndex === -1 || logContenidoColIndex === -1 || logTiempoRespuestaColIndex === -1) {
    Logger.log('Error: No se encontraron una o más de las columnas clave ("Nro de reporte", "Tiempo de atención", "Contenido del Mensaje" o "TEST_OK").');
    return;
  }
  
  // Obtener todos los datos de las hojas (excluyendo encabezados)
  const reportesData = reportesSheet.getRange(2, 1, reportesSheet.getLastRow() - 1, reportesSheet.getLastColumn()).getValues();
  const logData = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, logSheet.getLastColumn()).getValues();

  let actualizacionesRealizadas = 0;
  let filaEnLog = 2;

  // Recorrer cada fila de la hoja de log
  logData.forEach(logRow => {
    Logger.log(`--- Procesando fila ${filaEnLog} de 'Registro Telegram' ---`);
    const originalMessageContent = logRow[logContenidoColIndex];
    const tiempoAtencion = logRow[logTiempoRespuestaColIndex];
    
    // Si la columna de tiempo de atención no está vacía en el log
    if (tiempoAtencion) {
      const match = originalMessageContent.match(/#(\d+)/);
      
      // Si el contenido del mensaje contiene un número de reporte
      if (match && match[1]) {
        const reporteNumber = match[1];
        Logger.log(`Encontrado reporte #${reporteNumber}. Buscando en 'REPORTES'...`);
        
        // Buscar la fila correspondiente en la hoja de REPORTES
        let filaEnReportes = -1;
        for (let i = 0; i < reportesData.length; i++) {
          const reportesRow = reportesData[i];
          const reporteId = reportesRow[reporteIdColIndex];

          if (reporteId && reporteId.toString().trim() === reporteNumber) {
            filaEnReportes = i + 2; // +2 porque el rango empieza en la fila 2 y el array es 0-indexado
            break; 
          }
        }

        if (filaEnReportes !== -1) {
          // Se encontró la fila, sobrescribir el tiempo de atención
          reportesSheet.getRange(filaEnReportes, tiempoAtencionColIndex + 1).setValue(tiempoAtencion);
          reportesSheet.getRange(filaEnReportes, tiempoAtencionColIndex + 1).setNumberFormat('[h]:mm:ss');

          Logger.log(`ÉXITO: Reporte #${reporteNumber} actualizado en la fila ${filaEnReportes} con el tiempo: ${tiempoAtencion}`);
          actualizacionesRealizadas++;
        } else {
           Logger.log(`FALLO: No se encontró el reporte #${reporteNumber} en la hoja 'REPORTES'.`);
        }
      } else {
        Logger.log('FALLO: El contenido del mensaje no contiene un número de reporte válido (#número).');
      }
    } else {
       Logger.log('FALLO: La columna "TEST_OK" está vacía.');
    }
    filaEnLog++;
  });

  Logger.log(`Proceso de actualización finalizado. Se realizaron ${actualizacionesRealizadas} actualizaciones.`);
}
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// --- CONFIGURACIÓN PRINCIPAL para REPORTES ---
const SHEET_NAME_REPORTES = 'REPORTES';
const TEMPLATE_DOC_ID = '1HJ04h-uOmpMVDD1OB1jsepsI6oPFzUHxAagpS70-zT4';
const PDF_FOLDER_ID = '1mrVv1NBFq3dwN4nLcYNcSqczqXXUDWID';
const FORM_URL_REPORTES = 'https://docs.google.com/forms/d/e/1FAIpQLSesixjsfLxAcRm_SovX0lAu919J7VodWgrvfL1AJqMQK7Yvlw/viewform';
const QR_PLACEHOLDER = '{{QR}}';
const PDF_FILENAME_PREFIX = 'HOJA DE REPORTE #';

const FORM_FIELDS_REPORTES = {
  nroReporte: 'entry.615560205',
  codigoEquipo: 'entry.959519406',
  fecha: 'entry.33800714',
  hora: 'entry.1264527338',
  reporte: 'entry.160531109',
  na: 'entry.1190492680'
};

const COLUMN_HEADERS_REPORTES = {
  nroReporte: 'Nro de reporte',
  marcaTemporal: 'Marca temporal',
  fecha: 'Fecha (DD/MM/AA)',
  hora: 'Hora',
  nombreEquipo: 'Nombre del equipo',
  codigoEquipo: 'Código del equipo',
  sede: 'Ubicación',
  descripcion: 'Descripción de la anomalía presentada',
  personaReporta: 'Persona que reporta',
  pdfLink: 'PDF reporte',
  prefilledLink: 'Link Prellenado' 
};

// --- CONFIGURACIÓN PRINCIPAL para OT (SG) ---
const SHEET_NAME_OT = 'OT';
const FORM_URL_OT = 'https://docs.google.com/forms/d/e/1FAIpQLSesixjsfLxAcRm_SovX0lAu919J7VodWgrvfL1AJqMQK7Yvlw/viewform';

const FORM_FIELDS_OT = {
  nroOrden: 'entry.615560205',
  reporte: 'entry.160531109',
  codigoEquipo: 'entry.959519406',
  na: 'entry.1190492680'
};

const COLUMN_HEADERS_OT = {
  nroOrden: 'Nro de orden',
  prefilledLink: 'Link Prellenado' 
};

// --- CONFIGURACIÓN para INFORMES ---
const SHEET_NAME_INFORMES = 'INFORMES';
const INFORME_TEMPLATE_DOC_ID = '1dCiEdStzEFG0g-QIogZd69UjSw-M4_koMJF3SYR9Dvg';
const INFORME_PDF_FOLDER_ID = '13FiP9lUZRESAHMXbntvNnHl2QC5520Go'; 
const INFORME_PDF_FILENAME_PREFIX = 'HOJA DE INFORME ';

const COLUMN_HEADERS_INFORMES = [
  'Reporte/Orden de trabajo',
  'Código de actividad',
  'Código del equipo',
  'Fecha de culminación',
  'Hora de inicio',
  'Número',
  'Tiempo empleado',
  'Material utilizado',
  'Herramientas utilizadas',
  'Mano de obra utilizada',
  'Participantes',
  'Línea 1 A',
  'Línea 2 A',
  'Línea 3 A',
  'Capacitancia F',
  'Resistencia ohm',
  'Presión de alta Psi',
  'Presión de baja Psi',
  'Refrigerante',
  'Descripción del trabajo realizado',
  'Recomendaciones y observaciones',
  'Encargado',
  'PDF Informe'
];


/**
 * Función principal que se activa con la presentación de un formulario.
 * Dirige el flujo de trabajo según la hoja a la que llegan los datos.
 */
function onFormSubmit(e) {
  const sheetName = e.source.getActiveSheet().getName();
  
  if (sheetName === SHEET_NAME_REPORTES) {
    generarReportePdf(e);
  } else if (sheetName === SHEET_NAME_OT) {
    // AHORA LLAMAMOS A LA NUEVA FUNCIÓN UNIFICADA
    generarDocumentosYLinks(e);
  } else if (sheetName === SHEET_NAME_INFORMES) {
    generarInformePdf(e);
  }
}

/**
 * Genera un reporte en PDF a partir de una plantilla de Google Docs
 * para los datos de la hoja 'REPORTES'.
 */
/**
 * Genera un reporte en PDF y envía la notificación a Telegram.
 */
function generarReportePdf(e) {
  const sheet = e.source.getActiveSheet();
  const lastRow = e.range.getRow();
  try {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const headerMap = {};
    headers.forEach((header, index) => {
      headerMap[header] = index; // Usar índice base 0 para consistencia con arrays
    });

    const rowData = sheet.getRange(lastRow, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];

    // --- Lectura de los datos ---
    const nroReporte = rowData[headerMap[COLUMN_HEADERS_REPORTES.nroReporte]];
    const codigoEquipo = rowData[headerMap[COLUMN_HEADERS_REPORTES.codigoEquipo]];
    const marcaTemporalString = rowData[headerMap[COLUMN_HEADERS_REPORTES.marcaTemporal]];
    // ... (resto de las variables que necesites para el PDF/correo)
    const personaEmail = rowData[headerMap['Dirección de correo electrónico']];
    
    // --- Lógica para generar Link de Prellenado y PDF (sin cambios) ---
    // (Tu código original para crear el prefilledUrl, el PDF con el QR, etc. va aquí)
    // ... (copia tu lógica existente desde 'MANEJO ROBUSTO DE LA FECHA/HORA' hasta 'DriveApp.getFileById...')
    
    // --- MANEJO ROBUSTO DE LA FECHA/HORA ---
    const partes = marcaTemporalString.split(' ');
    const [dia, mes, anio] = partes[0].split('/').map(part => parseInt(part));
    const [horas, minutos, segundos] = partes[1].split(':').map(part => parseInt(part));
    const marcaTemporal = new Date(anio, mes - 1, dia, horas, minutos, segundos);
    if (isNaN(marcaTemporal.getTime())) {
      throw new Error("El valor en la columna 'Marca temporal' no es una fecha/hora válida.");
    }
    const spreadsheetTimeZone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
    const fechaMarcaTemporal = Utilities.formatDate(marcaTemporal, spreadsheetTimeZone, 'yyyy-MM-dd');
    const horaMarcaTemporal = Utilities.formatDate(marcaTemporal, spreadsheetTimeZone, 'HH:mm');

    // --- Generar el link de prellenado ---
    const prefilledUrl = `${FORM_URL_REPORTES}?` + `${FORM_FIELDS_REPORTES.nroReporte}=${encodeURIComponent(nroReporte)}&` + `${FORM_FIELDS_REPORTES.codigoEquipo}=${encodeURIComponent(codigoEquipo)}&` + `${FORM_FIELDS_REPORTES.fecha}=${encodeURIComponent(fechaMarcaTemporal)}&` + `${FORM_FIELDS_REPORTES.hora}=${encodeURIComponent(horaMarcaTemporal)}&` + `${FORM_FIELDS_REPORTES.reporte}=Reporte&` + `${FORM_FIELDS_REPORTES.na}=NA`;
    const formulaPrefilled = `=HYPERLINK("${prefilledUrl}", "Link del Reporte")`;
    sheet.getRange(lastRow, headerMap[COLUMN_HEADERS_REPORTES.prefilledLink] + 1).setFormula(formulaPrefilled);
    
    // --- Generar el PDF ---
    // (Asegúrate de que esta parte de tu código original esté aquí)
    const qrCodeApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(prefilledUrl)}`;
    const qrImageBlob = UrlFetchApp.fetch(qrCodeApiUrl).getBlob();
    const docTemplateFile = DriveApp.getFileById(TEMPLATE_DOC_ID);
    const pdfFolder = DriveApp.getFolderById(PDF_FOLDER_ID);
    const newDocFile = docTemplateFile.makeCopy(`${PDF_FILENAME_PREFIX}${nroReporte}`);
    const newDoc = DocumentApp.openById(newDocFile.getId());
    const body = newDoc.getBody();
    body.replaceText('{{Nro de reporte}}', nroReporte);
    body.replaceText('{{Fecha}}', rowData[headerMap[COLUMN_HEADERS_REPORTES.fecha]]);
    body.replaceText('{{Hora}}', rowData[headerMap[COLUMN_HEADERS_REPORTES.hora]]);
    body.replaceText('{{Nombre del equipo}}', rowData[headerMap[COLUMN_HEADERS_REPORTES.nombreEquipo]]);
    body.replaceText('{{Código del equipo}}', codigoEquipo);
    body.replaceText('{{Sede}}', rowData[headerMap[COLUMN_HEADERS_REPORTES.sede]]);
    body.replaceText('{{Descripción}}', rowData[headerMap[COLUMN_HEADERS_REPORTES.descripcion]]);
    body.replaceText('{{Persona que reporta}}', rowData[headerMap[COLUMN_HEADERS_REPORTES.personaReporta]]);
    const qrPlaceholder = body.findText(QR_PLACEHOLDER);
    if (qrPlaceholder) {
      const element = qrPlaceholder.getElement();
      const parent = element.getParent();
      parent.insertInlineImage(parent.getChildIndex(element), qrImageBlob);
      element.removeFromParent();
    }
    newDoc.saveAndClose();
    const pdfFile = newDocFile.getAs(MimeType.PDF);
    const pdf = pdfFolder.createFile(pdfFile).setName(`${PDF_FILENAME_PREFIX}${nroReporte}.pdf`);
    const formulaPDF = `=HYPERLINK("${pdf.getUrl()}", "HOJA DE REPORTE #${nroReporte}")`;
    sheet.getRange(lastRow, headerMap[COLUMN_HEADERS_REPORTES.pdfLink] + 1).setFormula(formulaPDF);
    DriveApp.getFileById(newDocFile.getId()).setTrashed(true);
    // --- Fin de la lógica de generación ---

    // =================== LÓGICA DE NOTIFICACIÓN INMEDIATA ===================
    // 1. Forzar la actualización de la hoja para que las fórmulas se calculen
    SpreadsheetApp.flush(); 
    Utilities.sleep(2000); // Pausa para asegurar que la hoja se actualice

    // 2. Volver a leer la fila para obtener los datos finales (incluyendo el link)
    const finalRowDisplay = sheet.getRange(lastRow, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    const finalRowFormulas = sheet.getRange(lastRow, 1, 1, sheet.getLastColumn()).getFormulas()[0];
    const logSheet = sheet.getParent().getSheetByName(SHEET_LOG_NAME);
    
    // 3. Llamar a la función para enviar y registrar el reporte
    if(logSheet) {
      sendAndLogInitialReport(finalRowDisplay, finalRowFormulas, headerMap, logSheet);
    }
    // ========================================================================

    // --- Envío de correo electrónico (sin cambios) ---
    const subject = `Generado Reporte #${nroReporte}`;
    const bodyEmail = `Tu reporte ha sido recibido.\n\nPuedes visualizar el PDF generado en este enlace:\n${pdf.getUrl()}\n\nPor favor, espera a ser atendido antes de realizar otro reporte. Gracias.\n\nDepartamento de Mantenimiento Mecánico y Servicios Generales.`;
    MailApp.sendEmail(personaEmail, subject, bodyEmail);
    Logger.log(`Correo de confirmación enviado a ${personaEmail} para el reporte #${nroReporte}`);

  } catch (error) {
    Logger.log(`Error en generarReportePdf para la fila ${lastRow}: ` + error.toString());
    // ... tu manejo de errores
  }
}


/**
 * Genera un informe en PDF a partir de una plantilla
 * para los datos de la hoja 'INFORMES'.
 */
function generarInformePdf(e) {
  const sheet = e.source.getActiveSheet();
  const lastRow = e.range.getRow();

  try {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const headerMap = {};
    headers.forEach((header, index) => {
      headerMap[`{{${header}}}`] = index + 1;
    });

    const rowValues = sheet.getRange(lastRow, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    
    const reporteOrden = rowValues[headers.indexOf('Reporte/Orden de trabajo')];
    const informeNumber = rowValues[headers.indexOf('Número')];
    
    const pdfFilename = `${INFORME_PDF_FILENAME_PREFIX}${reporteOrden} ${informeNumber}`;

    const docTemplateFile = DriveApp.getFileById(INFORME_TEMPLATE_DOC_ID);
    const pdfFolder = DriveApp.getFolderById(INFORME_PDF_FOLDER_ID);
    const newDocFile = docTemplateFile.makeCopy(pdfFilename);
    const newDoc = DocumentApp.openById(newDocFile.getId());
    const body = newDoc.getBody();

    COLUMN_HEADERS_INFORMES.forEach(headerName => {
      const placeholder = `{{${headerName}}}`;
      const colIndex = headers.indexOf(headerName);
      
      if (colIndex !== -1) {
        const value = rowValues[colIndex] || '';
        body.replaceText(placeholder, value);
      } else {
        Logger.log(`ADVERTENCIA: No se encontró una columna que coincida con el marcador '${placeholder}'.`);
      }
    });

    newDoc.saveAndClose();

    const pdfFile = newDocFile.getAs(MimeType.PDF);
    const pdf = pdfFolder.createFile(pdfFile).setName(`${pdfFilename}.pdf`);

    const linkTextPDF = pdfFilename;
    const formulaPDF = `=HYPERLINK("${pdf.getUrl()}", "${linkTextPDF}")`;
    const pdfLinkColIndex = headers.indexOf('PDF Informe') + 1;
    if (pdfLinkColIndex > 0) {
      sheet.getRange(lastRow, pdfLinkColIndex).setFormula(formulaPDF);
    } else {
      Logger.log('Error: La columna "PDF Informe" no se encontró en la hoja "INFORMES".');
    }

    DriveApp.getFileById(newDocFile.getId()).setTrashed(true);
    Logger.log(`Informe PDF para el Número '${informeNumber}' generado y guardado.`);

    // --- LÓGICA DE ENVÍO DE CORREO INTEGRADA AQUÍ ---
    // 1. Obtener la hoja de "REPORTES" y su data
    const spreadsheet = sheet.getParent();
    const reportesSheet = spreadsheet.getSheetByName('REPORTES');
    const reportesData = reportesSheet.getDataRange().getValues();
    const reportesHeaders = reportesData[0];
    
    const reporteIdColIndex = reportesHeaders.indexOf('Nro de reporte');
    const emailColIndex = reportesHeaders.indexOf('Dirección de correo electrónico');
    
    let userEmail = null;

    // 2. Buscar el correo electrónico en la hoja de REPORTES
    for (let i = 1; i < reportesData.length; i++) {
      const row = reportesData[i];
      if (String(row[reporteIdColIndex]).trim() === String(informeNumber).trim()) {
        userEmail = row[emailColIndex];
        break;
      }
    }
    
    // 3. Enviar el correo si se encontró el email
    if (userEmail && userEmail.length > 0) {
      const subject = `Informe de culminación del reporte #${informeNumber}`;
      const body = `Tu reporte #${informeNumber} ha sido completado. Aquí puedes ver el informe de culminación:\n${pdf.getUrl()}\n\nDe no estar conforme con el trabajo realizado, por favor realizar otra vez el proceso de reporte. Gracias\n\nDepartamento de Mantenimiento Mecánico y Servicios Generales.`;

      MailApp.sendEmail(userEmail, subject, body);
      Logger.log(`Correo del informe enviado a ${userEmail} para el reporte #${informeNumber}`);
    } else {
      Logger.log(`No se pudo enviar el correo del informe: no se encontró el correo del usuario para el reporte #${informeNumber}.`);
    }

  } catch (error) {
    Logger.log(`Error en generarInformePdf para la fila ${lastRow}: ` + error.toString());
  }
}



/**
 * Se activa al enviar el formulario de "Órdenes de Trabajo".
 * Esta función consolida la creación del número de orden, el enlace de prellenado y el PDF.
 * @param {object} e El objeto del evento de envío del formulario.
 */
function generarDocumentosYLinks(e) {
  // --- INICIO BLOQUEO DE SEGURIDAD ---
  const lock = LockService.getScriptLock();
  try {
      lock.waitLock(30000); 
  } catch (e) {
      Logger.log('No se pudo obtener el bloqueo, inténtelo de nuevo.');
      return; 
  }
  // -----------------------------------

  const sheet = e.source.getActiveSheet();
  const lastRow = e.range.getRow();

  const NOMBRE_HOJA_OT = 'OT';

  if (sheet.getName() !== NOMBRE_HOJA_OT) {
    return;
  }

  try {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const headerMap = {};
    headers.forEach((header, index) => {
      headerMap[header.trim().toLowerCase()] = index + 1;
    });

    // --- Definición de nombres de columnas ---
    const NRO_DE_ORDEN_HEADER = 'Nro de orden';
    const LINK_PRELLENADO_HEADER = 'Link Prellenado';
    const PDF_OT_HEADER = 'PDF OT';
    const NRO_DE_CICLO_HEADER = 'Nro del ciclo';
    
    // Encabezados para Equipo y Actividad
    const CODIGO_EQUIPO_HEADER = 'Código de equipo';
    const CODIGO_ACTIVIDAD_HEADER = 'Código de actividad';

    // Función auxiliar para obtener índices
    function getColumnIndex(headerName) {
      const index = headers.indexOf(headerName);
      if (index === -1) {
        throw new Error(`Columna clave no encontrada: '${headerName}'. Verifica el nombre en tu hoja.`);
      }
      return index + 1; 
    }

    // --- Obtención de índices ---
    const nroOrdenColIndex = getColumnIndex(NRO_DE_ORDEN_HEADER);
    const linkPrellenadoColIndex = getColumnIndex(LINK_PRELLENADO_HEADER);
    const pdfOtColIndex = getColumnIndex(PDF_OT_HEADER);
    const nroCicloColIndex = getColumnIndex(NRO_DE_CICLO_HEADER);
    const codigoEquipoColIndex = getColumnIndex(CODIGO_EQUIPO_HEADER);
    const codigoActividadColIndex = getColumnIndex(CODIGO_ACTIVIDAD_HEADER);

    // --- CORRECCIÓN 1: SI YA TIENE NÚMERO, NO HACER NADA ---
    // Esto evita que si el script corre dos veces, cambie el número 8 por el 9.
    const valorExistente = sheet.getRange(lastRow, nroOrdenColIndex).getValue();
    if (valorExistente && valorExistente !== "") {
        Logger.log("La orden ya tiene número asignado. Se detiene la ejecución.");
        return;
    }

    const templateIds = {
      'Ciclo 1': '1KPW-pYIiFpDrbu9NM6bGYgrJl88UM8Pkc911VysLSos',
      'Ciclo 2': '1f89-5LUcTX1UtgBWwxjLXpSYSIc3-P3xORVb6JxwrYM',
      'Ciclo 3': '1hBUHXQ-sNx8o5joVZiZmtltAShsmnWcZ9ZTh4OWd-t8',
      'Ciclo 4': '1jkCjaj9YJC01WW0Wpb7z17o3AH-glVwmEAmLOw44mUw',
      'Actividades (1-15)': '1CSFGK89q_dLpCtOTQ4MpVdkXLlf4GEld8tT56Ric628',
      'Actividades (16-40)': '1R2usn6ofb_pffjNnGADq8R7HkNwI1NJFp4FdLY1BnBE',
      'Actividad (MM)': '1RoYIChQJ0B4PfFsoAhCXTwqwODf-RrFplLSWvkIYjTo'
    };

    // --- 1. Determinar grupo y obtener el siguiente número de orden ---
    const tipoOrden = sheet.getRange(lastRow, nroCicloColIndex).getDisplayValue();
    let grupo;
    if (tipoOrden === 'Actividad (MM)') {
      grupo = 'MM';
    } else {
      grupo = 'SG';
    }
    
    // --- CORRECCIÓN 2: PASAMOS 'lastRow' A LA FUNCIÓN ---
    // Le enviamos la fila actual para que la ignore al contar
    const numeroOT = getNextSequentialNumber(grupo, sheet, headers, lastRow);

    // --- 2. Escribir el número de orden en la hoja ---
    sheet.getRange(lastRow, nroOrdenColIndex).setValue(numeroOT);

    // --- 3. Generar y escribir el enlace de prellenado ---
    const valorEquipo = sheet.getRange(lastRow, codigoEquipoColIndex).getDisplayValue();
    const valorActividad = sheet.getRange(lastRow, codigoActividadColIndex).getDisplayValue();

    let grupoParaLink;
    if (tipoOrden === 'Actividad (MM)') {
      grupoParaLink = 'Orden de trabajo (MM)';
    } else {
      grupoParaLink = 'Orden de trabajo (SG)';
    }

    const prefilledUrl = `${FORM_URL_OT}?` +
      `${FORM_FIELDS_OT.reporte}=${encodeURIComponent(grupoParaLink)}&` +
      `${FORM_FIELDS_OT.nroOrden}=${encodeURIComponent(numeroOT)}&` +
      `${FORM_FIELDS_OT.codigoEquipo}=${encodeURIComponent(valorEquipo)}&` +
      `${FORM_FIELDS_OT.na}=${encodeURIComponent(valorActividad)}`;

    const linkText = `Link de OT (${tipoOrden === 'Actividad (MM)' ? 'MM' : 'SG'})`;
    const formulaPrellenado = `=HYPERLINK("${prefilledUrl}", "${linkText}")`;
    sheet.getRange(lastRow, linkPrellenadoColIndex).setFormula(formulaPrellenado);

    // --- 4. Generar y escribir el PDF ---
    const templateId = templateIds[tipoOrden];
    if (!templateId) {
      // Si no hay template, no falla, solo avisa
      Logger.log(`No se encontró template para ${tipoOrden}, pero el número se generó bien.`);
    } else {
        const docTemplateFile = DriveApp.getFileById(templateId);
        const pdfFolder = DriveApp.getFolderById('1S13m47Ct2wIz0Is_sWh1qK5zacV-UGo7');

        const newDocFile = docTemplateFile.makeCopy(`Orden de Trabajo ${grupo} N° ${numeroOT}`);
        const newDoc = DocumentApp.openById(newDocFile.getId());
        const body = newDoc.getBody();

        const fieldsToReplace = [
          'Nro de orden', 'Fecha de expedición', 'Fecha de inicio',
          'Fecha de culminación', 'Ubicación', 'Hora de inicio',
          'Hora de culminación', 'Encargado', 'Prioridad', 'Tipo de mantenimiento', 'Herramientas', 'Materiales', 'Costo Total Estimado', 'Personal requerido', 'Código de equipo', 'Código de actividad','Nombre del equipo'
        ];

        fieldsToReplace.forEach(headerName => {
          const colIndex = headers.indexOf(headerName);
          if (colIndex !== -1) {
            const value = sheet.getRange(lastRow, colIndex + 1).getDisplayValue();
            body.replaceText(`{{${headerName}}}`, value);
          }
        });

        for (let i = 1; i <= 40; i++) {
          const actividadKey = `Actividad ${i}`;
          const colIndex = headers.indexOf(actividadKey);
          if (colIndex !== -1) {
            const actividadValue = sheet.getRange(lastRow, colIndex + 1).getDisplayValue();
            body.replaceText(`{{${actividadKey}}}`, actividadValue);
          }
        }

        newDoc.saveAndClose();
        const pdfFile = newDocFile.getAs(MimeType.PDF);
        const pdf = pdfFolder.createFile(pdfFile).setName(`Orden de Trabajo ${grupo} N° ${numeroOT}.pdf`);

        DriveApp.getFileById(newDocFile.getId()).setTrashed(true);

        const linkTextPDF = `ORDEN DE TRABAJO (${grupo}) N° ${numeroOT}`;
        const formulaPDF = `=HYPERLINK("${pdf.getUrl()}", "${linkTextPDF}")`;
        sheet.getRange(lastRow, pdfOtColIndex).setFormula(formulaPDF);
    }

    Logger.log(`Todos los documentos y enlaces generados para la orden: ${numeroOT}.`);

  } catch (error) {
    Logger.log(`Error en generarDocumentosYLinks para la fila ${lastRow}: ` + error.toString());
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const pdfOtColIndex = headers.indexOf(PDF_OT_HEADER);
    if (pdfOtColIndex !== -1) {
      sheet.getRange(lastRow, pdfOtColIndex + 1).setValue('ERROR: ' + error.message);
    }
  }
}

/**
 * Función auxiliar para obtener el siguiente número secuencial.
 * CORREGIDA: Recibe ignoreRowIndex para no contarse a sí misma.
 */
function getNextSequentialNumber(grupo, sheet, headers, ignoreRowIndex) {
  const nroOrdenColIndex = headers.indexOf('Nro de orden');
  const nroCicloColIndex = headers.indexOf('Nro del ciclo');
  
  if (nroOrdenColIndex === -1 || nroCicloColIndex === -1) {
    return 1;
  }

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  let maxNumber = 0;

  for (let i = 0; i < data.length; i++) {
    // Fila real en la hoja (i + 2 porque el array data empieza en 0 y la hoja tiene header)
    const currentRowNum = i + 2;

    // --- CORRECCIÓN 3: IGNORAR LA FILA ACTUAL ---
    // Si esta fila es la que estamos editando, la saltamos para no leer el número incorrecto
    if (currentRowNum === ignoreRowIndex) {
        continue; 
    }

    const row = data[i];
    const nroOrden = row[nroOrdenColIndex];
    const nroCiclo = row[nroCicloColIndex];

    let rowGrupo = '';
    if (nroCiclo === 'Actividad (MM)') {
        rowGrupo = 'MM';
    } else {
        rowGrupo = 'SG'; 
    }
    
    if (rowGrupo === grupo && typeof nroOrden === 'number' && !isNaN(nroOrden) && nroOrden > 0) {
      if (nroOrden > maxNumber) {
        maxNumber = nroOrden;
      }
    }
  }

  return maxNumber + 1;
}
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
function sincronizarTiemposTelegram() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // --- FUNCIÓN DE UTILIDAD PARA BUSCAR COLUMNAS DE FORMA ROBUSTA ---
  const getColumnIndex = (headers, columnName) => {
    const normalizedSearch = columnName.trim().toUpperCase();
    for (let i = 0; i < headers.length; i++) {
      if (String(headers[i]).trim().toUpperCase() === normalizedSearch) {
        return i;
      }
    }
    return -1;
  };
  // -----------------------------------------------------------------

  // --- FUNCIÓN DE UTILIDAD PARA LIMPIEZA DE TIEMPO/VACÍO Y FORZAR MILISEGUNDOS ---
  const cleanTimeValue = (value) => {
    let stringValue = String(value).trim();
    
    if (stringValue === "") {
        return "";
    }
    
    // Si el valor es una duración sin milisegundos (ej: "57:42:00"), se los añadimos.
    if (stringValue.match(/^\d{1,}:[0-5]\d:[0-5]\d$/)) {
        return stringValue + ".000";
    }
    
    return stringValue;
  };
  // -----------------------------------------------------------------


  // --- 1. CONFIGURACIÓN Y OBTENCIÓN DE HOJAS ---
  const hojaReportes = ss.getSheetByName("REPORTES");
  const hojaTelegram = ss.getSheetByName("Registro Telegram");

  if (!hojaReportes || !hojaTelegram) {
    Logger.log("Error: Faltan hojas. Verifica los nombres 'REPORTES' y 'Registro Telegram'.");
    return;
  }

  // --- 2. LEER DATOS DE ORIGEN (TELEGRAM) ---
  const datosTelegram = hojaTelegram.getDataRange().getDisplayValues();
  const headersTelegram = datosTelegram[0];
  
  const colIndexMensaje = getColumnIndex(headersTelegram, "Contenido del Mensaje");
  const colIndexTestOK = getColumnIndex(headersTelegram, "TEST_OK");
  const colIndexFechaReenvio = getColumnIndex(headersTelegram, "Tiempo de Respuesta (HH:MM:SS)");

  if (colIndexMensaje === -1 || colIndexTestOK === -1 || colIndexFechaReenvio === -1) {
    Logger.log("Error: No se encuentran todas las columnas necesarias en 'Registro Telegram' para la sincronización de tiempos.");
    return;
  }

  // --- 3. PROCESAR DATOS DE TELEGRAM (MAPEO Y CONJUNTO PARA AUDITORÍA) ---
  let mapaTiempos = {};
  let idsTelegramSet = new Set(); 

  for (let i = 1; i < datosTelegram.length; i++) {
    let mensaje = datosTelegram[i][colIndexMensaje];
    let tiempoTestOK = cleanTimeValue(datosTelegram[i][colIndexTestOK]); 
    let tiempoReenvio = cleanTimeValue(datosTelegram[i][colIndexFechaReenvio]);

    let valorATransferir = ""; 

    if (tiempoTestOK !== "") {
        valorATransferir = tiempoTestOK;
    } else if (tiempoReenvio !== "") {
        valorATransferir = tiempoReenvio;
    } 

    let match = mensaje.toString().match(/#(\d+)/);

    if (match && match[1]) {
      let numeroReporte = match[1]; 
      mapaTiempos[numeroReporte] = valorATransferir; 
      idsTelegramSet.add(numeroReporte);
    }
  }

  // --- 4. LEER DATOS DE HOJA DESTINO (REPORTES) ---
  const rangoReportes = hojaReportes.getDataRange();
  const datosReportes = rangoReportes.getValues(); 
  
  const headersReportes = datosReportes[0];

  const colIndexNroReporte = getColumnIndex(headersReportes, "Nro de reporte");
  const colIndexFechaDemora = getColumnIndex(headersReportes, "Fecha inicio de demora");
  
  // *** QUITAMOS LA REFERENCIA A colIndexEstadoAuditoria ***

  if (colIndexNroReporte === -1 || colIndexFechaDemora === -1) {
    // El mensaje de error es más simple ahora
    Logger.log("Error: No se encuentran las columnas necesarias ('Nro de reporte' o 'Fecha inicio de demora') en 'REPORTES'.");
    return;
  }
  
  const FILA_INICIAL = 2;

  if (hojaReportes.getLastRow() < FILA_INICIAL) {
    Logger.log("No hay datos en la hoja REPORTES para procesar.");
    return;
  }


  // --- 5. SINCRONIZACIÓN Y AUDITORÍA COMBINADA (Escribiendo solo en Fecha inicio de demora) ---
  let columnaTiemposSalida = [];

  for (let i = 1; i < datosReportes.length; i++) {
    const nroReporteActual = String(datosReportes[i][colIndexNroReporte]).trim();
    
    let valorParaFechaDemora;

    // --- LÓGICA DE AUDITORÍA ---
    if (nroReporteActual === "") {
        // Si no hay ID, mantenemos el valor de la columna de demora
        valorParaFechaDemora = datosReportes[i][colIndexFechaDemora];
        
    } else if (!idsTelegramSet.has(nroReporteActual)) {
        // CASO CRÍTICO: NO ENCONTRADO EN TELEGRAM
        // Escribir "no enviado" en la columna "Fecha inicio de demora"
        valorParaFechaDemora = "NO ENVIADO";
        
    } else {
        // CASO OK: ENCONTRADO EN TELEGRAM (SINCRONIZACIÓN DE TIEMPOS)
        valorParaFechaDemora = mapaTiempos.hasOwnProperty(nroReporteActual) 
                                ? mapaTiempos[nroReporteActual] 
                                : datosReportes[i][colIndexFechaDemora];
    }
    
    columnaTiemposSalida.push([valorParaFechaDemora]);
  }

  // --- 6. ESCRIBIR RESULTADOS ---
  
  // Escribir resultados en "Fecha inicio de demora"
  if (columnaTiemposSalida.length > 0) {
    const rangoDestino = hojaReportes.getRange(FILA_INICIAL, colIndexFechaDemora + 1, columnaTiemposSalida.length, 1);
    
    // Es crucial forzar el formato de texto (@) para que "no enviado" no se convierta en una fecha
    rangoDestino.setNumberFormat("@"); 
    rangoDestino.setValues(columnaTiemposSalida);
  }
  
  Logger.log("Proceso completo: Sincronización de tiempos y Auditoría de Telegram finalizados con éxito.");
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////
function auditarYReconstruirConDiferencias() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetReportes = ss.getSheetByName("REPORTES");
  const sheetRegistro = ss.getSheetByName("Registro Telegram");

  if (!sheetReportes || !sheetRegistro) return;

  const dataReportes = sheetReportes.getDataRange().getDisplayValues();
  const formulasReportes = sheetReportes.getDataRange().getFormulas();
  const headersReportes = dataReportes[0];
  const mapReportes = {};
  headersReportes.forEach((h, i) => mapReportes[h] = i);

  const reporteDiccionario = {};
  const idColName = "Nro de reporte"; 
  const idIdx = mapReportes[idColName];
  for (let i = 1; i < dataReportes.length; i++) {
    const id = String(dataReportes[i][idIdx]);
    if (id) reporteDiccionario[id] = { display: dataReportes[i], formulas: formulasReportes[i] };
  }

  const dataRegistro = sheetRegistro.getDataRange().getValues();
  const headersRegistro = dataRegistro[0];
  
  const idxContenido = headersRegistro.indexOf("Contenido del Mensaje");
  const idxRevision = headersRegistro.indexOf("Revision de mensajes");
  const idxDiferencia = headersRegistro.indexOf("Diferencia de Mensajes");

  if (idxContenido === -1 || idxRevision === -1 || idxDiferencia === -1) {
    Logger.log("❌ Error: Faltan columnas en Registro Telegram.");
    return;
  }

  const batchRevision = [];
  const batchDiferencia = [];

  for (let i = 1; i < dataRegistro.length; i++) {
    const msjOriginal = String(dataRegistro[i][idxContenido]);
    const matchId = msjOriginal.match(/#(\w+)/);
    
    let mensajeNuevo = "";
    let reporteCambios = "";

    if (matchId && matchId[1]) {
      const id = matchId[1];
      const datosNuevos = reporteDiccionario[id];

      if (datosNuevos) {
        let listaDiferencias = [];
        mensajeNuevo = `<b>📢 ¡Nuevo Reporte! #${id} 📢</b>\n\n`;

        COLUMNA_HEADERS_A_ENVIAR.forEach(header => {
          const colIdx = mapReportes[header];
          let valorNuevo = datosNuevos.display[colIdx];

          if (header === HEADER_LINK_PRELLENADO) {
            const formula = datosNuevos.formulas[colIdx];
            const urlMatch = formula ? formula.match(/=HYPERLINK\("([^"]+)"/) : null;
            valorNuevo = urlMatch ? `<a href="${urlMatch[1]}">Abrir formulario</a>` : valorNuevo;
          }

          mensajeNuevo += `<b><u>${header}</u></b>:\n${valorNuevo}\n\n`;

          // --- MEJORA AQUÍ: Escapar caracteres especiales como los paréntesis ---
          const headerEscapado = header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regexBusqueda = new RegExp(`<b><u>${headerEscapado}<\/u><\/b>:\n([^]*?)(?=\n\n|$)`);
          
          const matchViejo = msjOriginal.match(regexBusqueda);
          const valorViejo = matchViejo ? matchViejo[1].trim() : "No encontrado";

          if (valorViejo !== String(valorNuevo).trim()) {
            listaDiferencias.push(`• [${header}]:\n  V: "${valorViejo}"\n  N: "${valorNuevo}"`);
          }
        });

        reporteCambios = listaDiferencias.length > 0 
          ? `⚠️ CAMBIOS (${listaDiferencias.length}):\n${listaDiferencias.join("\n")}`
          : "✅ Sin cambios";
      } else {
        mensajeNuevo = "❌ Error: ID no encontrado";
        reporteCambios = "No encontrado en REPORTES";
      }
    }

    batchRevision.push([mensajeNuevo]);
    batchDiferencia.push([reporteCambios]);
  }

  sheetRegistro.getRange(2, idxRevision + 1, batchRevision.length, 1).setValues(batchRevision);
  sheetRegistro.getRange(2, idxDiferencia + 1, batchDiferencia.length, 1).setValues(batchDiferencia);
  
  Logger.log("✅ Auditoría corregida ejecutada.");
}
function reconstruirMensajesManual() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // --- 1. Configuración de Hojas ---
  const sheetReportes = ss.getSheetByName("REPORTES");
  const sheetRegistro = ss.getSheetByName("Registro Telegram");

  if (!sheetReportes || !sheetRegistro) {
    Logger.log("❌ Error: No se encontraron las hojas 'REPORTES' o 'Registro Telegram'.");
    return;
  }

  const COL_ID_REPORTE = "Nro de reporte"; 
  const COL_CONTENIDO_MSJ = "Contenido del Mensaje";
  const COL_REVISION_MSJ = "Revision de mensajes";

  // --- 2. Leer Datos de REPORTES ---
  // getDisplayValues asegura que la fecha "20/12/2025" se lea como texto y no como objeto Date
  const dataReportes = sheetReportes.getDataRange().getDisplayValues(); 
  const formulasReportes = sheetReportes.getDataRange().getFormulas();
  const headersReportes = dataReportes[0];

  const mapHeadersReportes = {};
  headersReportes.forEach((header, index) => mapHeadersReportes[header] = index);

  const indexIdReporte = mapHeadersReportes[COL_ID_REPORTE];
  if (indexIdReporte === undefined) {
    Logger.log("❌ Error: No se encontró la columna '" + COL_ID_REPORTE + "' en REPORTES.");
    return;
  }

  // --- 3. Indexar Reportes ---
  const reportesIndexados = {};
  for (let i = 1; i < dataReportes.length; i++) {
    const id = String(dataReportes[i][indexIdReporte]); 
    if (id) {
      reportesIndexados[id] = {
        rowDisplay: dataReportes[i],
        rowFormulas: formulasReportes[i]
      };
    }
  }

  // --- 4. Leer Registro Telegram ---
  const dataRegistro = sheetRegistro.getDataRange().getValues();
  const headersRegistro = dataRegistro[0];

  const indexColContenido = headersRegistro.indexOf(COL_CONTENIDO_MSJ);
  const indexColRevision = headersRegistro.indexOf(COL_REVISION_MSJ);

  if (indexColContenido === -1 || indexColRevision === -1) {
    Logger.log("❌ Error: Faltan columnas en Registro Telegram (Contenido o Revision).");
    return;
  }

  const resultadosParaEscribir = [];

  // --- 5. Reconstruir ---
  for (let i = 1; i < dataRegistro.length; i++) {
    const mensajeOriginal = dataRegistro[i][indexColContenido];
    let mensajeReconstruido = "";

    // Regex para capturar el ID después del #
    const matchId = mensajeOriginal.toString().match(/#(\w+)/);

    if (matchId && matchId[1]) {
      const idBuscado = matchId[1];
      const datos = reportesIndexados[idBuscado];

      if (datos) {
        // Reconstrucción idéntica al formato original
        let fullMessage = `<b>📢 ¡Nuevo Reporte! #${idBuscado} 📢</b>\n\n`;

        COLUMNA_HEADERS_A_ENVIAR.forEach(headerName => {
          const colIndex = mapHeadersReportes[headerName];
          
          if (colIndex !== undefined) {
            const valorVisible = datos.rowDisplay[colIndex];
            
            if (headerName === HEADER_LINK_PRELLENADO) {
              const formula = datos.rowFormulas[colIndex];
              const urlMatch = formula ? formula.match(/=HYPERLINK\("([^"]+)"/) : null;
              
              if (urlMatch && urlMatch[1]) {
                 fullMessage += `<b><u>${headerName}</u></b>:\n<a href="${urlMatch[1]}">Abrir formulario</a>\n\n`;
              } else {
                 fullMessage += `<b><u>${headerName}</u></b>:\n${valorVisible}\n\n`;
              }
            } else {
              fullMessage += `<b><u>${headerName}</u></b>:\n${valorVisible}\n\n`;
            }
          }
        });
        mensajeReconstruido = fullMessage;
      } else {
        mensajeReconstruido = "⚠️ ID #" + idBuscado + " no hallado en REPORTES.";
      }
    } else {
      mensajeReconstruido = ""; 
    }
    resultadosParaEscribir.push([mensajeReconstruido]);
  }

  // --- 6. Escribir Resultados ---
  if (resultadosParaEscribir.length > 0) {
    sheetRegistro.getRange(2, indexColRevision + 1, resultadosParaEscribir.length, 1)
                 .setValues(resultadosParaEscribir);
    Logger.log("✅ Actualización completada exitosamente.");
  }
}
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * Analiza la columna "Nro de reporte" en la hoja REPORTES.
 * Solo informa en el log de ejecución si hay saltos, duplicados o desorden.
 */
function verificarIntegridadSecuencia() {
  const nombreHoja = "REPORTES";
  const nombreColumna = "Nro de reporte";
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName(nombreHoja);
  
  if (!hoja) {
    Logger.log("❌ ERROR: No se encontró la hoja '" + nombreHoja + "'");
    return;
  }

  // 1. Obtener todos los datos de la hoja
  const datos = hoja.getDataRange().getValues();
  const cabeceras = datos[0];
  const indiceCol = cabeceras.indexOf(nombreColumna);

  if (indiceCol === -1) {
    Logger.log("❌ ERROR: No existe la columna '" + nombreColumna + "'");
    return;
  }

  // 2. Extraer números y sus posiciones reales (fila de la hoja)
  // Guardamos un objeto con el valor y el número de fila para informar con precisión
  const listaNumeros = [];
  for (let i = 1; i < datos.length; i++) {
    const valor = datos[i][indiceCol];
    if (valor !== "" && !isNaN(valor)) {
      listaNumeros.push({
        valor: Number(valor),
        fila: i + 1
      });
    }
  }

  if (listaNumeros.length < 2) {
    Logger.log("ℹ️ INFO: No hay suficientes datos para comparar una secuencia.");
    return;
  }

  Logger.log("--- INICIANDO AUDITORÍA DE COLUMNA: " + nombreColumna + " ---");
  let tieneErrores = false;

  // 3. Comparar cada número con el anterior
  for (let j = 1; j < listaNumeros.length; j++) {
    const anterior = listaNumeros[j - 1];
    const actual = listaNumeros[j];

    // Caso A: El número es igual al anterior (Duplicado)
    if (actual.valor === anterior.valor) {
      Logger.log(`⚠️ DUPLICADO: El número ${actual.valor} aparece repetido en la fila ${actual.fila}.`);
      tieneErrores = true;
    } 
    // Caso B: El número es menor al anterior (Desorden cronológico/numérico)
    else if (actual.valor < anterior.valor) {
      Logger.log(`🚨 DESORDEN: El número ${actual.valor} (fila ${actual.fila}) es menor que el anterior ${anterior.valor} (fila ${anterior.fila}).`);
      tieneErrores = true;
    }
    // Caso C: El número es mayor pero no consecutivo (Salto en la secuencia)
    else if (actual.valor > anterior.valor + 1) {
      Logger.log(`🔍 SALTO DETECTADO: Entre la fila ${anterior.fila} (#${anterior.valor}) y la fila ${actual.fila} (#${actual.valor}) faltan números.`);
      tieneErrores = true;
    }
  }

  if (!tieneErrores) {
    Logger.log("✅ EXCELENTE: La columna está en orden ascendente perfecto y sin saltos.");
  } else {
    Logger.log("--- FIN DE LA AUDITORÍA: Se detectaron inconsistencias arriba mencionadas ---");
  }
}