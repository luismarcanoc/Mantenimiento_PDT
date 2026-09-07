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
