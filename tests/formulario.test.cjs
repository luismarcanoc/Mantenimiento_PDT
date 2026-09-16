const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, 'app', name), 'utf8');
const context = vm.createContext({
  console,
  texto_: value => String(value == null ? '' : value).trim(),
  normalizarClave_: value => String(value == null ? '' : value).trim().toUpperCase(),
  Session: { getActiveUser: () => ({ getEmail: () => '' }) }
});
vm.runInContext(read('Reports.js'), context);
const base = {personaReporta: 'Persona prueba', descripcion: 'Pared agrietada',
  sinEquipo: true, nombreEquipo: 'Pared', ubicacion: 'Sede', prioridad: 'MEDIA'};
for (const tipoReporte of ['MECANICO', 'SERVICIOS_GENERALES', 'IT', 'MANTENIMIENTO']) {
  assert.equal(context.validarReporte_({...base, tipoReporte}).tipoReporte, tipoReporte);
}
assert.throws(() => context.validarReporte_({...base, tipoReporte: 'OTRO'}));
assert.equal(context.obtenerCorreoUsuarioDisponible(), '');
context.Session.getActiveUser = () => { throw Error('Sin autorización'); };
assert.equal(context.validarReporte_({...base, tipoReporte:'IT'}).correoReporta, '');
context.Session.getActiveUser = () => ({getEmail: () => 'VISITANTE@example.com'});
assert.equal(context.obtenerCorreoUsuarioDisponible(), 'visitante@example.com');
assert.equal(context.validarReporte_({...base, tipoReporte:'IT'}).correoReporta, 'visitante@example.com');
assert.equal(context.validarReporte_({...base, tipoReporte:'IT', correoReporta:'manual@example.com'}).correoReporta, 'manual@example.com');
const equipment = (code, area, extra={}) => ({CODIGO_EQUIPO:code, NOMBRE:'Filtro',
  UBICACION:'Bello Campo', AREA:area, ACTIVO:true, MARCA:'Marca', INFORMACION:'Máquina de hielo', ...extra});
context.leerEquipos_ = () => [equipment('A','Tienda'), equipment('B','Producción'),
  equipment('C',''), equipment('D','Otra',{ACTIVO:false}), equipment('E','Ajena',{UBICACION:'Otra sede'})];
assert.deepEqual(Array.from(context.obtenerAreasEquipos('Bello Campo')), ['Producción','Tienda']);
assert.equal(context.buscarEquiposPorUbicacion('Bello Campo', '', '').length, 3);
assert.equal(context.buscarEquiposPorUbicacion('Bello Campo', 'hielo', 'tienda')[0].codigo, 'A');
assert.equal(context.buscarEquiposPorUbicacion('Bello Campo', '', 'Produccion')[0].codigo, 'B');
assert.equal(context.buscarEquiposPorUbicacion('Bello Campo', '', 'Inexistente').length, 0);
assert.equal(context.buscarEquiposPorUbicacion('', '', '').length, 0);
assert.equal(context.obtenerEquipoPorCodigo('A').marca, 'Marca');
assert.equal(context.obtenerEquipoPorCodigo('A').informacion, 'Máquina de hielo');
assert.equal(context.obtenerEquipoPorCodigo('D'), null);
vm.runInContext(read('Config.js'), context);
vm.runInContext(read('Telegram.js'), context);
const message = context.construirMensajeReporteTelegram_({TIPO_REPORTE:'SERVICIOS_GENERALES',
  NUMERO_REPORTE:12, DESCRIPCION:'Pared <norte>'}, []);
assert.match(message, /Servicios generales/);
assert.match(message, /&lt;norte&gt;/);
let template;
context.HtmlService = {createTemplateFromFile: name => {
  template = {name, evaluate: () => ({setTitle() {return this;}, addMetaTag() {return this;}})};
  return template;
}};
vm.runInContext(read('Code.js'), context);
for (const param of ['equipo','codigo','entry.88648657']) {
  context.doGet({parameter:{[param]:'M-AA10-PCBOF'}});
  assert.equal(template.initialCode, 'M-AA10-PCBOF');
}
new vm.Script(read('Scripts.html').replace(/^<script>\s*/, '').replace(/<\/script>\s*$/, ''));
console.log('OK: tipos nuevos y antiguos, correo, áreas, ficha, Telegram y parámetros QR.');
