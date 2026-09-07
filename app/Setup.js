/**
 * Crea la estructura inicial de la base. Puede ejecutarse mas de una vez:
 * agrega hojas o columnas faltantes, pero nunca elimina datos.
 */
function configurarBaseDeDatos() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const spreadsheet = abrirBaseDatos_();
    spreadsheet.setSpreadsheetTimeZone(APP_CONFIG.TIME_ZONE);

    Object.keys(SHEET_SCHEMAS).forEach(function(sheetName) {
      asegurarHoja_(spreadsheet, sheetName, SHEET_SCHEMAS[sheetName]);
    });

    cargarConfiguracionInicial_();
    cargarCatalogosIniciales_();
    eliminarHojaInicialVacia_(spreadsheet);
    SpreadsheetApp.flush();

    spreadsheet.toast(
      'Estructura creada correctamente en "' + spreadsheet.getName() + '".',
      'Mantenimiento PDT',
      8
    );

    const resultado = obtenerEstadoInstalacion();
    console.log(JSON.stringify(resultado));
    return resultado;
  } finally {
    lock.releaseLock();
  }
}

function asegurarHoja_(spreadsheet, sheetName, requiredHeaders) {
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  const lastColumn = sheet.getLastColumn();
  const currentHeaders = lastColumn > 0
    ? sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0]
    : [];
  const normalizedHeaders = currentHeaders.map(normalizarEncabezado_);
  const missingHeaders = requiredHeaders.filter(function(header) {
    return normalizedHeaders.indexOf(normalizarEncabezado_(header)) === -1;
  });

  if (missingHeaders.length > 0) {
    const startColumn = currentHeaders.length + 1;
    const requiredColumns = startColumn + missingHeaders.length - 1;
    if (sheet.getMaxColumns() < requiredColumns) {
      sheet.insertColumnsAfter(
        sheet.getMaxColumns(),
        requiredColumns - sheet.getMaxColumns()
      );
    }
    sheet.getRange(1, startColumn, 1, missingHeaders.length)
      .setValues([missingHeaders]);
  }

  const finalColumn = sheet.getLastColumn();
  if (finalColumn > 0) {
    sheet.getRange(1, 1, 1, finalColumn)
      .setFontWeight('bold')
      .setBackground('#f2ddbe')
      .setFontColor('#111111')
      .setWrap(true);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, finalColumn);
  }
}

function cargarConfiguracionInicial_() {
  const sheet = obtenerHoja_('CONFIGURACION');
  const existingKeys = obtenerValoresColumna_(sheet, 1);
  const now = new Date();
  const rows = [
    ['VERSION_ESQUEMA', APP_CONFIG.VERSION, 'Version de la estructura de datos', now],
    ['ZONA_HORARIA', APP_CONFIG.TIME_ZONE, 'Zona horaria usada por el sistema', now],
    ['BASE_LEGACY_ID', APP_CONFIG.LEGACY_SPREADSHEET_ID, 'Base anterior en modo de compatibilidad', now],
    ['FORMULARIO_QR_LEGACY_URL', APP_CONFIG.LEGACY_QR_FORM_URL, 'Destino actual de los QR existentes', now]
  ].filter(function(row) {
    return existingKeys.indexOf(row[0]) === -1;
  });

  agregarFilas_(sheet, rows);
}

function cargarCatalogosIniciales_() {
  const sheet = obtenerHoja_('CATALOGOS');
  const existingRows = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getDisplayValues()
    : [];
  const existingKeys = existingRows.map(function(row) {
    return row[0] + '|' + row[1];
  });
  const rows = [
    ['TIPO_REPORTE', 'IT', 'IT', 1, true],
    ['TIPO_REPORTE', 'MANTENIMIENTO', 'Mantenimiento', 2, true],
    ['ESTADO_REPORTE', 'NUEVO', 'Nuevo', 1, true],
    ['ESTADO_REPORTE', 'ASIGNADO', 'Asignado', 2, true],
    ['ESTADO_REPORTE', 'EN_PROCESO', 'En proceso', 3, true],
    ['ESTADO_REPORTE', 'EN_ESPERA', 'En espera', 4, true],
    ['ESTADO_REPORTE', 'RESUELTO', 'Resuelto', 5, true],
    ['ESTADO_REPORTE', 'CANCELADO', 'Cancelado', 6, true],
    ['PRIORIDAD', 'BAJA', 'Baja', 1, true],
    ['PRIORIDAD', 'MEDIA', 'Media', 2, true],
    ['PRIORIDAD', 'ALTA', 'Alta', 3, true],
    ['PRIORIDAD', 'CRITICA', 'Critica', 4, true]
  ].filter(function(row) {
    return existingKeys.indexOf(row[0] + '|' + row[1]) === -1;
  });

  agregarFilas_(sheet, rows);
}

function obtenerValoresColumna_(sheet, column) {
  if (sheet.getLastRow() < 2) {
    return [];
  }
  return sheet.getRange(2, column, sheet.getLastRow() - 1, 1)
    .getDisplayValues()
    .map(function(row) {
      return row[0];
    });
}

function agregarFilas_(sheet, rows) {
  if (rows.length === 0) {
    return;
  }
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length)
    .setValues(rows);
}

function eliminarHojaInicialVacia_(spreadsheet) {
  const requiredNames = Object.keys(SHEET_SCHEMAS);
  spreadsheet.getSheets().forEach(function(sheet) {
    const isRequired = requiredNames.indexOf(sheet.getName()) !== -1;
    const isEmpty = sheet.getLastRow() === 0 ||
      (sheet.getLastRow() === 1 && sheet.getLastColumn() === 1 && sheet.getRange('A1').isBlank());
    if (!isRequired && isEmpty && spreadsheet.getSheets().length > 1) {
      spreadsheet.deleteSheet(sheet);
    }
  });
}

function obtenerEstadoInstalacion() {
  const spreadsheet = abrirBaseDatos_();
  return {
    ok: true,
    version: APP_CONFIG.VERSION,
    spreadsheetId: spreadsheet.getId(),
    hojas: spreadsheet.getSheets().map(function(sheet) {
      return {
        nombre: sheet.getName(),
        filas: sheet.getLastRow(),
        columnas: sheet.getLastColumn()
      };
    })
  };
}
