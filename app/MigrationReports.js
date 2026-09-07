/**
 * Analiza los reportes historicos sin modificar la base nueva.
 */
function previsualizarMigracionReportes() {
  const legacy = SpreadsheetApp.openById(APP_CONFIG.LEGACY_SPREADSHEET_ID);
  const table = leerTablaLegacy_(legacy, 'REPORTES');
  const selected = seleccionarReportesLegacy_(table);
  const summary = resumirReportesLegacy_(table, selected);

  console.log(JSON.stringify(summary));
  abrirBaseDatos_().toast(
    summary.reportesSeleccionados + ' reportes historicos listos para migrar.',
    'Previsualizacion terminada',
    10
  );
  return summary;
}

/**
 * Importa el historial de reportes. Puede ejecutarse nuevamente sin duplicar.
 */
function migrarReportesHistoricos() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const database = abrirBaseDatos_();
    asegurarHoja_(database, 'REPORTES', SHEET_SCHEMAS.REPORTES);
    const legacy = SpreadsheetApp.openById(APP_CONFIG.LEGACY_SPREADSHEET_ID);
    const table = leerTablaLegacy_(legacy, 'REPORTES');
    const selected = seleccionarReportesLegacy_(table);
    const equipmentIndex = crearIndiceEquipos_();
    const records = selected.rows.map(function(item) {
      return convertirReporteLegacy_(table, item, equipmentIndex);
    });
    const migrationResult = upsertRegistros_(
      'REPORTES',
      records,
      ['NUMERO_REPORTE_LEGACY'],
      'ID_REPORTE',
      'REP'
    );

    registrarMigracion_({
      tipo: 'REPORTES_HISTORICOS',
      origen: APP_CONFIG.LEGACY_SPREADSHEET_ID,
      leidos: table.rows.length,
      creados: migrationResult.created,
      omitidos: selected.duplicates,
      errores: 0
    });

    SpreadsheetApp.flush();
    database.toast(
      migrationResult.total + ' reportes historicos migrados.',
      'Migracion completada',
      10
    );
    console.log(JSON.stringify(migrationResult));
    return migrationResult;
  } finally {
    lock.releaseLock();
  }
}

function seleccionarReportesLegacy_(table) {
  return seleccionarUltimosUtiles_(
    table.rows,
    function(row) {
      return normalizarClave_(valorLegacy_(table, row, 'Nro de reporte'));
    },
    function(row) {
      return tieneTexto_(valorLegacy_(table, row, 'Descripcion de la anomalia presentada'));
    }
  );
}

function resumirReportesLegacy_(table, selected) {
  const categories = { IT: 0, MANTENIMIENTO: 0 };
  const statuses = {};
  let withoutEquipmentCode = 0;

  selected.rows.forEach(function(item) {
    const row = item.row;
    const category = mapearTipoReporte_(valorLegacy_(table, row, 'MM/SG/IT'));
    const status = mapearEstatusReporte_(valorLegacy_(table, row, 'Estatus'));
    categories[category] += 1;
    statuses[status] = (statuses[status] || 0) + 1;
    const equipmentCode = normalizarClave_(valorLegacy_(table, row, 'Codigo del equipo'));
    if (!equipmentCode || equipmentCode === 'NA' || equipmentCode === 'N/A') {
      withoutEquipmentCode += 1;
    }
  });

  return {
    ok: true,
    reportesLeidos: table.rows.length,
    reportesSeleccionados: selected.rows.length,
    duplicadosResueltos: selected.duplicates,
    categorias: categories,
    estatus: statuses,
    reportesSinEquipoIdentificado: withoutEquipmentCode
  };
}

function convertirReporteLegacy_(table, item, equipmentIndex) {
  const row = item.row;
  const sourceIndex = item.sourceRow - 2;
  const equipmentCode = normalizarClave_(valorLegacy_(table, row, 'Codigo del equipo'));
  const equipment = equipmentIndex[equipmentCode] || {};
  const legacyStatus = texto_(valorLegacy_(table, row, 'Estatus'));
  const legacyCategory = texto_(valorLegacy_(table, row, 'MM/SG/IT'));
  const finalDate = valorLegacy_(table, row, 'Fecha Final (Real)');

  return {
    NUMERO_REPORTE_LEGACY: texto_(valorLegacy_(table, row, 'Nro de reporte')),
    ORIGEN: 'LEGACY',
    TIPO_REPORTE: mapearTipoReporte_(legacyCategory),
    TIPO_REPORTE_LEGACY: legacyCategory || 'SIN CLASIFICAR',
    PERSONA_REPORTA: texto_(valorLegacy_(table, row, 'Persona que reporta')),
    CORREO_REPORTA: texto_(valorLegacy_(table, row, 'Direccion de correo electronico')),
    CODIGO_EQUIPO: equipmentCode === 'NA' || equipmentCode === 'N/A' ? '' : equipmentCode,
    NOMBRE_EQUIPO: texto_(valorLegacy_(table, row, 'Nombre del equipo')) || equipment.NOMBRE || '',
    EMPRESA: equipment.EMPRESA || '',
    UBICACION: texto_(valorLegacy_(table, row, 'Ubicacion')) ||
      texto_(valorLegacy_(table, row, 'Seleccione la ubicacion')) ||
      equipment.UBICACION || '',
    AREA: texto_(valorLegacy_(table, row, 'Area')) ||
      texto_(valorLegacy_(table, row, 'Seleccione el area')) ||
      texto_(valorLegacy_(table, row, 'Escriba el nombre del area')) ||
      equipment.AREA || '',
    DESCRIPCION: texto_(valorLegacy_(table, row, 'Descripcion de la anomalia presentada')),
    EQUIPO_DETENIDO: texto_(valorLegacy_(table, row, 'Se tuvo que parar el equipo')),
    EVIDENCIA_URL: valorUrlLegacy_(table, row, sourceIndex, 'Fotografia o video'),
    PRIORIDAD: 'MEDIA',
    ESTATUS: mapearEstatusReporte_(legacyStatus),
    ESTATUS_LEGACY: legacyStatus || 'SIN ESTATUS',
    PROGRESO: valorLegacy_(table, row, 'Progreso'),
    ENCARGADO: texto_(valorLegacy_(table, row, 'Encargado')),
    TIPO_TRABAJO_LEGACY: texto_(valorLegacy_(table, row, 'Tipo de trabajo')),
    NUMERO_CASO_LEGACY: texto_(valorLegacy_(table, row, 'N de Caso')),
    TIEMPO_ATENCION: valorLegacy_(table, row, 'Tiempo de atencion'),
    TIPO_DEMORA: texto_(valorLegacy_(table, row, 'Tipo de demora')),
    FECHA_INICIO_DEMORA: valorLegacy_(table, row, 'Fecha inicio de demora'),
    TIEMPO_DEMORA: valorLegacy_(table, row, 'Tiempo de demora'),
    FECHA_FINAL: finalDate,
    TIEMPO_CULMINACION_DIAS: valorLegacy_(table, row, 'Tiempo de culminacion (dias)'),
    PDF_URL: valorUrlLegacy_(table, row, sourceIndex, 'PDF reporte'),
    LINK_SEGUIMIENTO_LEGACY: valorUrlLegacy_(table, row, sourceIndex, 'Link Prellenado'),
    FILA_ORIGEN: item.sourceRow,
    CREADO_EN: obtenerFechaCreacionLegacy_(table, row),
    RESUELTO_EN: mapearEstatusReporte_(legacyStatus) === 'RESUELTO' ? finalDate : '',
    ACTUALIZADO_EN: new Date()
  };
}

function crearIndiceEquipos_() {
  const sheet = obtenerHoja_('EQUIPOS');
  if (sheet.getLastRow() < 2) {
    return {};
  }
  const values = sheet.getDataRange().getValues();
  const headers = values.shift().map(normalizarEncabezado_);
  const index = {};
  values.forEach(function(row) {
    const record = {};
    headers.forEach(function(header, position) {
      record[header] = row[position];
    });
    const code = normalizarClave_(record.CODIGO_EQUIPO);
    if (code) {
      index[code] = record;
    }
  });
  return index;
}

function valorUrlLegacy_(table, row, sourceIndex, headerName) {
  const value = texto_(valorLegacy_(table, row, headerName));
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  const indexes = table.indexes[normalizarEncabezado_(headerName)] || [];
  const formula = indexes.length > 0 && table.formulas[sourceIndex]
    ? texto_(table.formulas[sourceIndex][indexes[0]])
    : '';
  const match = formula.match(/HYPERLINK\("([^"]+)"/i);
  return match ? match[1] : value;
}

function mapearTipoReporte_(value) {
  return normalizarClave_(value) === 'IT' ? 'IT' : 'MANTENIMIENTO';
}

function mapearEstatusReporte_(value) {
  const status = normalizarEncabezado_(value);
  if (/SOLUCIONADO|PAGADO_CONTRATISTA|FINALIZADO|CULMINADO|RESUELTO/.test(status)) {
    return 'RESUELTO';
  }
  if (/ESPERA|PRESUPUESTO|FACTURA_ENVIADA/.test(status)) {
    return 'EN_ESPERA';
  }
  if (/REPARACION|PROCESO|ATENCION/.test(status)) {
    return 'EN_PROCESO';
  }
  if (/ASIGNADO/.test(status)) {
    return 'ASIGNADO';
  }
  if (/CANCELADO/.test(status)) {
    return 'CANCELADO';
  }
  return 'NUEVO';
}

function obtenerFechaCreacionLegacy_(table, row) {
  return valorLegacy_(table, row, 'Marca temporal') ||
    valorLegacy_(table, row, 'Fecha (DD/MM/AA)') ||
    '';
}

