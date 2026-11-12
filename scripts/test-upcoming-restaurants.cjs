const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
function load(file, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: name => dependencies[name], Intl, Date });
  return exports;
}
const schedule = load('src/lib/weeklySchedule.ts');
const { nextRestaurantOpening: next, isUpcomingRestaurantEligible: eligible } = load('src/lib/upcomingRestaurants.ts', { './weeklySchedule': schedule });
const day = (...pairs) => ({ isOpen: true, slots: pairs.map(([openTime,closeTime]) => ({openTime,closeTime})) });
const profile = { username:'test', displayName:'Test', scheduleEnabled:true, weeklySchedule:{lunes:day(['09:00','12:00'],['14:00','21:00'])} };
const at = value => Date.parse(value);
test('split shifts choose next opening during lunch, without altering saved schedules', () => {
  const original = JSON.stringify(profile);
  const result = next(profile,at('2026-11-09T18:00:00Z'));
  assert.equal(result.at,at('2026-11-09T19:00:00Z'));
  assert.match(result.label,/Abre a las 2:00/);
  assert.equal(JSON.stringify(profile),original);
});
test('tomorrow and next week use Bogota dates', () => {
  assert.match(next(profile,at('2026-11-09T04:00:00Z')).label,/mañana/);
  assert.equal(next(profile,at('2026-11-10T02:00:00Z')).at,at('2026-11-16T14:00:00Z'));
});
test('overnight shift stays open until exact closing time', () => {
  const p = {...profile,weeklySchedule:{sabado:day(['11:00','01:00']),domingo:day(['12:00','18:00'])}};
  assert.equal(next(p,at('2026-11-08T05:30:00Z')).label,'Abierto ahora');
  assert.equal(next(p,at('2026-11-08T06:00:00Z')).at,at('2026-11-08T17:00:00Z'));
});
test('manual closure and missing schedules never promise reopening', () => {
  assert.equal(next({...profile,isClosed:true}).label,'Temporalmente cerrado');
  assert.equal(next({...profile,scheduleEnabled:false}).label,'Horario no disponible');
  assert.equal(next({...profile,weeklySchedule:{lunes:{isOpen:true}}},at('2026-11-09T18:00:00Z')).at,null);
});
test('legacy daily schedules are supported', () => {
  const result = next({...profile,weeklySchedule:undefined,restaurantDaysOpen:['martes'],openTime:'10:00',closeTime:'20:00'},at('2026-11-09T18:00:00Z'));
  assert.equal(result.at,at('2026-11-10T15:00:00Z'));
});
test('suspended, archived, unpublished and inactive profiles are excluded', () => {
  assert.equal(eligible(profile),true);
  for (const flags of [{suspended:true},{archived:true},{isPublished:false},{active:false},{subscriptionStatus:'expired'},{role:'driver'},{status:'draft'}]) assert.equal(eligible({...profile,...flags}),false);
});
