export function weeklyAllowance(env) {
  const amount = Number(env.WEEKLY_TOKENS);
  return Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : 50000;
}

export function chicagoWeek(now = new Date()) {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short" }).format(now);
  const index = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[weekday] ?? 0;
  const back = (index + 6) % 7;
  const [year, month, day] = ymd.split("-").map(Number);
  const monday = new Date(Date.UTC(year, month - 1, day));
  monday.setUTCDate(monday.getUTCDate() - back);
  const next = new Date(monday);
  next.setUTCDate(next.getUTCDate() + 7);
  return { key: monday.toISOString().slice(0, 10), resets: next.toISOString().slice(0, 10) };
}
