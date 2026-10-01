const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', 'registro_equipos');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const context = vm.createContext({
  console,
  HtmlService: {},
  Session: {getActiveUser: () => ({getEmail: () => 'admin@example.com'})},
  PropertiesService: {getScriptProperties: () => ({getProperty: () => 'admin@example.com'})},
  LockService: {getScriptLock: () => ({waitLock() {}, releaseLock() {}})},
  Utilities: {getUuid: () => 'uuid'},
  SpreadsheetApp: {},
  CacheService: {getScriptCache: () => ({remove() {}})}
});
vm.runInContext(read('Config.js'), context);
vm.runInContext(read('Code.js'), context);

context.leerEquipos_ = () => [
  {ID_EQUIPO:'old-1', CODIGO_EQUIPO:'M-AA10-PCBOF', TIPO_EQUIPO:'Aire acondicionado', UBICACION:'Caracas, Bello Campo', AREA:'Oficina Producción', NOMBRE:'Aire acondicionado #2', ACTIVO:true},
  {ID_EQUIPO:'old-2', CODIGO_EQUIPO:'M-AA12-BCPPR', TIPO_EQUIPO:'Aire acondicionado', UBICACION:'Caracas, Los Palos Grandes', AREA:'Área de producción', NOMBRE:'Aire acondicionado #4', ACTIVO:true},
  {ID_EQUIPO:'old-3', CODIGO_EQUIPO:'M-AA08-PCBOF', TIPO_EQUIPO:'Aire acondicionado', UBICACION:'Caracas, Bello Campo', AREA:'Oficina Producción', NOMBRE:'Aire acondicionado #1', ACTIVO:false, ESTATUS:'INHABILITADO'}
];
const base = {categoryCode:'M', typeCode:'AA', companyCode:'P', locationCode:'CB', areaCode:'OF'};
const selected = context.validarSeleccion_(base);
assert.equal(context.construirSiguienteCodigo_(selected), 'M-AA13-PCBOF');
const standardPlan = context.construirPlanNumeracion_(selected, '');
assert.equal(standardPlan.globalNumber, 13);
assert.equal(standardPlan.localNumber, 3);
const replacementPlan = context.construirPlanNumeracion_(selected, 'old-3');
assert.equal(replacementPlan.globalNumber, 13);
assert.equal(replacementPlan.localNumber, 1);
assert.equal(replacementPlan.replaced.ID_EQUIPO, 'old-3');
assert.throws(() => context.validarSeleccion_({...base, typeCode:'LT'}), /tipo de equipo/i);
assert.throws(() => context.validarEquipo_({...base, name:'Equipo', imageUrl:'http://inseguro'}), /https/i);
assert.equal(context.validarEquipo_({...base, name:'  Aire   #2  '}).name, 'Aire #2');
assert.equal(context.construirNombreLocal_('Aire acondicionado #99','Aire acondicionado',3),'Aire acondicionado #3');

context.leerEquipos_ = () => Array.from({length: 99}, (_, index) => ({
  CODIGO_EQUIPO:`M-AA${String(index + 1).padStart(2, '0')}-PCBOF`,
  TIPO_EQUIPO:'Aire acondicionado', UBICACION:'Caracas, Bello Campo', AREA:'Oficina Producción', NOMBRE:`Aire acondicionado #${index+1}`
}));
assert.throws(() => context.construirSiguienteCodigo_(selected), /agotó/i);

for (const name of ['Index.html','Styles.html','Scripts.html']) {
  assert.ok(read(name).length > 100, `${name} no puede estar vacío`);
}
new vm.Script(read('Scripts.html').replace(/^<script>\s*/, '').replace(/<\/script>\s*$/, ''));
console.log('OK: numeración global/local, reemplazo seguro, validaciones y archivos del registrador.');
