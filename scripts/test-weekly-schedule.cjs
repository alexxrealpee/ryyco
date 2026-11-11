const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/weeklySchedule.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: mod.exports });
const { daySlots, weeklyScheduleError, evaluateWeeklySchedule } = mod.exports;
const day = (...pairs) => ({ isOpen: true, openTime: pairs[0][0], closeTime: pairs[0][1], slots: pairs.map(([openTime, closeTime]) => ({ openTime, closeTime })) });
test('split shifts respect inclusive openings and exclusive closings', () => {
  const week = { lunes: day(['09:00', '12:00'], ['14:00', '21:00']) };
  assert.equal(weeklyScheduleError(week), '');
  for (const [minute, open] of [[539,false],[540,true],[719,true],[720,false],[839,false],[840,true],[1260,false]]) {
    assert.equal(!evaluateWeeklySchedule(week, 1, minute, 'Lunes').isClosedBySchedule, open);
  }
});
test('Saturday overnight belongs to Sunday, not Saturday morning, even if Sunday is closed', () => {
  const week = { sabado: day(['11:00','01:00']), domingo: { ...day(['12:00','18:00']), isOpen: false } };
  assert.equal(evaluateWeeklySchedule(week,6,30,'Sábado').isClosedBySchedule,true);
  assert.equal(evaluateWeeklySchedule(week,6,23*60,'Sábado').isClosedBySchedule,false);
  assert.equal(evaluateWeeklySchedule(week,0,30,'Domingo').isClosedBySchedule,false);
  assert.equal(evaluateWeeklySchedule(week,0,60,'Domingo').isClosedBySchedule,true);
});
test('legacy days remain supported and closed days keep their slots', () => {
  const legacy = { isOpen: true, openTime:'10:00',closeTime:'20:00' };
  assert.equal(daySlots(legacy).length,1);
  assert.equal(evaluateWeeklySchedule({martes:legacy},2,600,'Martes').isClosedBySchedule,false);
  assert.equal(evaluateWeeklySchedule({martes:{...legacy,isOpen:false}},2,600,'Martes').isClosedBySchedule,true);
});
test('reject overlaps, malformed and empty active shifts, including week boundary', () => {
  assert.ok(weeklyScheduleError({ lunes:day(['09:00','13:00'],['12:00','14:00']) }));
  assert.ok(weeklyScheduleError({ sabado:day(['23:00','02:00']),domingo:day(['01:00','03:00']) }));
  assert.ok(weeklyScheduleError({ lunes:day(['','12:00']) }));
  assert.ok(weeklyScheduleError({ lunes:{isOpen:true,slots:[]} }));
  assert.equal(weeklyScheduleError({ lunes:day(['09:00','12:00'],['12:00','14:00']) }), '');
  assert.equal(weeklyScheduleError({ lunes:day(['00:00','00:00']) }), '');
});
const firebaseSource = ts.createSourceFile('firebase.ts', fs.readFileSync('src/lib/firebase.ts','utf8'), ts.ScriptTarget.Latest, true);
const context = { ...mod.exports, Intl, Date, console };
vm.createContext(context);
for (const name of ['getColombiaCurrentDayAndMinutes','getStoreOperatingScheduleInfo','checkIsStoreClosed']) {
  const fn = firebaseSource.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  vm.runInContext(ts.transpileModule(fn.getText(firebaseSource).replace(/^export /,''),{}).outputText,context);
}
test('Colombia calendar changes at 05:00 UTC independently of device timezone', () => {
  const OriginalDate = context.Date;
  for (const [instant, expectedDay, expectedMinute] of [['2026-11-08T04:30:00Z',6,1410],['2026-11-08T05:30:00Z',0,30]]) {
    context.Date = class extends Date { constructor() { super(instant); } static now() { return Date.parse(instant); } };
    const actual = context.getColombiaCurrentDayAndMinutes();
    assert.equal(actual.dayIndex,expectedDay);
    assert.equal(actual.currentMinutes,expectedMinute);
  }
  context.Date = OriginalDate;
});
test('manual closure and suspension override active shifts; disabled schedules stay disabled', () => {
  context.getColombiaCurrentDayAndMinutes = () => ({dayId:'lunes',dayIndex:1,dayLabel:'Lunes',currentMinutes:600});
  const profile = { scheduleEnabled:true, subscriptionStatus:'active', weeklySchedule:{lunes:day(['09:00','12:00'],['14:00','21:00'])} };
  assert.equal(context.checkIsStoreClosed(profile),false);
  assert.equal(context.checkIsStoreClosed({...profile,isClosed:true}),true);
  assert.equal(context.checkIsStoreClosed({...profile,suspended:true}),true);
  context.getColombiaCurrentDayAndMinutes = () => ({dayId:'lunes',dayIndex:1,dayLabel:'Lunes',currentMinutes:780});
  assert.equal(context.checkIsStoreClosed(profile),true);
  assert.equal(context.checkIsStoreClosed({...profile,scheduleEnabled:false}),false);
});
