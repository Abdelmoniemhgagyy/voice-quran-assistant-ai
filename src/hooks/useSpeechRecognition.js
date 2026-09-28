import { useCallback, useEffect, useRef, useState } from "react";

const ERRORS = {
  "not-allowed": "اسمح باستخدام الميكروفون من إعدادات المتصفح",
  "no-speech": "ما سمعتش حاجة، جرب تاني",
  "network": "مشكلة في الاتصال بخدمة التعرف على الصوت",
};

export default function useSpeechRecognition() {
  const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const ref = useRef(null);
  const [state, setState] = useState("idle"); // idle | listening | processing | error
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");

  const start = useCallback((onFinal) => {
    if (!SR) return;
    ref.current?.abort();
    const r = new SR();
    let final = "";
    r.lang = "ar-EG"; r.interimResults = true;
    r.onstart = () => { setState("listening"); setTranscript(""); setError(""); };
    r.onresult = (e) => { final = Array.from(e.results).map((x) => x[0].transcript).join(" "); setTranscript(final); };
    r.onerror = (e) => { setState("error"); setError(ERRORS[e.error] || "حدث خطأ في التعرف على الصوت"); };
    r.onend = () => {
      if (!final) return setState((s) => (s === "error" ? s : "idle"));
      setState("processing");
      Promise.resolve(onFinal(final)).finally(() => setState("idle"));
    };
    ref.current = r;
    try { r.start(); } catch { /* already started */ }
  }, [SR]);

  useEffect(() => () => ref.current?.abort(), []);
  return { supported: !!SR, state, transcript, error, start, stop: () => ref.current?.stop() };
}
