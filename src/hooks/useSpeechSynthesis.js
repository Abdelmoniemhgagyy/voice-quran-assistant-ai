import { useCallback } from "react";
// Speaks Arabic feedback; always calls onEnd so flows never stall.
export default function useSpeechSynthesis(enabled) {
  return useCallback((text, onEnd) => {
    const synth = typeof window !== "undefined" && window.speechSynthesis;
    if (!enabled || !synth) return onEnd?.();
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ar-SA"; u.onend = u.onerror = () => onEnd?.();
    synth.speak(u);
  }, [enabled]);
}
