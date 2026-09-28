import { useCallback, useEffect, useRef, useState } from "react";

export default function useAudioPlayer({ onEnded, onError, onNext, onPrev }) {
  const audio = useRef(null);
  const cb = useRef({});
  cb.current = { onEnded, onError, onNext, onPrev };
  const [s, setS] = useState({ playing: false, time: 0, duration: 0, volume: 1, rate: 1 });
  const set = (p) => setS((x) => ({ ...x, ...p }));

  useEffect(() => {
    const el = (audio.current = new Audio());
    const on = { play: () => set({ playing: true }), pause: () => set({ playing: false }),
      timeupdate: () => set({ time: el.currentTime }), loadedmetadata: () => set({ duration: el.duration }),
      ended: () => cb.current.onEnded?.(), error: () => cb.current.onError?.("تعذر تحميل الصوت، جرب شيخًا أو سورة أخرى") };
    Object.entries(on).forEach(([e, f]) => el.addEventListener(e, f));
    if ("mediaSession" in navigator) {
      const h = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch { /* unsupported */ } };
      h("play", () => el.play()); h("pause", () => el.pause());
      h("nexttrack", () => cb.current.onNext?.()); h("previoustrack", () => cb.current.onPrev?.());
    }
    return () => { Object.entries(on).forEach(([e, f]) => el.removeEventListener(e, f)); el.pause(); el.src = ""; };
  }, []);

  const load = useCallback(async (url, title, artist) => {
    const el = audio.current;
    el.src = url; set({ time: 0 });
    if ("mediaSession" in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title, artist });
    try { await el.play(); }
    catch (e) { if (e.name === "NotAllowedError") cb.current.onError?.("المتصفح منع التشغيل التلقائي، اضغط زر التشغيل"); }
  }, []);

  return {
    ...s, load,
    toggle: () => (audio.current.paused ? audio.current.play().catch(() => {}) : audio.current.pause()),
    pause: () => audio.current.pause(),
    resume: () => audio.current.play().catch(() => {}),
    seek: (t) => { audio.current.currentTime = Math.max(0, Math.min(t, audio.current.duration || 0)); },
    setVolume: (v) => { audio.current.volume = v; set({ volume: v }); },
    setRate: (r) => { audio.current.playbackRate = audio.current.defaultPlaybackRate = r; set({ rate: r }); },
  };
}
