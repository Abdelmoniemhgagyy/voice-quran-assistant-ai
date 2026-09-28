// Normalize Arabic: drop tashkeel/tatweel, unify alef, ta marbuta, ya, waw/hamza forms.
export const normalize = (s = "") =>
  s.replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/[ىئ]/g, "ي").replace(/ؤ/g, "و")
    .replace(/[^\u0621-\u064Aa-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

const bigrams = (s) => { const b = []; for (let i = 0; i < s.length - 1; i++) b.push(s.slice(i, i + 2)); return b; };
// Dice coefficient: 0..1 similarity, tolerant to pronunciation differences.
export function similarity(a, b) {
  if (a === b) return 1;
  const x = bigrams(a), y = bigrams(b);
  if (!x.length || !y.length) return 0;
  const pool = [...y]; let hit = 0;
  for (const g of x) { const i = pool.indexOf(g); if (i > -1) { hit++; pool.splice(i, 1); } }
  return (2 * hit) / (x.length + y.length);
}
