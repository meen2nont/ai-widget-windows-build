// WebDashboard/time.js
// Shared Thailand timezone helpers.
//
// Thailand is fixed at UTC+7 (no DST). All helpers derive the Bangkok wall-clock
// from UTC directly, so results are deterministic regardless of the host's
// timezone database (Node, browser, or Docker). Do NOT use `timeZone: 'Asia/Bangkok'`
// here — it depends on the host TZ data which may be stale or missing.

// Shift a Date to the Bangkok wall-clock instant (UTC+7).
export function toBangkok(d = new Date()) {
  return new Date(d.getTime() + 7 * 3600 * 1000);
}

// Bangkok hour of day (0-23).
export function getBangkokHour(d = new Date()) {
  return (d.getUTCHours() + 7) % 24;
}

// True during DeepSeek peak pricing (Thailand time): 08:00-11:00 and 13:00-17:00.
export function isPeakHour(d = new Date()) {
  const hour = getBangkokHour(d);
  return (hour >= 8 && hour < 11) || (hour >= 13 && hour < 17);
}

// Full Thai-formatted string (e.g. "วันอังคารที่ 4 สิงหาคม 2569 ...").
// Formatting uses timeZone:'UTC' on the shifted date so no host TZ data is needed.
export function formatBangkokFull(d = new Date()) {
  return toBangkok(d).toLocaleString('th-TH', { timeZone: 'UTC', dateStyle: 'full', timeStyle: 'medium' });
}

// Thai weekday name (e.g. "อังคาร").
export function bangkokDayOfWeek(d = new Date()) {
  return toBangkok(d).toLocaleDateString('th-TH', { timeZone: 'UTC', weekday: 'long' });
}

// Bangkok date as YYYY-MM-DD (for comparing calendar days).
export function bangkokDateStr(d = new Date()) {
  return toBangkok(d).toLocaleDateString('en-CA', { timeZone: 'UTC' });
}

// Bangkok time of day (HH:mm:ss) without date.
export function formatBangkokTime(d = new Date()) {
  return toBangkok(d).toLocaleTimeString('th-TH', { timeZone: 'UTC', hour12: false });
}

// Bangkok date as a Thai short string (e.g. "4 ส.ค. 2569"), deterministic.
export function formatBangkokDateShort(d = new Date()) {
  return toBangkok(d).toLocaleDateString('th-TH', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
}

// Bangkok day + short month (e.g. "4 Aug") for period labels, deterministic.
export function formatBangkokDayMonth(d = new Date()) {
  return toBangkok(d).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' });
}
