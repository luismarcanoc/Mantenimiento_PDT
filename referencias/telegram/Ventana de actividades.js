/**
 * ÚNICA FUNCIÓN onOpen - Agrégala aquí para centralizar el menú
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('⚙️ Sistema de Gestión')
      .addItem('🔍 Ver Ficha del Equipo', 'showModal')
      .addSeparator() 
      .addItem('📡 Sincronizar Telegram', 'sincronizarTiemposTelegram') 
      .addToUi();
}

function showModal() {
  var html = HtmlService.createTemplateFromFile('Sidebar')
      .evaluate()
      .setWidth(1000)
      .setHeight(750);
  SpreadsheetApp.getUi().showModalDialog(html, 'Panel de Control de Mantenimiento');
}

function getActividadesEquipo() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  // Limpiamos el código seleccionado de espacios extras
  var valorCelda = sheet.getActiveCell().getValue().toString().trim();

  if (!valorCelda) return { error: "⚠️ Selecciona una celda con un código de equipo." };

  // --- 1. BUSCAR IMÁGENES EN "Base de Datos equipos" ---
  var sheetEquipos = ss.getSheetByName("Base de Datos equipos");
  var fotosEncontradas = [];
  
  if (sheetEquipos) {
    var dataEquipos = sheetEquipos.getDataRange().getValues();
    var headersEq = dataEquipos[0].map(h => h.toString().toLowerCase().trim());
    var colCodEq = headersEq.indexOf("código del equipo");
    var colImgEq = headersEq.indexOf("imágenes");

    if (colCodEq !== -1 && colImgEq !== -1) {
      for (var i = 1; i < dataEquipos.length; i++) {
        var codEnBase = dataEquipos[i][colCodEq].toString().trim();
        if (codEnBase.toLowerCase() === valorCelda.toLowerCase()) {
          var celdaImg = dataEquipos[i][colImgEq].toString();
          
          // Conversor robusto de IDs de Drive
          fotosEncontradas = celdaImg.split(/[\s,;]+/).filter(url => url.includes("drive.google.com")).map(url => {
            var id = url.match(/[-\w]{25,}/);
            // IMPORTANTE: Cambiamos a formato de previsualización para evitar bloqueos
            return id ? "https://lh3.googleusercontent.com/u/0/d/" + id[0] : url;
          });
          break;
        }
      }
    }
  }

  // --- 2. BUSCAR ACTIVIDADES EN "Base de datos actividades" ---
  var sheetAct = ss.getSheetByName("Base de datos actividades");
  var listaActividades = [];
  
  if (sheetAct) {
    var dataAct = sheetAct.getDataRange().getValues();
    var headersAct = dataAct[0].map(h => h.toString().toLowerCase().trim());
    var colEqAct = headersAct.indexOf("código del equipo");
    var colCodAct = headersAct.indexOf("código de actividad");
    var colDescAct = headersAct.indexOf("descripción de la actividad");
    var colFechaAct = headersAct.indexOf("última ejecución");
    var colLinkAct = headersAct.indexOf("link ot");

    if (colEqAct !== -1) {
      for (var j = 1; j < dataAct.length; j++) {
        var codActEnBase = dataAct[j][colEqAct].toString().trim();
        if (codActEnBase.toLowerCase() === valorCelda.toLowerCase()) {
          var fRaw = dataAct[j][colFechaAct];
          var fFormat = (fRaw instanceof Date) ? Utilities.formatDate(fRaw, ss.getSpreadsheetTimeZone(), "dd/MM/yyyy") : fRaw;
          
          listaActividades.push({
            codigo: dataAct[j][colCodAct] || "-",
            desc: dataAct[j][colDescAct] || "-",
            fecha: fFormat || "-",
            link: dataAct[j][colLinkAct] || ""
          });
        }
      }
    }
  }

  return { codigo: valorCelda, fotos: fotosEncontradas, actividades: listaActividades };
}