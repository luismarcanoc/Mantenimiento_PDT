const MIGRATION_CONFIG = Object.freeze({
  EQUIPMENT_SHEET: 'Base de Datos equipos',
  ACTIVITY_SHEET: 'Base de datos actividades'
});

/**
 * Analiza el inventario anterior sin escribir en la base nueva.
 */
function previsualizarMigracionInventario() {
  const legacy = SpreadsheetApp.openById(APP_CONFIG.LEGACY_SPREADSHEET_ID);
  const equipmentTable = leerTablaLegacy_(legacy, MIGRATION_CONFIG.EQUIPMENT_SHEET);
  const activityTable = leerTablaLegacy_(legacy, MIGRATION_CONFIG.ACTIVITY_SHEET);
  const equipmentSelection = seleccionarEquiposLegacy_(equipmentTable);
  const activitySelection = seleccionarActividadesLegacy_(activityTable);

  const equipmentCodes = {};
  equipmentSelection.rows.forEach(function(item) {
    equipmentCodes[normalizarClave_(valorLegacy_(equipmentTable, item.row, 'Codigo del equipo'))] = true;
  });

  const orphanActivities = activitySelection.rows.filter(function(item) {
    const code = normalizarClave_(valorLegacy_(activityTable, item.row, 'Codigo del equipo'));
    return !equipmentCodes[code];
  });

  const result = {
    ok: true,
    equiposLeidos: equipmentTable.rows.length,
    equiposSeleccionados: equipmentSelection.rows.length,
    duplicadosEquiposResueltos: equipmentSelection.duplicates,
    actividadesLeidas: activityTable.rows.length,
    actividadesSeleccionadas: activitySelection.rows.length,
    duplicadosActividadesResueltos: activitySelection.duplicates,
    actividadesSinEquipo: orphanActivities.length
  };

  console.log(JSON.stringify(result));
  abrirBaseDatos_().toast(
    result.equiposSeleccionados + ' equipos y ' +
      result.actividadesSeleccionadas + ' actividades listos para migrar.',
    'Previsualizacion terminada',
    10
  );
  return result;
}

/**
 * Migra equipos y actividades desde la base anterior.
 * Los codigos repetidos se resuelven conservando el ultimo registro util.
 */
function migrarInventarioInicial() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const legacy = SpreadsheetApp.openById(APP_CONFIG.LEGACY_SPREADSHEET_ID);
    const equipmentTable = leerTablaLegacy_(legacy, MIGRATION_CONFIG.EQUIPMENT_SHEET);
    const activityTable = leerTablaLegacy_(legacy, MIGRATION_CONFIG.ACTIVITY_SHEET);
    const equipmentSelection = seleccionarEquiposLegacy_(equipmentTable);
    const activitySelection = seleccionarActividadesLegacy_(activityTable);

    const equipmentRecords = equipmentSelection.rows.map(function(item) {
      return convertirEquipoLegacy_(equipmentTable, item.row);
    });
    const activityRecords = activitySelection.rows.map(function(item) {
      return convertirActividadLegacy_(activityTable, item.row);
    });

    const equipmentResult = upsertRegistros_(
      'EQUIPOS',
      equipmentRecords,
      ['CODIGO_EQUIPO'],
      'ID_EQUIPO',
      'EQ'
    );
    const activityResult = upsertRegistros_(
      'ACTIVIDADES',
      activityRecords,
      ['CODIGO_EQUIPO', 'CODIGO_ACTIVIDAD'],
      'ID_ACTIVIDAD',
      'ACT'
    );

    const omitted = equipmentSelection.duplicates + activitySelection.duplicates;
    registrarMigracion_({
      tipo: 'INVENTARIO_INICIAL',
      origen: APP_CONFIG.LEGACY_SPREADSHEET_ID,
      leidos: equipmentTable.rows.length + activityTable.rows.length,
      creados: equipmentResult.created + activityResult.created,
      omitidos: omitted,
      errores: 0
    });

    SpreadsheetApp.flush();
    const result = {
      ok: true,
      equipos: equipmentResult,
      actividades: activityResult,
      duplicadosResueltos: omitted
    };
    abrirBaseDatos_().toast(
      equipmentResult.total + ' equipos y ' + activityResult.total + ' actividades migrados.',
      'Migracion completada',
      10
    );
    console.log(JSON.stringify(result));
    return result;
  } finally {
    lock.releaseLock();
  }
}

function leerTablaLegacy_(spreadsheet, sheetName) {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('No se encontro la hoja anterior: ' + sheetName);
  }
  if (sheet.getLastRow() < 1 || sheet.getLastColumn() < 1) {
    throw new Error('La hoja anterior esta vacia: ' + sheetName);
  }

  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  const formulas = dataRange.getFormulas();
  const headers = values.shift();
  formulas.shift();
  const indexes = {};
  headers.forEach(function(header, index) {
    const key = normalizarEncabezado_(header);
    if (!indexes[key]) {
      indexes[key] = [];
    }
    indexes[key].push(index);
  });

  return {
    sheetName: sheetName,
    headers: headers,
    indexes: indexes,
    rows: values,
    formulas: formulas
  };
}

function valorLegacy_(table, row, headerName, occurrence) {
  const indexes = table.indexes[normalizarEncabezado_(headerName)] || [];
  const position = occurrence || 0;
  return indexes[position] === undefined ? '' : row[indexes[position]];
}

function seleccionarEquiposLegacy_(table) {
  return seleccionarUltimosUtiles_(
    table.rows,
    function(row) {
      return normalizarClave_(valorLegacy_(table, row, 'Codigo del equipo'));
    },
    function(row) {
      return tieneTexto_(valorLegacy_(table, row, 'Nombre')) ||
        tieneTexto_(valorLegacy_(table, row, 'Nombre del equipo original'));
    }
  );
}

function seleccionarActividadesLegacy_(table) {
  return seleccionarUltimosUtiles_(
    table.rows,
    function(row) {
      const equipmentCode = normalizarClave_(valorLegacy_(table, row, 'Codigo del equipo'));
      const activityCode = normalizarClave_(valorLegacy_(table, row, 'Codigo de actividad'));
      return equipmentCode && activityCode ? equipmentCode + '|' + activityCode : '';
    },
    function(row) {
      return tieneTexto_(valorLegacy_(table, row, 'Descripcion de la actividad'));
    }
  );
}

function seleccionarUltimosUtiles_(rows, keySelector, usefulSelector) {
  const selected = {};
  let duplicates = 0;

  rows.forEach(function(row, index) {
    const key = keySelector(row);
    if (!key) {
      return;
    }
    if (selected[key]) {
      duplicates += 1;
    }
    if (usefulSelector(row) || !selected[key]) {
      selected[key] = { row: row, sourceRow: index + 2 };
    }
  });

  return {
    rows: Object.keys(selected).map(function(key) {
      return selected[key];
    }),
    duplicates: duplicates
  };
}

function convertirEquipoLegacy_(table, row) {
  const locationArea = separarUbicacionArea_(valorLegacy_(table, row, 'Ubicacion'));
  const status = texto_(valorLegacy_(table, row, 'Estatus'));
  return {
    CODIGO_EQUIPO: normalizarClave_(valorLegacy_(table, row, 'Codigo del equipo')),
    TIPO_EQUIPO: texto_(valorLegacy_(table, row, 'Tipo de equipo')),
    NOMBRE_ORIGINAL: texto_(valorLegacy_(table, row, 'Nombre del equipo original')),
    NOMBRE: texto_(valorLegacy_(table, row, 'Nombre')),
    MARCA: texto_(valorLegacy_(table, row, 'Marca')),
    MODELO: texto_(valorLegacy_(table, row, 'Modelo')),
    INFORMACION: texto_(valorLegacy_(table, row, 'Informacion')),
    EMPRESA: texto_(valorLegacy_(table, row, 'Empresa')),
    UBICACION: locationArea.location,
    AREA: locationArea.area,
    ESTATUS: status,
    CODIGO_ANTERIOR: texto_(valorLegacy_(table, row, 'Codigos anteriores')),
    IMAGEN_URL: texto_(valorLegacy_(table, row, 'Imagenes')),
    QR_LEGACY_URL: texto_(valorLegacy_(table, row, 'link Prellenado')),
    ACTIVO: !/(BAJA|DESINCORPORADO|ELIMINADO)/i.test(status),
    ACTUALIZADO_EN: new Date()
  };
}

function convertirActividadLegacy_(table, row) {
  return {
    CODIGO_ACTIVIDAD: normalizarClave_(valorLegacy_(table, row, 'Codigo de actividad')),
    CODIGO_EQUIPO: normalizarClave_(valorLegacy_(table, row, 'Codigo del equipo')),
    DESCRIPCION: texto_(valorLegacy_(table, row, 'Descripcion de la actividad')),
    PERSONAL_REQUERIDO: valorLegacy_(table, row, 'Personal requerido'),
    FRECUENCIA: valorLegacy_(table, row, 'Frecuencia'),
    MATERIALES: texto_(valorLegacy_(table, row, 'Materiales')),
    HERRAMIENTAS: texto_(valorLegacy_(table, row, 'Herramientas')),
    COSTO_ESTIMADO: valorLegacy_(table, row, 'Costo total estimado'),
    ULTIMA_EJECUCION: valorLegacy_(table, row, 'Ultima ejecucion'),
    PROXIMA_EJECUCION: valorLegacy_(table, row, 'Proxima ejecucion'),
    INFORMACION: texto_(valorLegacy_(table, row, 'Informacion')),
    ESTATUS: 'ACTIVA',
    ACTIVO: true,
    ACTUALIZADO_EN: new Date()
  };
}

function separarUbicacionArea_(value) {
  const parts = texto_(value).split(';').map(function(part) {
    return part.trim();
  }).filter(String);
  return {
    location: parts.shift() || '',
    area: parts.join('; ')
  };
}

function upsertRegistros_(sheetName, records, keyFields, idField, idPrefix) {
  const sheet = obtenerHoja_(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const headerIndexes = {};
  headers.forEach(function(header, index) {
    headerIndexes[normalizarEncabezado_(header)] = index;
  });

  const existing = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues()
    : [];
  const rowByKey = {};
  existing.forEach(function(row, index) {
    const key = construirClaveFila_(row, keyFields, headerIndexes);
    if (key) {
      rowByKey[key] = index;
    }
  });

  let created = 0;
  let updated = 0;
  records.forEach(function(record) {
    const key = keyFields.map(function(field) {
      return normalizarClave_(record[field]);
    }).join('|');
    let target;

    if (rowByKey[key] !== undefined) {
      target = existing[rowByKey[key]];
      updated += 1;
    } else {
      target = new Array(headers.length).fill('');
      target[headerIndexes[idField]] = crearId_(idPrefix);
      target[headerIndexes.CREADO_EN] = new Date();
      existing.push(target);
      rowByKey[key] = existing.length - 1;
      created += 1;
    }

    Object.keys(record).forEach(function(field) {
      if (headerIndexes[field] !== undefined) {
        target[headerIndexes[field]] = record[field];
      }
    });
  });

  if (existing.length > 0) {
    const requiredRows = existing.length + 1;
    if (sheet.getMaxRows() < requiredRows) {
      sheet.insertRowsAfter(sheet.getMaxRows(), requiredRows - sheet.getMaxRows());
    }
    sheet.getRange(2, 1, existing.length, headers.length).setValues(existing);
  }
  return { created: created, updated: updated, total: records.length };
}

function construirClaveFila_(row, keyFields, headerIndexes) {
  const values = keyFields.map(function(field) {
    return normalizarClave_(row[headerIndexes[field]]);
  });
  return values.some(Boolean) ? values.join('|') : '';
}

function registrarMigracion_(data) {
  obtenerHoja_('MIGRACION_LOG').appendRow([
    crearId_('MIG'),
    data.tipo,
    data.origen,
    data.leidos,
    data.creados,
    data.omitidos,
    data.errores,
    new Date()
  ]);
}

function normalizarClave_(value) {
  return texto_(value).toUpperCase();
}

function texto_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function tieneTexto_(value) {
  return texto_(value) !== '';
}
