function obtenerFilas() {
  var datos = [
    ["Ubicación","Área"],
    ["Edificio Central", "Sótano"],
    ["Edificio Central", "Piso 1"],
    ["Planta Norte", "Empaque"]
  ];
  var encabezados = datos[0];
  var filas = [];
  for (var i = 1; i < datos.length; i++) {
    var filaActual = datos[i];
    var objetoFila = {};
    objetoFila["Ubicación"] = filaActual[0];
    objetoFila["Área"] = filaActual[1];
    filas.push(objetoFila);
  }
  return filas;
}

function probar() {
  var resultado = obtenerFilas();
  console.log(resultado);
}
