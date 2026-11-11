import type { DaySchedule, WeeklySchedule } from '../types';

export const scheduleDays = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
export const daySlots = (day?: DaySchedule) => !day ? [] : day.slots ?? [{ openTime: day.openTime || '11:00', closeTime: day.closeTime || '23:00' }];
const minutes = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : NaN;

export function weeklyScheduleError(schedule: WeeklySchedule): string {
  const intervals: { start: number; end: number; day: string }[] = [];
  for (const [index, id] of scheduleDays.entries()) {
    const day = schedule[id];
    if (!day?.isOpen) continue;
    if (!daySlots(day).length) return `Agrega al menos un horario para ${id}.`;
    for (const slot of daySlots(day)) {
      const start = minutes(slot.openTime), end = minutes(slot.closeTime);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return `Completa las horas de ${id}.`;
      intervals.push({ start: index * 1440 + start, end: index * 1440 + end + (end <= start ? 1440 : 0), day: id });
    }
  }
  for (let i = 0; i < intervals.length; i++) for (let j = i + 1; j < intervals.length; j++) {
    const a = intervals[i], b = intervals[j];
    for (const offset of [-10080, 0, 10080]) {
      if (a.start < b.end + offset && b.start + offset < a.end) return `Los horarios de ${a.day} y ${b.day} se superponen.`;
    }
  }
  return '';
}

export function evaluateWeeklySchedule(schedule: WeeklySchedule, dayIndex: number, currentMinutes: number, dayLabel: string) {
  const today = schedule[scheduleDays[dayIndex]];
  const previous = schedule[scheduleDays[(dayIndex + 6) % 7]];
  const overnight = previous?.isOpen && daySlots(previous).find(slot => {
    const start = minutes(slot.openTime), end = minutes(slot.closeTime);
    return end <= start && currentMinutes < end;
  });
  const slots = today?.isOpen ? daySlots(today) : [];
  const active = slots.find(slot => {
    const start = minutes(slot.openTime), end = minutes(slot.closeTime);
    return currentMinutes >= start && (end <= start || currentMinutes < end);
  });
  const current = overnight || active;
  return {
    scheduleActive: true,
    isClosedBySchedule: !current,
    isOpenToday: Boolean(today?.isOpen || overnight),
    dayLabel,
    todayScheduleText: overnight ? `Turno extendido hasta las ${overnight.closeTime}` : slots.length ? slots.map(slot => `${slot.openTime} - ${slot.closeTime}${slot.closeTime <= slot.openTime ? ' (día siguiente)' : ''}`).join(' y ') : `Cerrado los ${dayLabel}s`,
    openTime: (current || slots[0])?.openTime,
    closeTime: (current || slots[0])?.closeTime,
  };
}
