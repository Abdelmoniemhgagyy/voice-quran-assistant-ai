import { normalize, similarity } from "./arabic";

const ACTIONS = [
  ["next", /^(ال)?تالي|^بعده/],
  ["prev", /^(ال)?سابق|^قبله/],
  ["pause", /^(وقف|اوقف|ايقاف|بس|اسكت)/],
  ["resume", /^(كمل|استمر|كملي)/],
  ["replay", /^(اعد|كرر|اعاده)/],
  ["change", /^غير (ال)?(شيخ|قارئ|قاري)/],
];
const FILLER = new Set(["شغل", "شغلي", "افتح", "سوره", "بصوت", "الشيخ", "شيخ", "القارئ", "قارئ", "للشيخ", "بصوته", "عايز", "اسمع", "ياريت"]);
const strip = (w) => w.replace(/^ال/, "");

// Best surah match: exact substring first, then fuzzy over word windows.
function findSurah(n, surahs) {
  const words = n.split(" ");
  let best = null, bestScore = 0;
  for (const s of surahs) {
    const name = normalize(s.name).replace(/^سوره /, "");
    const len = name.split(" ").length;
    let score = n.includes(name) ? 1 + name.length / 100 : 0;
    for (let i = 0; !score && i + len <= words.length; i++)
      score = Math.max(score, similarity(words.slice(i, i + len).join(" "), name) * 0.95);
    if (score > bestScore) { best = s; bestScore = score; }
  }
  return bestScore >= 0.8 ? { surah: best, name: normalize(best.name).replace(/^سوره /, "") } : {};
}

// Reciter match: share of query tokens found (fuzzily) in the reciter's name.
function findReciter(words, reciters) {
  if (!words.length) return null;
  let best = null, bestScore = 0;
  for (const r of reciters) {
    const tokens = normalize(r.name).split(" ").map(strip);
    const score = words.reduce((sum, w) => sum + (tokens.some((t) => similarity(strip(w), t) >= 0.8) ? 1 : 0), 0) / words.length;
    if (score > bestScore) { best = r; bestScore = score; }
  }
  return bestScore >= 0.6 ? best : null;
}

export function parseCommand(text, surahs, reciters) {
  const n = normalize(text);
  for (const [action, re] of ACTIONS) if (re.test(n)) return { action };
  const { surah, name } = findSurah(n, surahs);
  const rest = name ? n.replace(name, " ") : n;
  const words = rest.split(" ").filter((w) => w && !FILLER.has(w));
  return { action: "play", surah, reciter: findReciter(words, reciters) };
}
