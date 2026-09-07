const REPORT_LIMITS = Object.freeze({
  SEARCH_RESULTS: 20,
  LOCATION_RESULTS: 150,
  EVIDENCE_BYTES: 8 * 1024 * 1024
});

function obtenerUbicacionesEquipos() {
  const locations = {};
  leerEquipos_().forEach(function(equipment) {
    const location = texto_(equipment.UBICACION);
    if (equipment.ACTIVO && location) {
      const key = normalizarBusqueda_(location);
      if (!locations[key]) {
        locations[key] = location;
      }
    }
  });
  return Object.keys(locations).map(function(key) {
    return locations[key];
  }).sort(function(a, b) {
    return a.localeCompare(b, 'es', { sensitivity: 'base' });
  });
}

function buscarEquiposPorUbicacion(location, query) {
  const selectedLocation = normalizarBusqueda_(location);
  const search = normalizarBusqueda_(query);
  if (!selectedLocation) {
    return [];
  }

  return leerEquipos_().filter(function(equipment) {
    if (!equipment.ACTIVO ||
        normalizarBusqueda_(equipment.UBICACION) !== selectedLocation) {
      return false;
    }
    if (!search) {
      return true;
    }
    const haystack = normalizarBusqueda_([
      equipment.CODIGO_EQUIPO,
      equipment.NOMBRE,
      equipment.NOMBRE_ORIGINAL,
      equipment.AREA
    ].join(' '));
    return haystack.indexOf(search) !== -1;
  }).sort(function(a, b) {
    const areaComparison = texto_(a.AREA).localeCompare(
      texto_(b.AREA),
      'es',
      { sensitivity: 'base' }
    );
    if (areaComparison !== 0) {
      return areaComparison;
    }
    return texto_(a.NOMBRE || a.NOMBRE_ORIGINAL).localeCompare(
      texto_(b.NOMBRE || b.NOMBRE_ORIGINAL),
      'es',
      { sensitivity: 'base' }
    );
  }).slice(0, REPORT_LIMITS.LOCATION_RESULTS).map(serializarEquipo_);
}

function buscarEquipos(query) {
  const search = normalizarBusqueda_(query);
  if (search.length < 2) {
    return [];
  }

  return leerEquipos_().filter(function(equipment) {
    if (!equipment.ACTIVO) {
      return false;
    }
    const haystack = normalizarBusqueda_([
      equipment.CODIGO_EQUIPO,
      equipment.NOMBRE,
      equipment.NOMBRE_ORIGINAL,
      equipment.UBICACION,
      equipment.AREA
    ].join(' '));
    return haystack.indexOf(search) !== -1;
  }).slice(0, REPORT_LIMITS.SEARCH_RESULTS).map(serializarEquipo_);
}

function obtenerEquipoPorCodigo(code) {
  const normalizedCode = limpiarCodigoEquipo_(code);
  if (!normalizedCode) {
    return null;
  }
  const equipment = leerEquipos_().find(function(item) {
    return normalizarClave_(item.CODIGO_EQUIPO) === normalizedCode && item.ACTIVO;
  });
  return equipment ? serializarEquipo_(equipment) : null;
}

function crearReporte(data) {
  const payload = validarReporte_(data || {});
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const database = abrirBaseDatos_();
    asegurarHoja_(database, 'REPORTES', SHEET_SCHEMAS.REPORTES);
    asegurarHoja_(database, 'HISTORIAL_REPORTES', SHEET_SCHEMAS.HISTORIAL_REPORTES);

    let equipment = null;
    if (!payload.sinEquipo) {
      equipment = obtenerEquipoInternoPorCodigo_(payload.codigoEquipo);
      if (!equipment) {
        throw new Error('El equipo seleccionado ya no esta disponible. Buscalo nuevamente.');
      }
    }

    const now = new Date();
    const reportId = crearId_('REP');
    const reportNumber = siguienteNumeroReporte_();
    const evidenceUrl = payload.evidence
      ? guardarEvidencia_(payload.evidence, reportNumber)
      : '';
    const record = {
      ID_REPORTE: reportId,
      NUMERO_REPORTE: reportNumber,
      ORIGEN: 'WEB',
      TIPO_REPORTE: payload.tipoReporte,
      TIPO_REPORTE_LEGACY: '',
      PERSONA_REPORTA: payload.personaReporta,
      CORREO_REPORTA: payload.correoReporta,
      CODIGO_EQUIPO: equipment ? equipment.CODIGO_EQUIPO : '',
      NOMBRE_EQUIPO: equipment ?
        (equipment.NOMBRE || equipment.NOMBRE_ORIGINAL) : payload.nombreEquipo,
      EMPRESA: equipment ? equipment.EMPRESA : '',
      UBICACION: equipment ? equipment.UBICACION : payload.ubicacion,
      AREA: equipment ? equipment.AREA : payload.area,
      DESCRIPCION: payload.descripcion,
      EQUIPO_DETENIDO: payload.equipoDetenido ? 'SI' : 'NO',
      EVIDENCIA_URL: evidenceUrl,
      PRIORIDAD: payload.prioridad,
      ESTATUS: 'NUEVO',
      ESTATUS_LEGACY: '',
      PROGRESO: 0,
      ENCARGADO: '',
      CREADO_EN: now,
      ACTUALIZADO_EN: now
    };

    agregarRegistroObjeto_('REPORTES', record);
    agregarRegistroObjeto_('HISTORIAL_REPORTES', {
      ID_HISTORIAL: crearId_('HIS'),
      ID_REPORTE: reportId,
      ACCION: 'CREACION',
      ESTATUS_ANTERIOR: '',
      ESTATUS_NUEVO: 'NUEVO',
      COMENTARIO: 'Reporte creado desde la aplicacion web.',
      REALIZADO_POR: payload.personaReporta,
      FECHA_HORA: now
    });

    SpreadsheetApp.flush();
    return {
      ok: true,
      idReporte: reportId,
      numeroReporte: reportNumber,
      mensaje: 'Reporte #' + reportNumber + ' registrado correctamente.'
    };
  } finally {
    lock.releaseLock();
  }
}

function validarReporte_(data) {
  const type = normalizarClave_(data.tipoReporte);
  if (['IT', 'MANTENIMIENTO'].indexOf(type) === -1) {
    throw new Error('Selecciona si el reporte corresponde a IT o Mantenimiento.');
  }

  const person = limitarTexto_(data.personaReporta, 120);
  const description = limitarTexto_(data.descripcion, 2000);
  const email = limitarTexto_(data.correoReporta, 160).toLowerCase();
  const withoutEquipment = Boolean(data.sinEquipo);
  if (person.length < 2) {
    throw new Error('Escribe el nombre de la persona que realiza el reporte.');
  }
  if (description.length < 5) {
    throw new Error('Describe la incidencia con un poco mas de detalle.');
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('El correo electronico no tiene un formato valido.');
  }

  const code = limpiarCodigoEquipo_(data.codigoEquipo);
  const equipmentName = limitarTexto_(data.nombreEquipo, 160);
  const location = limitarTexto_(data.ubicacion, 160);
  const area = limitarTexto_(data.area, 160);
  if (!withoutEquipment && !code) {
    throw new Error('Selecciona un equipo o indica que no aparece en el inventario.');
  }
  if (withoutEquipment && (!equipmentName || !location)) {
    throw new Error('Indica el elemento afectado y su ubicacion.');
  }

  const priority = normalizarClave_(data.prioridad || 'MEDIA');
  if (['BAJA', 'MEDIA', 'ALTA', 'CRITICA'].indexOf(priority) === -1) {
    throw new Error('La prioridad seleccionada no es valida.');
  }

  return {
    tipoReporte: type,
    personaReporta: person,
    correoReporta: email,
    sinEquipo: withoutEquipment,
    codigoEquipo: code,
    nombreEquipo: equipmentName,
    ubicacion: location,
    area: area,
    descripcion: description,
    equipoDetenido: Boolean(data.equipoDetenido),
    prioridad: priority,
    evidence: validarEvidencia_(data.evidence)
  };
}

function validarEvidencia_(evidence) {
  if (!evidence) {
    return null;
  }
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime'
  ];
  const mimeType = texto_(evidence.mimeType).toLowerCase();
  const base64 = texto_(evidence.base64);
  const estimatedBytes = Math.ceil(base64.length * 0.75);
  if (allowedTypes.indexOf(mimeType) === -1) {
    throw new Error('La evidencia debe ser una imagen o un video MP4/MOV.');
  }
  if (!base64 || estimatedBytes > REPORT_LIMITS.EVIDENCE_BYTES) {
    throw new Error('La evidencia no puede superar 8 MB.');
  }
  return {
    name: limitarTexto_(evidence.name, 120).replace(/[^A-Za-z0-9._-]+/g, '_'),
    mimeType: mimeType,
    base64: base64
  };
}

function leerEquipos_() {
  const sheet = obtenerHoja_('EQUIPOS');
  if (sheet.getLastRow() < 2) {
    return [];
  }
  const values = sheet.getDataRange().getValues();
  const headers = values.shift().map(normalizarEncabezado_);
  return values.map(function(row) {
    const record = {};
    headers.forEach(function(header, index) {
      record[header] = row[index];
    });
    return record;
  });
}

function obtenerEquipoInternoPorCodigo_(code) {
  const normalizedCode = limpiarCodigoEquipo_(code);
  return leerEquipos_().find(function(equipment) {
    return normalizarClave_(equipment.CODIGO_EQUIPO) === normalizedCode && equipment.ACTIVO;
  }) || null;
}

function serializarEquipo_(equipment) {
  return {
    codigo: texto_(equipment.CODIGO_EQUIPO),
    nombre: texto_(equipment.NOMBRE || equipment.NOMBRE_ORIGINAL),
    tipo: texto_(equipment.TIPO_EQUIPO),
    empresa: texto_(equipment.EMPRESA),
    ubicacion: texto_(equipment.UBICACION),
    area: texto_(equipment.AREA),
    estatus: texto_(equipment.ESTATUS)
  };
}

function agregarRegistroObjeto_(sheetName, record) {
  const sheet = obtenerHoja_(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .getDisplayValues()[0]
    .map(normalizarEncabezado_);
  const row = headers.map(function(header) {
    return record[header] === undefined ? '' : record[header];
  });
  sheet.appendRow(row);
}

function siguienteNumeroReporte_() {
  const sheet = obtenerHoja_('REPORTES');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .getDisplayValues()[0]
    .map(normalizarEncabezado_);
  const currentIndex = headers.indexOf('NUMERO_REPORTE');
  const legacyIndex = headers.indexOf('NUMERO_REPORTE_LEGACY');
  if (sheet.getLastRow() < 2) {
    return 1;
  }
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  return values.reduce(function(maximum, row) {
    const current = Number(row[currentIndex]) || 0;
    const legacy = Number(row[legacyIndex]) || 0;
    return Math.max(maximum, current, legacy);
  }, 0) + 1;
}

function guardarEvidencia_(evidence, reportNumber) {
  const properties = PropertiesService.getScriptProperties();
  let folder = null;
  const folderId = properties.getProperty('EVIDENCE_FOLDER_ID');
  if (folderId) {
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch (error) {
      console.warn('La carpeta de evidencias anterior no esta disponible.');
    }
  }
  if (!folder) {
    folder = DriveApp.createFolder('Mantenimiento PDT - Evidencias');
    properties.setProperty('EVIDENCE_FOLDER_ID', folder.getId());
  }

  const bytes = Utilities.base64Decode(evidence.base64);
  const blob = Utilities.newBlob(
    bytes,
    evidence.mimeType,
    'reporte-' + reportNumber + '-' + (evidence.name || 'evidencia')
  );
  return folder.createFile(blob).getUrl();
}

function normalizarBusqueda_(value) {
  return texto_(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function limpiarCodigoEquipo_(value) {
  return normalizarClave_(value).replace(/[^A-Z0-9-]/g, '').slice(0, 40);
}

function limitarTexto_(value, length) {
  return texto_(value).slice(0, length);
}
