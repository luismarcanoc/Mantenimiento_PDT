function abrirBaseDatos_() {
  return SpreadsheetApp.openById(APP_CONFIG.SPREADSHEET_ID);
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

