const STOP = new Set("this that with from have your about into they them will just what when where which there their would could should been were after before today tomorrow need want make like some more than then also only over under next week date note notes loose dump monday tuesday wednesday thursday friday saturday sunday january february march april june july august september october november december".split(" "));
const MONTHS = { jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12 };
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function addDays(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

function weekdayIndex(day) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function stamp(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1) return null;
  return date.toISOString().slice(0, 10);
}

function keywords(text) {
  const words = String(text).toLowerCase().match(/[a-z0-9][a-z0-9'-]{3,}/g) || [];
  return [...new Set(words.filter((word) => word.length >= 4 && !STOP.has(word)))];
}

function hashtags(text) {
  return [...new Set([...String(text).matchAll(/(^|\s)#([a-zA-Z][\w-]{1,40})/g)].map((match) => match[2].toLowerCase()))];
}

function wikis(text) {
  return [...String(text).matchAll(/\[\[([^\]\n]{1,80})\]\]/g)].map((match) => match[1].trim()).filter(Boolean);
}

function people(text) {
  const found = new Set();
  for (const match of String(text).matchAll(/\b(?:with|for|from|meet|call|email)\s+([A-Z][a-z]{2,}(?:\s[A-Z][a-z]{2,})?)/g)) found.add(match[1].toLowerCase());
  for (const match of String(text).matchAll(/\b([A-Z][a-z]{2,}\s[A-Z][a-z]{2,})\b/g)) found.add(match[1].toLowerCase());
  return [...found];
}

function datesIn(text, today) {
  const found = [];
  const lower = String(text).toLowerCase();
  const year = Number(today.slice(0, 4));
  if (/\btoday\b/.test(lower)) found.push({ day: today, due: false });
  if (/\btomorrow\b/.test(lower)) found.push({ day: addDays(today, 1), due: false });
  if (/\bnext week\b/.test(lower)) found.push({ day: addDays(today, 7), due: false });
  for (const match of lower.matchAll(/\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/g)) {
    const want = WEEKDAYS.indexOf(match[1]);
    const delta = (want - weekdayIndex(today) + 7) % 7 || 7;
    found.push({ day: addDays(today, delta), due: false });
  }
  for (const match of lower.matchAll(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/g)) {
    if (lower.slice(Math.max(0, match.index - 5), match.index).includes("next")) continue;
    const want = WEEKDAYS.indexOf(match[1]);
    const delta = (want - weekdayIndex(today) + 7) % 7;
    found.push({ day: addDays(today, delta), due: false });
  }
  for (const match of String(text).matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) {
    const day = stamp(Number(match[1]), Number(match[2]), Number(match[3]));
    if (day) found.push({ day, due: false });
  }
  for (const match of String(text).matchAll(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/g)) {
    const yr = match[3] ? (match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3])) : year;
    const day = stamp(yr, Number(match[1]), Number(match[2]));
    if (day) found.push({ day, due: false });
  }
  for (const match of lower.matchAll(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?\b/g)) {
    const day = stamp(match[3] ? Number(match[3]) : year, MONTHS[match[1].replace(".", "")], Number(match[2]));
    if (day) found.push({ day, due: false });
  }
  return found.map((item) => {
    const at = lower.indexOf(item.day.slice(5));
    const window = lower.slice(Math.max(0, at - 16), at + 12);
    return { day: item.day, due: /\b(due|deadline|by|before)\b/.test(window) };
  });
}

function pickDate(list) {
  if (!list.length) return null;
  const due = list.find((item) => item.due);
  return (due || list[0]).day;
}

function mode(list) {
  const counts = new Map();
  for (const item of list) counts.set(item, (counts.get(item) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || "";
}

function titleCase(value) {
  return value.split(/\s+/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function readNote(scrap, projects, today) {
  const text = String(scrap.text || "");
  const tags = hashtags(text);
  const names = people(text);
  const keys = keywords(text);
  const links = wikis(text).map((link) => link.toLowerCase());
  const known = projects.map((project) => project.name).filter((name) => name.length > 2 && text.toLowerCase().includes(name.toLowerCase()));
  return { id: scrap.id, text, tags, names, keys, links, known, day: pickDate(datesIn(text, today)) };
}

function score(a, b) {
  let points = 0;
  const sharedKeys = a.keys.filter((key) => b.keys.includes(key));
  points += Math.min(6, sharedKeys.length * 2);
  if (a.tags.some((tag) => b.tags.includes(tag))) points += 5;
  if (a.names.some((name) => b.names.includes(name))) points += 4;
  if (a.day && a.day === b.day) points += 3;
  if (a.known.some((name) => b.known.some((other) => other.toLowerCase() === name.toLowerCase()))) points += 4;
  if (a.links.some((link) => b.text.toLowerCase().includes(link)) || b.links.some((link) => a.text.toLowerCase().includes(link))) points += 6;
  return points;
}

function parent(parents, id) {
  if (parents.get(id) !== id) parents.set(id, parent(parents, parents.get(id)));
  return parents.get(id);
}

export function planDesk(desk, today) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(today || "") ? today : new Date().toISOString().slice(0, 10);
  const projects = Array.isArray(desk?.projects) ? desk.projects : [];
  const notes = (Array.isArray(desk?.scraps) ? desk.scraps : [])
    .filter((scrap) => scrap && !scrap.done && !scrap.threadId && !scrap.projectId && !scrap.targetDate)
    .slice(0, 80)
    .map((scrap) => readNote(scrap, projects, day));
  const parents = new Map(notes.map((note) => [note.id, note.id]));
  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length; j++) {
      if (score(notes[i], notes[j]) < 4) continue;
      const left = parent(parents, notes[i].id);
      const right = parent(parents, notes[j].id);
      if (left !== right) parents.set(right, left);
    }
  }
  const groups = new Map();
  for (const note of notes) {
    const key = parent(parents, note.id);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(note);
  }
  const threads = [];
  const places = [];
  for (const group of groups.values()) {
    const tag = mode(group.flatMap((note) => note.tags));
    const person = mode(group.flatMap((note) => note.names));
    const known = mode(group.flatMap((note) => note.known.map((name) => name.toLowerCase())));
    const word = mode(group.flatMap((note) => note.keys));
    const project = known ? titleCase(known) : tag ? titleCase(tag) : person ? titleCase(person) : "";
    const when = mode(group.map((note) => note.day).filter(Boolean));
    if (group.length >= 2) {
      const label = project || (word ? titleCase(word) : group[0].text.trim().slice(0, 60));
      threads.push({
        title: label.slice(0, 140) || "Untitled",
        project,
        targetDate: when || null,
        scrapIds: group.map((note) => note.id),
      });
    } else if (project || when) {
      places.push({ scrapId: group[0].id, project, targetDate: when || null });
    }
  }
  return { threads: threads.slice(0, 20), places: places.slice(0, 40) };
}
