import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { audioUrl, findMoshaf, loadData } from "./api/mp3quran";
import { normalize } from "./utils/arabic";
import { parseCommand } from "./utils/parseCommand";
import useAudioPlayer from "./hooks/useAudioPlayer";
import useLocalStorage from "./hooks/useLocalStorage";
import useSpeechRecognition from "./hooks/useSpeechRecognition";
import useSpeechSynthesis from "./hooks/useSpeechSynthesis";
const Avatar = lazy(() => import("./components/Avatar"));

const EXAMPLES = ["شغل سورة الكهف بصوت المنشاوي", "شغل سورة يس بصوت العفاسي", "سورة الرحمن بصوت الحصري", "التالي"];
const fmt = (t) => (isFinite(t) ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}` : "0:00");
const Card = ({ children, className = "" }) => (
  <section className={`surface p-5 sm:p-6 ${className}`}>{children}</section>
);
const IconBtn = ({ label, onClick, children, className = "" }) => (
  <button type="button" aria-label={label} title={label} onClick={onClick} className={`min-h-11 min-w-11 grid place-items-center rounded-full bg-deep/10 dark:bg-white/10 hover:bg-deep/20 transition ${className}`}>{children}</button>
);

// Player icons as SVG so they look the same on every device (no emoji rendering).
const PLAYER_PATHS = {
  play: "M8 5v14l11-7z",
  pause: "M6 5h4v14H6zM14 5h4v14h-4z",
  prev: "M6 6h2v12H6zm3.5 6L18 18V6z",
  next: "M16 6h2v12h-2zM6 18l8.5-6L6 6z",
};
const PlayerIcon = ({ name, size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={PLAYER_PATHS[name]} /></svg>
);

function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

// Keep every surah reachable without requiring a search.
const PickList = memo(function PickList({ title, items, selected, onSelect, favs }) {
  const [q, setQ] = useState("");
  const dq = normalize(useDebounced(q));
  const shown = useMemo(() => items.filter((i) => normalize(i.name).includes(dq)), [items, dq]);
  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`ابحث: ${title}`} aria-label={`ابحث: ${title}`}
        className="w-full min-h-11 rounded-xl px-3 mb-2 bg-white/70 dark:bg-black/30 border border-teal2/30" />
      <ul className="max-h-64 overflow-y-auto rounded-xl space-y-1">
        {!shown.length && <li className="p-3 opacity-60">لا توجد نتائج</li>}
        {shown.map((i) => (
          <li key={i.id}>
            <button aria-pressed={selected?.id === i.id} onClick={() => onSelect(i)} className={`w-full min-h-11 px-3 text-start rounded-lg transition ${selected?.id === i.id ? "bg-teal2 text-white" : "hover:bg-teal2/15"}`}>
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
  const [libraryOpen, setLibraryOpen] = useState(false);
  const library = useRef(null);
  const libraryTrigger = useRef(null);
  const followUp = useRef(null);
  const [question, setQuestion] = useState("");
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
    setQuestion("");
    setLibraryOpen(false);
    setCur({ surah, reciter });
    player.load(audioUrl(m, surah.id), surah.name, reciter.name);
    setHistory((h) => [{ s: surah.id, r: reciter.id }, ...h.filter((x) => !(x.s === surah.id && x.r === reciter.id))].slice(0, 10));
    if (announce) speak(`تمام، بشغل ${surah.name} بصوت ${reciter.name}`);
  }, [player.load, showToast, speak, setHistory]);
  const playRef = useRef(play); playRef.current = play;

  // Ask a question by voice, then listen for the answer.
  const ask = useCallback((question) => {
    setQuestion(question);
    speak(question, () => { followUp.current = setTimeout(() => rec.start(handleText), 300); });
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

  useEffect(() => () => clearTimeout(followUp.current), []);

  useEffect(() => {
    if (libraryOpen) library.current?.showModal();
    else library.current?.close();
  }, [libraryOpen]);

  function toggleMicrophone() {
    if (rec.state === "listening") return rec.stop();
    clearTimeout(followUp.current);
    window.speechSynthesis?.cancel();
    player.pause();
    setQuestion("");
    rec.start(handleText);
  }

  // Keyboard shortcuts: Space = play/pause, arrows = seek.
  useEffect(() => {
    const onKey = (e) => {
      if (libraryOpen || e.target.isContentEditable || /INPUT|BUTTON|SELECT|TEXTAREA/.test(e.target.tagName)) return;
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
    <div className="app-shell" dir="rtl">
      <header className="app-header">
        <a className="brand" href="#"><span className="brand-mark">۞</span><span><strong>قانتون</strong><small>مساعدك للاستماع إلى القرآن</small></span></a>
        <div className="header-actions">
          <button ref={libraryTrigger} className="library-button" onClick={() => setLibraryOpen(true)} aria-haspopup="dialog"><span aria-hidden="true">☷</span> <span>مكتبة القرآن</span></button>
          <IconBtn label={speakOn ? "إيقاف الرد الصوتي" : "تشغيل الرد الصوتي"} onClick={() => setSpeakOn(!speakOn)}><SoundIcon muted={!speakOn} /></IconBtn>
          <IconBtn label="تبديل الوضع الداكن" onClick={() => setDark(!dark)}>{dark ? "☼" : "☾"}</IconBtn>
        </div>
      </header>

      {toast && !libraryOpen && <div role="status" className="toast-message">{toast}</div>}
      <main className="main-stage">
        <div className="intro">
          <span className="eyebrow"><span /> مساحة للطمأنينة</span>
          <h1>قُرآن يُتلى، <em>وقلب يطمئن.</em></h1>
          <p>أنا مساعدك الصوتي. قل لي ما تحب أن تسمع.</p>
        </div>
        <div className={`avatar-stage ${rec.state === "listening" ? "is-listening" : ""}`}>
          <div className="arch arch-outer" aria-hidden="true" /><div className="arch arch-inner" aria-hidden="true" />
          <span className="stage-star star-one" aria-hidden="true">✧</span><span className="stage-star star-two" aria-hidden="true">✧</span>
          <Suspense fallback={<div className="avatar-loading" role="status">نجهّز مساعدك…</div>}><Avatar listening={rec.state === "listening"} playing={player.playing} processing={rec.state === "processing"} /></Suspense>
          <div className="avatar-caption"><span className={`activity-dot ${rec.state === "listening" ? "active" : ""}`} />{rec.state === "listening" ? "معك… أسمعك" : player.playing ? "وقت التلاوة" : "أهلًا بك، أنا قانتون"}</div>
        </div>
        <div className="conversation" aria-live="polite" aria-atomic="true">
          <p className={rec.state === "error" ? "error-message" : ""}>{!rec.supported ? "التعرف على الصوت غير متاح في متصفحك. اختر من مكتبة القرآن." : loadError ? "تعذر تحميل المكتبة" : !data ? "لحظات، نجهّز لك مكتبة القرآن…" : rec.state === "error" ? status : question || status}</p>
          {loadError && <button className="retry-button" onClick={fetchData}>إعادة المحاولة</button>}
          {rec.transcript && <p className="transcript">«{rec.transcript}»</p>}
        </div>
        <Card className="player-card">
          {cur ? (<>
            <p className="font-quran text-5xl text-center text-teal2 dark:text-gold">{cur.surah.name}</p>
            <p className="text-center mt-2">{cur.reciter.name} <button className="min-h-11 min-w-11" aria-label={favs.includes(cur.reciter.id) ? "إزالة الشيخ من المفضلة" : "أضف الشيخ للمفضلة"} aria-pressed={favs.includes(cur.reciter.id)} onClick={() => toggleFav(cur.reciter.id)}>{favs.includes(cur.reciter.id) ? "★" : "☆"}</button></p>
            <p className="text-center text-sm opacity-70">{findMoshaf(cur.reciter, cur.surah.id)?.name}</p>
            <div className="flex items-end justify-center gap-1 h-8 my-3" aria-hidden>
              {[0, 0.2, 0.4, 0.1, 0.3].map((d, i) => <span key={i} className="w-1.5 h-full rounded bg-gold animate-eq" style={{ animationDelay: `${d}s`, animationPlayState: player.playing ? "running" : "paused" }} />)}
            </div>
            <input type="range" aria-label="شريط التقدم" min="0" max={player.duration || 0} value={player.time} onChange={(e) => player.seek(+e.target.value)} className="w-full accent-teal2" />
            <div className="flex justify-between text-xs" dir="ltr"><span>{fmt(player.time)}</span><span>{fmt(player.duration)}</span></div>
            <div className="flex items-center justify-center gap-4 my-4" dir="ltr">
              <IconBtn
                label="السورة السابقة"
                onClick={() => step(-1)}
                className="!h-12 !w-12 text-teal2 dark:text-gold active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal2/40"
              >
                <PlayerIcon name="prev" />
              </IconBtn>
              <IconBtn
                label={player.playing ? "إيقاف مؤقت" : "تشغيل"}
                onClick={player.toggle}
                className="!h-16 !w-16 !bg-teal2 hover:!bg-teal2/90 text-white shadow-lg active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal2/40"
              >
                <PlayerIcon name={player.playing ? "pause" : "play"} size={30} />
              </IconBtn>
              <IconBtn
                label="السورة التالية"
                onClick={() => step(1)}
                className="!h-12 !w-12 text-teal2 dark:text-gold active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal2/40"
              >
                <PlayerIcon name="next" />
              </IconBtn>
            </div>
            <div className="flex items-center gap-3 justify-center">
              <input type="range" aria-label="مستوى الصوت" min="0" max="1" step="0.05" value={player.volume} onChange={(e) => player.setVolume(+e.target.value)} className="w-32 accent-gold" />
              <select aria-label="سرعة التشغيل" value={player.rate} onChange={(e) => player.setRate(+e.target.value)} className="min-h-10 rounded-lg p-2 bg-white/70 dark:bg-black/40">
                {[0.75, 1, 1.25, 1.5].map((r) => <option key={r} value={r}>{r}x</option>)}
              </select>
            </div>
          </>) : <div className="empty-player"><span className="empty-player-icon">♫</span><div><strong>رحلتك مع القرآن تبدأ بكلمة</strong><p>اطلب سورة بصوت قارئك المفضل، أو اختر من المكتبة</p></div></div>}
        </Card>
        <p className="stage-footer">تلاوات تُرافق يومك <span>✦</span> من مكتبة MP3Quran</p>
      </main>
      <dialog ref={library} className="library-dialog" onCancel={() => setLibraryOpen(false)} onClose={() => { setLibraryOpen(false); libraryTrigger.current?.focus(); }} onClick={(event) => { if (event.target === event.currentTarget) setLibraryOpen(false); }} aria-labelledby="library-title">
        <div className="library-content space-y-5">
          <div className="library-heading"><div><span className="eyebrow">على ذوقك</span><h2 id="library-title">مكتبة القرآن</h2></div><IconBtn label="إغلاق المكتبة" onClick={() => setLibraryOpen(false)}>✕</IconBtn></div>
          {toast && <p role="status" className="rounded-xl bg-teal2/10 p-3">{toast}</p>}
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
      </dialog>
      <div className="mic-dock">
        <button className={`mic-button ${rec.state === "listening" ? "listening" : ""}`} aria-label={rec.state === "listening" ? "إنهاء الاستماع" : "ابدأ التحدث"} aria-pressed={rec.state === "listening"} disabled={!rec.supported || !data || rec.state === "processing"} onClick={toggleMicrophone}>
          {rec.state === "processing" ? <span className="mic-spinner" /> : rec.state === "listening" ? <span className="listening-bars" aria-hidden="true">{[0, 1, 2, 3, 4].map(i => <i key={i} style={{ animationDelay: `${i * 0.12}s` }} />)}</span> : <MicIcon />}
        </button>
        <div className="mic-hint">{rec.state === "listening" ? "اضغط لإنهاء الطلب" : "اضغط وتكلم"}<small>{rec.state === "listening" ? "بسمعك الآن…" : "السورة والقارئ بصوتك"}</small></div>
      </div>
    </div>
  );
}

function MicIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" /></svg>;
}
function SoundIcon({ muted }) {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4 5 9H2v6h3l6 5z" />{muted ? <path d="m16 9 6 6m0-6-6 6" /> : <><path d="M15 8a6 6 0 0 1 0 8M18 4a11 11 0 0 1 0 16" /></>}</svg>;
}