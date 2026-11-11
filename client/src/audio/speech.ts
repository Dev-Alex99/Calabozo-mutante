class SpeechDirector {
  private enabled = true;
  private lastSpoken = '';

  public toggle(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  public speak(text: string) {
    if (!this.enabled || !text || text === this.lastSpoken) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    this.lastSpoken = text;

    try {
      window.speechSynthesis.cancel(); // Stop any pending speech

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-ES';
      utterance.pitch = 0.85; // Slightly lower/sinister
      utterance.rate = 1.1;   // Rapid, snappy delivery

      // Select Spanish voice if available
      const voices = window.speechSynthesis.getVoices();
      const esVoice = voices.find(v => v.lang.startsWith('es'));
      if (esVoice) {
        utterance.voice = esVoice;
      }

      window.speechSynthesis.speak(utterance);
    } catch {
      // Ignored if browser speech blocked
    }
  }
}

export const speechDirector = new SpeechDirector();
