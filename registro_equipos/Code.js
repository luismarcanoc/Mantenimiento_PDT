function doGet() {
  const template = HtmlService.createTemplateFromFile('Index');
  return template.evaluate()
    .setTitle('Registro de equipos | Pan de Tata')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include_(file) {
  return HtmlService.createHtmlOutputFromFile(file).getContent();
}

function configurarAdministradorInicial() {
  const email = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) throw new Error('No se pudo identificar la cuenta que ejecuta la configuración.');
  const properties = PropertiesService.getScriptProperties();
  const current = String(properties.getProperty(REGISTRO_CONFIG.ACCESS_PROPERTY) || '').trim();
  if (current) return {configured: false, emails: current};
  properties.setProperty(REGISTRO_CONFIG.ACCESS_PROPERTY, email);
  return {configured: true, emails: email};
}

function obtenerInicioRegistro() {
  const email = exigirAcceso_();
  const catalog = JSON.parse(JSON.stringify(EQUIPMENT_CATALOG));
  Object.keys(catalog.types).forEach(function(category) {
    catalog.types[category] = catalog.types[category].map(function(item) {
      return {code: item[0], name: item[1]};
    });
  });
  catalog.companies = catalog.companies.map(parAObjeto_);
  catalog.locations = catalog.locations.map(parAObjeto_);
  catalog.areas = catalog.areas.map(parAObjeto_);
  return {email: email, catalog: catalog};
}

function previsualizarCodigoEquipo(data) {
  exigirAcceso_();
  const validated = validarSeleccion_(data);
  return construirSiguienteCodigo_(validated);
}

function registrarEquipo(data) {
  const email = exigirAcceso_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const validated = validarEquipo_(data);
    const code = construirSiguienteCodigo_(validated);
    const sheet = obtenerHojaEquipos_();
    asegurarEstructura_(sheet);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
      .map(normalizarEncabezado_);
    const now = new Date();
    const reportUrl = REGISTRO_CONFIG.REPORT_APP_URL + '?equipo=' + encodeURIComponent(code);
    const record = {
      ID_EQUIPO: 'EQ-' + Utilities.getUuid(),
      CODIGO_EQUIPO: code,
      TIPO_EQUIPO: validated.type.name,
      NOMBRE_ORIGINAL: validated.name,
      NOMBRE: validated.name,
      MARCA: validated.brand,
      MODELO: validated.model,
      INFORMACION: validated.information,
      EMPRESA: validated.company.name,
      UBICACION: validated.location.name,
      AREA: validated.area.name,
      ESTATUS: 'ACTIVO',
      CODIGO_ANTERIOR: '',
      IMAGEN_URL: validated.imageUrl,
      QR_LEGACY_URL: '',
      ACTIVO: true,
      CREADO_EN: now,
      ACTUALIZADO_EN: now
    };
    sheet.appendRow(headers.map(function(header) {
      return record[header] === undefined ? '' : record[header];
    }));
    console.log(JSON.stringify({action: 'EQUIPMENT_CREATED', code: code, user: email}));
    return {ok: true, code: code, reportUrl: reportUrl, name: validated.name};
  } finally {
    lock.releaseLock();
  }
}

function exigirAcceso_() {
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) {
    throw new Error('Google no pudo identificar tu cuenta. Inicia sesión y autoriza este módulo.');
  }
  const allowed = String(PropertiesService.getScriptProperties()
    .getProperty(REGISTRO_CONFIG.ACCESS_PROPERTY) || '')
    .split(/[;,\n]/).map(function(value) { return value.trim().toLowerCase(); }).filter(Boolean);
  if (allowed.indexOf(email) === -1) {
    throw new Error('Tu cuenta (' + email + ') no está autorizada para registrar equipos.');
  }
  return email;
}

function validarSeleccion_(data) {
  data = data || {};
  const category = buscarObjeto_(EQUIPMENT_CATALOG.categories, data.categoryCode);
  const typePair = buscarPar_(EQUIPMENT_CATALOG.types[category.code] || [], data.typeCode, 'tipo de equipo');
  return {
    category: category,
    type: {code: typePair[0], name: typePair[1]},
    company: parObjeto_(buscarPar_(EQUIPMENT_CATALOG.companies, data.companyCode, 'empresa')),
    location: parObjeto_(buscarPar_(EQUIPMENT_CATALOG.locations, data.locationCode, 'ubicación')),
    area: parObjeto_(buscarPar_(EQUIPMENT_CATALOG.areas, data.areaCode, 'área'))
  };
}

function validarEquipo_(data) {
  const selected = validarSeleccion_(data);
  selected.name = limpiarTexto_(data.name, 160, true);
  selected.brand = limpiarTexto_(data.brand, 120, false);
  selected.model = limpiarTexto_(data.model, 120, false);
  selected.information = limpiarTexto_(data.information, 500, false);
  selected.imageUrl = limpiarTexto_(data.imageUrl, 500, false);
  if (selected.imageUrl && !/^https:\/\//i.test(selected.imageUrl)) {
    throw new Error('La imagen debe usar un enlace https:// válido.');
  }
  return selected;
}

function construirSiguienteCodigo_(selected) {
  const companyCode = selected.company.code;
  const used = obtenerCodigos_();
  let max = 0;
  used.forEach(function(code) {
    const match = code.match(/^[A-Z]-[A-Z]{2}(\d{1,2})-([A-Z])[A-Z0-9]{4}$/);
    if (match && match[2] === companyCode) max = Math.max(max, Number(match[1]));
  });
  const next = max + 1;
  if (next > 99) throw new Error('La empresa ' + selected.company.name + ' agotó la numeración de dos dígitos.');
  const sequence = String(next).padStart(2, '0');
  const code = selected.category.code + '-' + selected.type.code + sequence + '-' +
    companyCode + selected.location.code + selected.area.code;
  if (used.indexOf(code) !== -1) throw new Error('El código generado ya existe: ' + code);
  return code;
}

function obtenerCodigos_() {
  const sheet = obtenerHojaEquipos_();
  if (sheet.getLastRow() < 2) return [];
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .map(normalizarEncabezado_);
  const index = headers.indexOf('CODIGO_EQUIPO');
  if (index === -1) throw new Error('La hoja EQUIPOS no contiene CODIGO_EQUIPO.');
  return sheet.getRange(2, index + 1, sheet.getLastRow() - 1, 1).getDisplayValues()
    .map(function(row) { return String(row[0] || '').trim().toUpperCase(); }).filter(Boolean);
}

function obtenerHojaEquipos_() {
  const spreadsheet = SpreadsheetApp.openById(REGISTRO_CONFIG.SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(REGISTRO_CONFIG.SHEET_NAME);
  if (!sheet) throw new Error('No existe la hoja EQUIPOS en la base de datos.');
  return sheet;
}

function asegurarEstructura_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .map(normalizarEncabezado_);
  const missing = EQUIPMENT_HEADERS.filter(function(header) { return headers.indexOf(header) === -1; });
  if (missing.length) throw new Error('Faltan columnas en EQUIPOS: ' + missing.join(', '));
}

function buscarObjeto_(items, code) {
  const normalized = String(code || '').trim().toUpperCase();
  const found = items.find(function(item) { return item.code === normalized; });
  if (!found) throw new Error('Categoría no válida.');
  return found;
}

function buscarPar_(items, code, label) {
  const normalized = String(code || '').trim().toUpperCase();
  const found = items.find(function(item) { return item[0] === normalized; });
  if (!found) throw new Error('Selecciona ' + label + '.');
  return found;
}

function limpiarTexto_(value, max, required) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (required && !text) throw new Error('Escribe el nombre del equipo.');
  return text.slice(0, max);
}

function normalizarEncabezado_(value) {
  return String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
}

function parObjeto_(item) { return {code: item[0], name: item[1]}; }
function parAObjeto_(item) { return parObjeto_(item); }
