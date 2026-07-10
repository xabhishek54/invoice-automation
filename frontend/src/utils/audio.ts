let audioCtx: AudioContext | null = null;

const getAudioContext = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
};

/**
 * Plays a soft, descending alert chime representing an error/warning event.
 */
export const playErrorSound = () => {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    
    const now = ctx.currentTime;
    
    // Play a gentle descending error sound (180Hz sawtooth and 120Hz sine decay)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(180, now);
    osc1.frequency.linearRampToValueAtTime(90, now + 0.35);
    
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(120, now);
    osc2.frequency.linearRampToValueAtTime(60, now + 0.35);
    
    gainNode.gain.setValueAtTime(0.08, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    
    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.35);
    osc2.stop(now + 0.35);
  } catch (e) {
    console.error('Failed to play error sound:', e);
  }
};

/**
 * Plays an upbeat ascending chime representing successful completion of a batch action.
 */
export const playSuccessSound = () => {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    
    const now = ctx.currentTime;
    // Play an ascending chime chord (Db5 -> Ab5 -> Db6)
    const notes = [554.37, 830.61, 1108.73];
    
    notes.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + index * 0.08);
      
      gainNode.gain.setValueAtTime(0.06, now + index * 0.08);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + index * 0.08 + 0.25);
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc.start(now + index * 0.08);
      osc.stop(now + index * 0.08 + 0.25);
    });
  } catch (e) {
    console.error('Failed to play success sound:', e);
  }
};
