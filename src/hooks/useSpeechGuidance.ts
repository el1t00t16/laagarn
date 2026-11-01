import { useCallback, useRef } from 'react';

/**
 * Text-to-speech engine for turn-by-turn spoken directions.
 * Runs completely on-device without network calls via browser SpeechSynthesis.
 */
export function useSpeechGuidance(enabled: boolean) {
  const lastSpokenRef = useRef<string>('');
  const lastSpokenTimeRef = useRef<number>(0);

  const speak = useCallback(
    (text: string, force = false) => {
      if (!enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;

      const clean = text.trim();
      if (!clean) return;

      const now = Date.now();
      // Avoid repeating the exact same utterance within 12 seconds unless forced
      if (!force && lastSpokenRef.current === clean && now - lastSpokenTimeRef.current < 12000) {
        return;
      }

      try {
        window.speechSynthesis.cancel(); // Stop any pending utterance to avoid delay
        const utterance = new SpeechSynthesisUtterance(clean);
        utterance.rate = 1.05; // slightly punchy pace for driving
        utterance.pitch = 1.0;
        utterance.lang = 'en-PH'; // Philippine English locale or fallback

        // Select an English voice if available
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice =
          voices.find((v) => v.lang.includes('en-PH')) ||
          voices.find((v) => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google'))) ||
          voices.find((v) => v.lang.startsWith('en'));

        if (preferredVoice) {
          utterance.voice = preferredVoice;
        }

        window.speechSynthesis.speak(utterance);
        lastSpokenRef.current = clean;
        lastSpokenTimeRef.current = now;
      } catch {
        // Speech synthesis fails gracefully if blocked by autoplay policies
      }
    },
    [enabled]
  );

  const stop = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  return { speak, stop };
}
