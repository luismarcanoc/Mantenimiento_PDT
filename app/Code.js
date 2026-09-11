/**
 * Comprueba que el proyecto puede abrir la nueva base de datos.
 * Esta funcion no modifica el archivo.
 */
function probarConexionBase() {
  const spreadsheet = abrirBaseDatos_();
  const resultado = {
    id: spreadsheet.getId(),
    nombre: spreadsheet.getName(),
    zonaHoraria: spreadsheet.getSpreadsheetTimeZone(),
    hojas: spreadsheet.getSheets().map(function(sheet) {
      return sheet.getName();
    })
  };

  console.log(JSON.stringify(resultado));
  return resultado;
}

function doGet(e) {
  const parameters = e && e.parameter ? e.parameter : {};
  if (parameters.vista === 'instructivo') {
    const guide = HtmlService.createTemplateFromFile('Instructivo');
    guide.logoUrl = APP_CONFIG.ASSET_BASE_URL + '/logopandetata.png';
    guide.formUrl = ScriptApp.getService().getUrl();
    return guide.evaluate()
      .setTitle('Cómo reportar | Pan de Tata')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  const template = HtmlService.createTemplateFromFile('Index');
  template.initialCode = limpiarCodigoEquipo_(
    parameters.equipo ||
    parameters.codigo ||
    parameters['entry.88648657'] ||
    ''
  );
  template.logoUrl = APP_CONFIG.ASSET_BASE_URL + '/logopandetata.png';

  return template.evaluate()
    .setTitle('Reportar incidencia | Pan de Tata')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

function incluir_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
