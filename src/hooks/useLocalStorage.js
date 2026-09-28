import { useEffect, useState } from "react";
// localStorage wrapped in try/catch: safe when storage is empty or blocked.
export default function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try { const raw = localStorage.getItem(key); return raw === null ? initial : JSON.parse(raw); }
    catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* blocked */ } }, [key, value]);
  return [value, setValue];
}
