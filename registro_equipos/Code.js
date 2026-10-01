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

/** Agrega y completa las columnas de numeración sin cambiar códigos existentes. */
function prepararNumeracionesEquipos() {
  exigirAcceso_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = obtenerHojaEquipos_();
    let headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
      .map(normalizarEncabezado_);
    const required = ['NUMERO_GLOBAL_TIPO','NUMERO_LOCAL_SEDE','REEMPLAZA_ID_EQUIPO','REEMPLAZADO_POR_ID_EQUIPO'];
    const missing = required.filter(function(header) { return headers.indexOf(header) === -1; });
    if (missing.length) {
      sheet.getRange(1, sheet.getLastColumn() + 1, 1, missing.length).setValues([missing]);
      headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
        .map(normalizarEncabezado_);
    }
    if (sheet.getLastRow() < 2) return {ok: true, updated: 0};
    const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    const index = {};
    headers.forEach(function(header, column) { index[header] = column; });
    const localMax = {};
    let updated = 0;
    values.forEach(function(row) {
      const code = texto_(row[index.CODIGO_EQUIPO]).toUpperCase();
      const codeMatch = code.match(/^[A-Z]-[A-Z]{2}(\d{1,2})-/);
      if (!Number(row[index.NUMERO_GLOBAL_TIPO]) && codeMatch) {
        row[index.NUMERO_GLOBAL_TIPO] = Number(codeMatch[1]);
        updated += 1;
      }
      const key = normalizar_(row[index.TIPO_EQUIPO]) + '|' + normalizar_(row[index.UBICACION]);
      const nameMatch = texto_(row[index.NOMBRE]).match(/#\s*(\d+)\s*$/);
      const existingLocal = Number(row[index.NUMERO_LOCAL_SEDE]) || (nameMatch ? Number(nameMatch[1]) : 0);
      if (existingLocal) localMax[key] = Math.max(localMax[key] || 0, existingLocal);
    });
    values.forEach(function(row) {
      if (Number(row[index.NUMERO_LOCAL_SEDE]) > 0) return;
      const key = normalizar_(row[index.TIPO_EQUIPO]) + '|' + normalizar_(row[index.UBICACION]);
      const nameMatch = texto_(row[index.NOMBRE]).match(/#\s*(\d+)\s*$/);
      row[index.NUMERO_LOCAL_SEDE] = nameMatch ? Number(nameMatch[1]) : (localMax[key] || 0) + 1;
      localMax[key] = Math.max(localMax[key] || 0, Number(row[index.NUMERO_LOCAL_SEDE]));
      updated += 1;
    });
    sheet.getRange(2, 1, values.length, headers.length).setValues(values);
    SpreadsheetApp.flush();
    console.log(JSON.stringify({ok: true, rows: values.length, updated: updated, columnsAdded: missing}));
    return {ok: true, rows: values.length, updated: updated, columnsAdded: missing};
  } finally {
    lock.releaseLock();
  }
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
  const plan = construirPlanNumeracion_(validated, data && data.replacementId);
  return {
    code: plan.code,
    globalNumber: plan.globalNumber,
    localNumber: plan.localNumber,
    replacement: Boolean(plan.replaced)
  };
}

function obtenerEquiposInhabilitadosCompatibles(data) {
  exigirAcceso_();
  const selected = validarSeleccion_(data);
  return leerEquipos_().filter(function(item) {
    return equipoInhabilitado_(item) && coincideReemplazo_(item, selected) &&
      !texto_(item.REEMPLAZADO_POR_ID_EQUIPO);
  }).map(function(item) {
    return {
      id: texto_(item.ID_EQUIPO),
      code: texto_(item.CODIGO_EQUIPO),
      name: texto_(item.NOMBRE),
      localNumber: numeroLocalEquipo_(item)
    };
  }).sort(function(a, b) { return a.localNumber - b.localNumber; });
}

function registrarEquipo(data) {
  const email = exigirAcceso_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const validated = validarEquipo_(data);
    const plan = construirPlanNumeracion_(validated, data && data.replacementId);
    const code = plan.code;
    const sheet = obtenerHojaEquipos_();
    asegurarEstructura_(sheet);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
      .map(normalizarEncabezado_);
    const now = new Date();
    const newId = 'EQ-' + Utilities.getUuid();
    const displayName = construirNombreLocal_(validated.name, validated.type.name, plan.localNumber);
    const reportUrl = REGISTRO_CONFIG.REPORT_APP_URL + '?equipo=' + encodeURIComponent(code);
    const record = {
      ID_EQUIPO: newId,
      CODIGO_EQUIPO: code,
      TIPO_EQUIPO: validated.type.name,
      NOMBRE_ORIGINAL: validated.name,
      NOMBRE: displayName,
      MARCA: validated.brand,
      MODELO: validated.model,
      INFORMACION: validated.information,
      EMPRESA: validated.company.name,
      UBICACION: validated.location.name,
      AREA: validated.area.name,
      ESTATUS: 'ACTIVO',
      NUMERO_GLOBAL_TIPO: plan.globalNumber,
      NUMERO_LOCAL_SEDE: plan.localNumber,
      REEMPLAZA_ID_EQUIPO: plan.replaced ? texto_(plan.replaced.ID_EQUIPO) : '',
      REEMPLAZADO_POR_ID_EQUIPO: '',
      CODIGO_ANTERIOR: plan.replaced ? texto_(plan.replaced.CODIGO_EQUIPO) : '',
      IMAGEN_URL: validated.imageUrl,
      QR_LEGACY_URL: '',
      ACTIVO: true,
      CREADO_EN: now,
      ACTUALIZADO_EN: now
    };
    sheet.appendRow(headers.map(function(header) {
      return record[header] === undefined ? '' : record[header];
    }));
    if (plan.replaced) marcarEquipoReemplazado_(sheet, headers, plan.replaced, newId, now);
    console.log(JSON.stringify({action: 'EQUIPMENT_CREATED', code: code, user: email}));
    return {ok: true, code: code, reportUrl: reportUrl, name: displayName,
      globalNumber: plan.globalNumber, localNumber: plan.localNumber,
      replacedCode: plan.replaced ? texto_(plan.replaced.CODIGO_EQUIPO) : ''};
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
  return construirPlanNumeracion_(selected, '').code;
}

function construirPlanNumeracion_(selected, replacementId) {
  const equipment = leerEquipos_();
  const used = equipment.map(function(item) { return texto_(item.CODIGO_EQUIPO).toUpperCase(); });
  let max = 0;
  used.forEach(function(code) {
    const match = code.match(/^[A-Z]-[A-Z]{2}(\d{1,2})-([A-Z])[A-Z0-9]{4}$/);
    if (match && code.slice(0, 4) === selected.category.code + '-' + selected.type.code) {
      max = Math.max(max, Number(match[1]));
    }
  });
  const globalNumber = max + 1;
  if (globalNumber > 99) throw new Error('El tipo ' + selected.type.name + ' agotó la numeración global de dos dígitos.');
  let replaced = null;
  if (replacementId) {
    replaced = equipment.find(function(item) { return texto_(item.ID_EQUIPO) === texto_(replacementId); });
    if (!replaced || !equipoInhabilitado_(replaced) || !coincideReemplazo_(replaced, selected) ||
        texto_(replaced.REEMPLAZADO_POR_ID_EQUIPO)) {
      throw new Error('El equipo seleccionado ya no está disponible para reemplazo o no coincide con tipo, sede y área.');
    }
  }
  let localNumber = replaced ? numeroLocalEquipo_(replaced) : 0;
  if (!localNumber) {
    equipment.forEach(function(item) {
      if (coincideTipoYSede_(item, selected)) localNumber = Math.max(localNumber, numeroLocalEquipo_(item));
    });
    localNumber += 1;
  }
  const sequence = String(globalNumber).padStart(2, '0');
  const code = selected.category.code + '-' + selected.type.code + sequence + '-' +
    selected.company.code + selected.location.code + selected.area.code;
  if (used.indexOf(code) !== -1) throw new Error('El código generado ya existe: ' + code);
  return {code: code, globalNumber: globalNumber, localNumber: localNumber, replaced: replaced};
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

function leerEquipos_() {
  const sheet = obtenerHojaEquipos_();
  if (sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values.shift().map(normalizarEncabezado_);
  return values.map(function(row, index) {
    const item = {_ROW: index + 2};
    headers.forEach(function(header, column) { item[header] = row[column]; });
    return item;
  });
}

function equipoInhabilitado_(item) {
  const status = texto_(item.ESTATUS).toUpperCase();
  return item.ACTIVO === false || ['INHABILITADO','DESCONTINUADO','FUERA DE SERVICIO'].indexOf(status) !== -1;
}

function coincideTipoYSede_(item, selected) {
  return normalizar_(item.TIPO_EQUIPO) === normalizar_(selected.type.name) &&
    normalizar_(item.UBICACION) === normalizar_(selected.location.name);
}

function coincideReemplazo_(item, selected) {
  return coincideTipoYSede_(item, selected) && normalizar_(item.AREA) === normalizar_(selected.area.name);
}

function numeroLocalEquipo_(item) {
  const stored = Number(item.NUMERO_LOCAL_SEDE);
  if (stored > 0) return stored;
  const match = texto_(item.NOMBRE).match(/#\s*(\d+)\s*$/);
  return match ? Number(match[1]) : 0;
}

function construirNombreLocal_(name, typeName, localNumber) {
  const base = texto_(name || typeName).replace(/\s*#\s*\d+\s*$/, '').trim() || typeName;
  return base + ' #' + localNumber;
}

function marcarEquipoReemplazado_(sheet, headers, oldEquipment, newId, now) {
  const values = {
    ACTIVO: false,
    ESTATUS: 'REEMPLAZADO',
    REEMPLAZADO_POR_ID_EQUIPO: newId,
    ACTUALIZADO_EN: now
  };
  Object.keys(values).forEach(function(header) {
    const column = headers.indexOf(header);
    if (column !== -1) sheet.getRange(oldEquipment._ROW, column + 1).setValue(values[header]);
  });
}

function normalizar_(value) {
  return texto_(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function texto_(value) { return String(value === undefined || value === null ? '' : value).trim(); }

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
