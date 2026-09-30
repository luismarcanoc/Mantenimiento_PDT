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

context.obtenerCodigos_ = () => ['M-AA10-PCBOF', 'E-FT09-PCBTD', 'M-BL02-ACVPR'];
const base = {categoryCode:'M', typeCode:'AA', companyCode:'P', locationCode:'CB', areaCode:'OF'};
const selected = context.validarSeleccion_(base);
assert.equal(context.construirSiguienteCodigo_(selected), 'M-AA11-PCBOF');
assert.equal(context.construirSiguienteCodigo_(context.validarSeleccion_({...base, companyCode:'B'})), 'M-AA01-BCBOF');
assert.throws(() => context.validarSeleccion_({...base, typeCode:'LT'}), /tipo de equipo/i);
assert.throws(() => context.validarEquipo_({...base, name:'Equipo', imageUrl:'http://inseguro'}), /https/i);
assert.equal(context.validarEquipo_({...base, name:'  Aire   #2  '}).name, 'Aire #2');

context.obtenerCodigos_ = () => Array.from({length: 99}, (_, index) =>
  `M-AA${String(index + 1).padStart(2, '0')}-PCBOF`);
assert.throws(() => context.construirSiguienteCodigo_(selected), /agotó/i);

for (const name of ['Index.html','Styles.html','Scripts.html']) {
  assert.ok(read(name).length > 100, `${name} no puede estar vacío`);
}
new vm.Script(read('Scripts.html').replace(/^<script>\s*/, '').replace(/<\/script>\s*$/, ''));
console.log('OK: plantilla, consecutivo por empresa, validaciones y archivos del registrador.');
