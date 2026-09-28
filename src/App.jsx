import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { audioUrl, findMoshaf, loadData } from "./api/mp3quran";
import { normalize } from "./utils/arabic";
import { parseCommand } from "./utils/parseCommand";
import useAudioPlayer from "./hooks/useAudioPlayer";
import useLocalStorage from "./hooks/useLocalStorage";
import useSpeechRecognition from "./hooks/useSpeechRecognition";
import useSpeechSynthesis from "./hooks/useSpeechSynthesis";

const EXAMPLES = ["شغل سورة الكهف بصوت المنشاوي", "شغل سورة يس بصوت العفاسي", "سورة الرحمن بصوت الحصري", "التالي"];
const fmt = (t) => (isFinite(t) ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}` : "0:00");
const Card = ({ children, className = "" }) => (
  <section className={`rounded-3xl border border-white/30 dark:border-white/10 bg-white/60 dark:bg-white/5 backdrop-blur-xl shadow-xl p-5 sm:p-6 ${className}`}>{children}</section>
);
const IconBtn = ({ label, onClick, children, className = "" }) => (
  <button aria-label={label} title={label} onClick={onClick} className={`min-h-11 min-w-11 grid place-items-center rounded-full bg-deep/10 dark:bg-white/10 hover:bg-deep/20 transition ${className}`}>{children}</button>
);

function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

// Searchable list (renders first 60 matches only, for performance).
const PickList = memo(function PickList({ title, items, selected, onSelect, favs }) {
  const [q, setQ] = useState("");
  const dq = normalize(useDebounced(q));
  const shown = useMemo(() => items.filter((i) => normalize(i.name).includes(dq)).slice(0, 60), [items, dq]);
  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`ابحث: ${title}`} aria-label={`ابحث: ${title}`}
        className="w-full min-h-11 rounded-xl px-3 mb-2 bg-white/70 dark:bg-black/30 border border-teal2/30" />
      <ul className="max-h-64 overflow-y-auto rounded-xl space-y-1">
        {shown.map((i) => (
          <li key={i.id}>
            <button onClick={() => onSelect(i)} className={`w-full min-h-11 px-3 text-start rounded-lg transition ${selected?.id === i.id ? "bg-teal2 text-white" : "hover:bg-teal2/15"}`}>
              {favs?.includes(i.id) && "★ "}{i.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
});

export default function App() {
  const [dark, setDark] = useLocalStorage("vqa-dark", window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
  const [speakOn, setSpeakOn] = useLocalStorage("vqa-speak", true);
  const [history, setHistory] = useLocalStorage("vqa-history", []);
  const [favs, setFavs] = useLocalStorage("vqa-favs", []);
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState("");
  const [cur, setCur] = useState(null); // { surah, reciter }
  const [pick, setPick] = useState({ surah: null, reciter: null });
  const pending = useRef({}); // partial command awaiting the missing piece
  const curRef = useRef(null);
  curRef.current = cur;

  const speak = useSpeechSynthesis(speakOn);
  const rec = useSpeechRecognition();
  const showToast = useCallback((m) => { setToast(m); setTimeout(() => setToast(""), 4000); }, []);

  const fetchData = useCallback(() => { setLoadError(""); loadData().then(setData).catch((e) => setLoadError(e.message)); }, []);
  useEffect(fetchData, [fetchData]);
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);

  const step = useCallback((dir) => {
    const c = curRef.current; if (!c) return showToast("شغّل سورة أولًا");
    const m = findMoshaf(c.reciter, c.surah.id);
    const ids = (m?.surah_list || "").split(",").map(Number).sort((a, b) => a - b);
    const next = ids[ids.indexOf(c.surah.id) + dir];
    const s = data.surahs.find((x) => x.id === next);
    s ? playRef.current(s, c.reciter) : showToast("لا توجد سورة أخرى في هذا الاتجاه");
  }, [data, showToast]);

  const player = useAudioPlayer({
    onEnded: () => step(1), onError: showToast, onNext: () => step(1), onPrev: () => step(-1),
  });

  const play = useCallback((surah, reciter, announce = true) => {
    const m = findMoshaf(reciter, surah.id);
    if (!m) return showToast(`الشيخ ${reciter.name} ليس لديه سورة ${surah.name}`);
    setCur({ surah, reciter });
    player.load(audioUrl(m, surah.id), surah.name, reciter.name);
    setHistory((h) => [{ s: surah.id, r: reciter.id }, ...h.filter((x) => !(x.s === surah.id && x.r === reciter.id))].slice(0, 10));
    if (announce) speak(`تمام، بشغل ${surah.name} بصوت ${reciter.name}`);
  }, [player.load, showToast, speak, setHistory]);
  const playRef = useRef(play); playRef.current = play;

  // Ask a question by voice, then listen for the answer.
  const ask = useCallback((question) => {
    speak(question, () => setTimeout(() => rec.start(handleText), 300));
    if (!speakOn) showToast(question);
  }, [speak, speakOn]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleText(text) {
    if (!data) return;
    const cmd = parseCommand(text, data.surahs, data.reciters);
    const actions = {
      next: () => step(1), prev: () => step(-1), pause: player.pause, resume: player.resume,
      replay: () => { player.seek(0); player.resume(); },
      change: () => { pending.current = { surah: curRef.current?.surah }; ask("بصوت مين؟"); }
    };
    if (actions[cmd.action]) return actions[cmd.action]();
    const surah = cmd.surah || pending.current.surah, reciter = cmd.reciter || pending.current.reciter;
    pending.current = { surah, reciter };
    if (!surah) return ask("أي سورة تحب؟");
    if (!reciter) return ask("بصوت مين؟");
    pending.current = {};
    play(surah, reciter);
  }

  // Keyboard shortcuts: Space = play/pause, arrows = seek.
  useEffect(() => {
    const onKey = (e) => {
      if (/INPUT|BUTTON|SELECT/.test(e.target.tagName) && e.code === "Space") return;
      if (e.target.tagName === "INPUT") return;
      if (e.code === "Space") { e.preventDefault(); player.toggle(); }
      if (e.code === "ArrowLeft") player.seek(player.time + 10);
      if (e.code === "ArrowRight") player.seek(player.time - 10);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const status = { idle: "اضغط على الميكروفون وتكلم", listening: "بسمعك...", processing: "جاري التحليل...", error: rec.error }[rec.state];
  const favReciters = data ? data.reciters.filter((r) => favs.includes(r.id)) : [];
  const toggleFav = (id) => setFavs((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  return (
    <div className="min-h-screen pb-28 text-deep dark:text-emerald-50">
      <header className="max-w-6xl mx-auto flex items-center justify-between p-4">
        <h1 className="font-quran text-3xl font-bold text-teal2 dark:text-gold">۞ مساعد القرآن الصوتي</h1>
        <div className="flex gap-2">
          <IconBtn label={speakOn ? "إيقاف الرد الصوتي" : "تشغيل الرد الصوتي"} onClick={() => setSpeakOn(!speakOn)}>{speakOn ? "🔊" : "🔇"}</IconBtn>
          <IconBtn label="تبديل الوضع الداكن" onClick={() => setDark(!dark)}>{dark ? "☀️" : "🌙"}</IconBtn>
        </div>
      </header>

      <div aria-live="polite" className="sr-only">{status}</div>
      {toast && <div role="status" className="fixed top-4 inset-x-4 mx-auto max-w-md z-50 rounded-2xl bg-deep text-white px-4 py-3 shadow-2xl text-center">{toast}</div>}

      <main className="max-w-6xl mx-auto px-4 grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Card className="text-center">
            {!rec.supported && <p className="mb-4 rounded-xl bg-gold/20 p-3">متصفحك لا يدعم التعرف على الصوت، استخدم الاختيار اليدوي (يفضّل Chrome).</p>}
            <div className="relative mx-auto my-4 w-28 h-28">
              {rec.state === "listening" && <span className="absolute inset-0 rounded-full bg-teal2/40 animate-ring" />}
              <button aria-label="ابدأ التحدث" disabled={!rec.supported || !data} onClick={() => rec.start(handleText)}
                className={`relative w-28 h-28 rounded-full text-4xl text-white bg-gradient-to-br from-teal2 to-deep shadow-xl disabled:opacity-40 ${rec.state === "idle" ? "animate-glow" : ""} ${rec.state === "error" ? "animate-shake" : ""}`}>
                {rec.state === "processing" ? <span className="inline-block w-8 h-8 border-4 border-white/40 border-t-white rounded-full animate-spin" /> : "🎙️"}
              </button>
            </div>
            <p className="min-h-6">{status}</p>
            {rec.transcript && <p className="mt-2 rounded-xl bg-white/50 dark:bg-black/20 p-2">سمعتك: {rec.transcript}</p>}
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((t) => <button key={t} disabled={!data} onClick={() => handleText(t)} className="min-h-11 px-3 rounded-full border border-gold/60 text-sm hover:bg-gold/20 disabled:opacity-40">{t}</button>)}
            </div>
          </Card>

          <Card>
            {cur ? (<>
              <p className="font-quran text-5xl text-center text-teal2 dark:text-gold">{cur.surah.name}</p>
              <p className="text-center mt-2">{cur.reciter.name} <button aria-label="أضف الشيخ للمفضلة" onClick={() => toggleFav(cur.reciter.id)}>{favs.includes(cur.reciter.id) ? "★" : "☆"}</button></p>
              <p className="text-center text-sm opacity-70">{findMoshaf(cur.reciter, cur.surah.id)?.name}</p>
              <div className="flex items-end justify-center gap-1 h-8 my-3" aria-hidden>
                {[0, 0.2, 0.4, 0.1, 0.3].map((d, i) => <span key={i} className="w-1.5 h-full rounded bg-gold animate-eq" style={{ animationDelay: `${d}s`, animationPlayState: player.playing ? "running" : "paused" }} />)}
              </div>
              <input type="range" aria-label="شريط التقدم" min="0" max={player.duration || 0} value={player.time} onChange={(e) => player.seek(+e.target.value)} className="w-full accent-teal2" />
              <div className="flex justify-between text-xs" dir="ltr"><span>{fmt(player.time)}</span><span>{fmt(player.duration)}</span></div>
              <div className="flex items-center justify-center gap-3 my-3">
                <IconBtn label="السورة السابقة" onClick={() => step(-1)}>⏮</IconBtn>
                <IconBtn label={player.playing ? "إيقاف مؤقت" : "تشغيل"} onClick={player.toggle} className="!min-h-14 !min-w-14 !bg-teal2 text-white text-2xl">{player.playing ? "⏸" : "▶"}</IconBtn>
                <IconBtn label="السورة التالية" onClick={() => step(1)}>⏭</IconBtn>
              </div>
              <div className="flex items-center gap-3 justify-center">
                <input type="range" aria-label="مستوى الصوت" min="0" max="1" step="0.05" value={player.volume} onChange={(e) => player.setVolume(+e.target.value)} className="w-32 accent-gold" />
                <select aria-label="سرعة التشغيل" value={player.rate} onChange={(e) => player.setRate(+e.target.value)} className="min-h-11 rounded-lg px-2 bg-white/70 dark:bg-black/40">
                  {[0.75, 1, 1.25, 1.5].map((r) => <option key={r} value={r}>{r}x</option>)}
                </select>
              </div>
            </>) : <p className="text-center opacity-70">لم يتم تشغيل أي سورة بعد</p>}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <h2 className="font-bold mb-3">اختيار يدوي</h2>
            {loadError ? (
              <div className="text-center"><p className="mb-3">{loadError}</p><button onClick={fetchData} className="min-h-11 px-5 rounded-full bg-teal2 text-white">إعادة المحاولة</button></div>
            ) : !data ? (
              <div className="space-y-2 animate-pulse">{[...Array(6)].map((_, i) => <div key={i} className="h-11 rounded-lg bg-teal2/20" />)}</div>
            ) : (<>
              <div className="grid sm:grid-cols-2 gap-3">
                <PickList title="الشيخ" items={data.reciters} favs={favs} selected={pick.reciter} onSelect={(reciter) => setPick((p) => ({ ...p, reciter }))} />
                <PickList title="السورة" items={data.surahs} selected={pick.surah} onSelect={(surah) => setPick((p) => ({ ...p, surah }))} />
              </div>
              <button disabled={!pick.surah || !pick.reciter} onClick={() => play(pick.surah, pick.reciter, false)} className="mt-3 w-full min-h-12 rounded-full bg-gradient-to-l from-gold to-amber-500 text-deep font-bold disabled:opacity-40">شغل</button>
            </>)}
          </Card>

          {data && (history.length > 0 || favReciters.length > 0) && (
            <Card>
              {favReciters.length > 0 && (<>
                <h2 className="font-bold mb-2">الشيوخ المفضلون</h2>
                <div className="flex flex-wrap gap-2 mb-4">{favReciters.map((r) => <button key={r.id} onClick={() => { setPick((p) => ({ ...p, reciter: r })); showToast(`تم اختيار ${r.name}`); }} className="min-h-11 px-3 rounded-full border border-gold/60">★ {r.name}</button>)}</div>
              </>)}
              {history.length > 0 && (<>
                <h2 className="font-bold mb-2">آخر ما شغلته</h2>
                <ul className="space-y-1">{history.map((h) => {
                  const s = data.surahs.find((x) => x.id === h.s), r = data.reciters.find((x) => x.id === h.r);
                  return s && r && <li key={`${h.s}-${h.r}`}><button onClick={() => play(s, r, false)} className="w-full min-h-11 px-3 text-start rounded-lg hover:bg-teal2/15">↻ {s.name} — {r.name}</button></li>;
                })}</ul>
              </>)}
            </Card>
          )}
        </div>
      </main>

      {cur && (
        <div className="fixed bottom-0 inset-x-0 lg:hidden p-3 bg-deep text-white flex items-center gap-3 shadow-2xl">
          <div className="flex-1 min-w-0"><p className="font-quran text-xl truncate">{cur.surah.name}</p><p className="text-xs truncate opacity-80">{cur.reciter.name}</p></div>
          <IconBtn label={player.playing ? "إيقاف مؤقت" : "تشغيل"} onClick={player.toggle} className="!bg-gold !text-deep">{player.playing ? "⏸" : "▶"}</IconBtn>
        </div>
      )}
    </div>
  );
}
