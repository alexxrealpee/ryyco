import type { UserProfile, WeeklySchedule } from '../types';
import { daySlots, scheduleDays, evaluateWeeklySchedule } from './weeklySchedule';

const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export function nextRestaurantOpening(profile: UserProfile, now = Date.now()) {
  const unknown = { at: null as number | null, label: 'Horario no disponible' };
  if (profile.isClosed) return { ...unknown, label: 'Temporalmente cerrado' };
  if (!profile.scheduleEnabled) return unknown;
  const schedule: WeeklySchedule = profile.weeklySchedule ? { ...profile.weeklySchedule } : Object.fromEntries(scheduleDays.map(id => [id, {
    isOpen: (profile.restaurantDaysOpen || scheduleDays).includes(id),
    openTime: profile.openTime || '', closeTime: profile.closeTime || '',
  }]));
  for (const [id, day] of Object.entries(schedule)) {
    schedule[id] = { ...day, slots: day.slots ?? [{ openTime: day.openTime || '', closeTime: day.closeTime || '' }] };
  }
  // Colombia is UTC-5 throughout the year. Format all user-facing dates explicitly in Bogota.
  const colombia = new Date(now - 5 * 3600000);
  const midnight = Date.UTC(colombia.getUTCFullYear(), colombia.getUTCMonth(), colombia.getUTCDate()) + 5 * 3600000;
  const dayIndex = colombia.getUTCDay();
  const currentMinutes = colombia.getUTCHours() * 60 + colombia.getUTCMinutes();
  if (!evaluateWeeklySchedule(schedule, dayIndex, currentMinutes, dayNames[dayIndex]).isClosedBySchedule) return { at: now, label: 'Abierto ahora' };
  let at = Infinity;
  for (let offset = 0; offset <= 7; offset++) {
    const day = schedule[scheduleDays[(dayIndex + offset) % 7]];
    if (!day?.isOpen) continue;
    for (const slot of daySlots(day)) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.openTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.closeTime)) continue;
      const [hour, minute] = slot.openTime.split(':').map(Number);
      const candidate = midnight + offset * 86400000 + (hour * 60 + minute) * 60000;
      if (candidate > now) at = Math.min(at, candidate);
    }
  }
  if (!Number.isFinite(at)) return unknown;
  const offset = Math.floor((at - midnight) / 86400000);
  const time = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: 'numeric', minute: '2-digit', hour12: true }).format(at);
  return { at, label: `Abre ${offset === 0 ? '' : offset === 1 ? 'mañana ' : `el ${dayNames[(dayIndex + offset) % 7]} `}a las ${time}` };
}

export function isUpcomingRestaurantEligible(profile: UserProfile) {
  const flags = profile as UserProfile & Record<string, unknown>;
  return Boolean(profile.username && (profile.displayName || profile.storeName || profile.username)) &&
    profile.role !== 'driver' && profile.role !== 'admin' && !profile.suspended && !profile.archived &&
    !['expired', 'suspended'].includes(profile.subscriptionStatus || '') &&
    !['active', 'isActive', 'published', 'isPublished', 'enabled'].some(key => flags[key] === false) &&
    !['inactive', 'disabled', 'deactivated', 'draft', 'unpublished'].includes(String(flags.status || ''));
}
