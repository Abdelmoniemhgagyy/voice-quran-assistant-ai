const BASE = "https://mp3quran.net/api/v3";
let cache = null; // in-memory cache: fetch once per session

async function get(path) {
  const res = await fetch(`${BASE}/${path}?language=ar`);
  if (!res.ok) throw new Error("bad status");
  return res.json();
}

export async function loadData() {
  if (cache) return cache;
  try {
    const [s, r] = await Promise.all([get("suwar"), get("reciters")]);
    cache = {
      surahs: s.suwar || [],
      reciters: (r.reciters || []).filter((x) => Array.isArray(x.moshaf) && x.moshaf.length),
    };
    return cache;
  } catch {
    throw new Error("تعذر تحميل البيانات. تأكد من اتصال الإنترنت وحاول مرة أخرى.");
  }
}

// First moshaf of the reciter that actually contains the surah.
export const findMoshaf = (reciter, id) =>
  reciter.moshaf.find((m) => m.server && (m.surah_list || "").split(",").includes(String(id)));

export const audioUrl = (moshaf, id) => moshaf.server + String(id).padStart(3, "0") + ".mp3";
