const SOUND_URL = '/sounds/ryyco-notificacion-3-segundos.mp3';
let context: AudioContext | null = null;
let bufferPromise: Promise<AudioBuffer> | null = null;
let playing = false;

function getContext() {
  if (!context) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) context = new AudioContextClass();
  }
  return context;
}

function loadSound(ctx: AudioContext) {
  if (!bufferPromise) {
    bufferPromise = fetch(SOUND_URL)
      .then(response => {
        if (!response.ok) throw new Error(`Order sound: HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then(bytes => ctx.decodeAudioData(bytes))
      .catch(error => { bufferPromise = null; throw error; });
  }
  return bufferPromise;
}

// Unlock audio on a real user gesture, without playing a test notification.
if (typeof window !== 'undefined') {
  const unlock = () => {
    const ctx = getContext();
    if (!ctx) return;
    void ctx.resume().then(() => loadSound(ctx)).catch(() => {});
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
}

export async function playOrderNotificationSound() {
  if (typeof window === 'undefined' || playing) return;
  const ctx = getContext();
  if (!ctx) return;
  // Incoming orders can arrive through Firestore, FCM and SSE at once.
  playing = true;
  let started = false;
  try {
    if (ctx.state !== 'running') {
      await ctx.resume();
    }
    const buffer = await loadSound(ctx);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => { source.disconnect(); playing = false; };
    source.start();
    started = true;
    return;
  } catch (error) {
    console.warn('No se pudo reproducir el sonido del pedido:', error);
  } finally {
    if (!started) playing = false;
  }
  playing = false;
}
