function actualizarOpcionesConNavegacion() {
  // ==========================================
  // 1. CONFIGURACIÓN
  // ==========================================
  var ID_FORMULARIO = '1I0s8y8-dzQBCIAA3VzyKq60jitf5c3yvDVOA3DcSMGg'; 
  
  // IDs DE LAS SECCIONES DE DESTINO (Ya configurados)
  var ID_SECCION_EQUIPOS = '922578696';      // 'Información final'
  var ID_SECCION_FUERA_LISTA = '1606753609'; // 'Equipos fuera de lista'

  // CONFIGURACIÓN DE LA HOJA
  var NOMBRE_HOJA = "Base de Datos equipos";
  var COL_NOMBRE_EQUIPO = "Nombre del equipo original";
  var COL_ESTATUS = "Estatus";
  var COL_UBICACION = "Ubicación"; 
  var ESTATUS_ACTIVO = "Disponible";
  // ==========================================

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(NOMBRE_HOJA);
  
  if (!sheet) {
    console.error("❌ ERROR: No se encontró la hoja '" + NOMBRE_HOJA + "'");
    return;
  }

  // Obtenemos datos
  var data = sheet.getDataRange().getDisplayValues();
  if (data.length < 2) return;

  var headers = data[0].map(function(h) { return h.toString().trim().toLowerCase(); });
  
  var idxEquipo = headers.indexOf(COL_NOMBRE_EQUIPO.toLowerCase());
  var idxEstatus = headers.indexOf(COL_ESTATUS.toLowerCase());
  var idxUbicacion = headers.indexOf(COL_UBICACION.toLowerCase());

  if (idxEquipo === -1 || idxEstatus === -1 || idxUbicacion === -1) {
    console.error("❌ ERROR: No encuentro las columnas requeridas.");
    return;
  }

  // --- RECOPILAR DATOS ---
  var mapaUbicaciones = {}; 
  for (var i = 1; i < data.length; i++) {
    var equipo = data[i][idxEquipo].toString().trim();
    var estatus = data[i][idxEstatus].toString().trim();
    var ubicacion = data[i][idxUbicacion].toString().trim();

    if (estatus === ESTATUS_ACTIVO && ubicacion !== "" && equipo !== "") {
      if (!mapaUbicaciones[ubicacion]) mapaUbicaciones[ubicacion] = [];
      mapaUbicaciones[ubicacion].push(equipo);
    }
  }

  // --- ACTUALIZAR FORMULARIO ---
  try {
    var form = FormApp.openById(ID_FORMULARIO);
    var items = form.getItems();
    
    // Obtenemos las secciones de destino como objetos
    var pageEquipos = form.getItemById(ID_SECCION_EQUIPOS).asPageBreakItem();
    var pageFueraLista = form.getItemById(ID_SECCION_FUERA_LISTA).asPageBreakItem();

    var contador = 0;

    for (var j = 0; j < items.length; j++) {
      var item = items[j];
      var tituloPregunta = item.getTitle().trim();

      // Solo actuamos si es una lista desplegable y coincide con una ubicación de nuestra BD
      if (item.getType() === FormApp.ItemType.LIST && mapaUbicaciones[tituloPregunta]) {
        
        // 1. Limpiar duplicados y ordenar
        var opcionesUnicas = mapaUbicaciones[tituloPregunta].filter(function(v, i, a) {
          return a.indexOf(v) === i;
        });
        opcionesUnicas.sort();

        // 2. Construir las opciones con redirección
        var opcionesFinales = [];

        // A) Equipos normales -> Van a "Información final"
        opcionesUnicas.forEach(function(nombreEquipo) {
          opcionesFinales.push(item.asListItem().createChoice(nombreEquipo, pageEquipos));
        });

        // B) Opción especial -> Va a "Equipos fuera de lista"
        opcionesFinales.push(item.asListItem().createChoice("Artículo fuera de lista", pageFueraLista));

        // 3. Aplicar cambios
        item.asListItem().setChoices(opcionesFinales);
        contador++;
      }
    }
    console.log("✅ LISTO: Se actualizaron " + contador + " preguntas con la redirección configurada.");
    
  } catch (e) {
    console.error("❌ ERROR CRÍTICO: " + e.message);
    console.error("💡 Verifica que los IDs de las secciones sigan existiendo en el formulario.");
  }
}
///////////////////////////////////////////////////////////////////////////////////////////////
/**
 * Ejecuta esta función para ver en la consola qué equipos están duplicados
 */
function auditarDuplicadosEnHoja() {
  var NOMBRE_HOJA = "Base de Datos equipos";
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(NOMBRE_HOJA);
  
  var data = sheet.getDataRange().getDisplayValues();
  var headers = data[0].map(h => h.toString().trim());
  
  var idxEquipo = headers.indexOf("Nombre del equipo original");
  var idxUbicacion = headers.indexOf("Ubicación");
  var idxEstatus = headers.indexOf("Estatus");

  var registro = {};
  var duplicadosEncontrados = [];

  for (var i = 1; i < data.length; i++) {
    var equipo = data[i][idxEquipo].trim();
    var ubicacion = data[i][idxUbicacion].trim();
    var estatus = data[i][idxEstatus].trim();

    if (equipo === "" || estatus !== "Disponible") continue;

    // Creamos una "llave" única combinando equipo y ubicación
    var llave = equipo + " en " + ubicacion;

    if (registro[llave]) {
      duplicadosEncontrados.push("- " + llave + " (Fila " + (i + 1) + ")");
    } else {
      registro[llave] = true;
    }
  }

  if (duplicadosEncontrados.length > 0) {
    console.warn("⚠️ SE ENCONTRARON DUPLICADOS DISPONIBLES:");
    console.log(duplicadosEncontrados.join("\n"));
    SpreadsheetApp.getUi().alert("Se encontraron " + duplicadosEncontrados.length + " duplicados. Revisa el registro de ejecución (Ctrl+Enter).");
  } else {
    console.log("✅ No se encontraron equipos duplicados disponibles.");
    SpreadsheetApp.getUi().alert("¡Todo limpio! No hay equipos repetidos en la misma ubicación.");
  }
}
///////////////////////////////////////////////////////////////////////////////////////
function OBTENER_IDS_SECCIONES() {
  var ID_FORMULARIO = '1I0s8y8-dzQBCIAA3VzyKq60jitf5c3yvDVOA3DcSMGg'; // Tu ID actual
  var form = FormApp.openById(ID_FORMULARIO);
  var items = form.getItems(FormApp.ItemType.PAGE_BREAK); // Busca los saltos de sección
  
  if (items.length === 0) {
    console.log("❌ Tu formulario no tiene secciones (Páginas). Crea secciones primero.");
    return;
  }

  console.log("📋 COPIA ESTOS IDs PARA EL SIGUIENTE PASO:");
  items.forEach(function(item) {
    console.log("Sección: '" + item.getTitle() + "' --> ID: " + item.getId());
  });
}