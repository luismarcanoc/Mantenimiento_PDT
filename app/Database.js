function abrirBaseDatos_() {
  // En ejecuciones manuales usa primero el Sheet al que pertenece el script.
  // En una web app no hay archivo activo, por eso se conserva el ID como respaldo.
  return SpreadsheetApp.getActiveSpreadsheet() ||
    SpreadsheetApp.openById(APP_CONFIG.SPREADSHEET_ID);
}

function obtenerHoja_(nombre) {
  const sheet = abrirBaseDatos_().getSheetByName(nombre);
  if (!sheet) {
    throw new Error('No existe la hoja requerida: ' + nombre);
  }
  return sheet;
}

function normalizarEncabezado_(valor) {
  return String(valor || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function crearId_(prefijo) {
  return prefijo + '-' + Utilities.getUuid();
}
