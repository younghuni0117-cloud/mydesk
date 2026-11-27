let context;
export function enableAudio() {
  const Audio = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Audio) return;
  try {
    context ??= new Audio();
    if (context.state === 'suspended') void context.resume().catch(() => {});
  } catch { /* Browsers may disable Web Audio. */ }
}

export function playJump() {
  if (context?.state !== 'running') return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const time = context.currentTime;
  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(390, time);
  oscillator.frequency.exponentialRampToValueAtTime(760, time + .065);
  gain.gain.setValueAtTime(.001, time);
  gain.gain.exponentialRampToValueAtTime(.16, time + .012);
  gain.gain.exponentialRampToValueAtTime(.001, time + .11);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(time);
  oscillator.stop(time + .12);
}
