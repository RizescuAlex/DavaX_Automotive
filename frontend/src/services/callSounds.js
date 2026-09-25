let audioContext;
let ringtoneInterval;
let activeRingtone;

function getAudioContext() {
  if (typeof window === "undefined") return null;

  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;

  audioContext ||= new AudioContext();
  return audioContext;
}

function playTone(frequency, startTime, duration, volume = 0.08) {
  const context = getAudioContext();
  if (!context) return;

  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = frequency;

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  oscillator.connect(gain);
  gain.connect(context.destination);

  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.02);
}

function playCallSound(pattern) {
  const context = getAudioContext();
  if (!context) return;

  const startTime = context.currentTime;

  pattern.forEach(({ frequency, offset, duration }) => {
    playTone(frequency, startTime + offset, duration);
  });
}

const ringtonePattern = [
  { frequency: 660, offset: 0, duration: 0.16 },
  { frequency: 880, offset: 0.2, duration: 0.24 },
];

const actionPatterns = {
  accept: [
    { frequency: 660, offset: 0, duration: 0.1 },
    { frequency: 990, offset: 0.1, duration: 0.18 },
  ],
  decline: [
    { frequency: 330, offset: 0, duration: 0.12 },
    { frequency: 220, offset: 0.12, duration: 0.2 },
  ],
  end: [
    { frequency: 440, offset: 0, duration: 0.1 },
    { frequency: 280, offset: 0.12, duration: 0.18 },
  ],
};

export function startCallRingtone(type) {
  if (activeRingtone === type && ringtoneInterval) return;

  stopCallRingtone();
  activeRingtone = type;

  playCallSound(ringtonePattern);
  ringtoneInterval = window.setInterval(
    () => playCallSound(ringtonePattern),
    1400,
  );
}

export function stopCallRingtone() {
  if (ringtoneInterval) {
    window.clearInterval(ringtoneInterval);
    ringtoneInterval = null;
  }

  activeRingtone = null;
}

export function playCallActionSound(action) {
  const pattern = actionPatterns[action];

  if (pattern) {
    playCallSound(pattern);
  }
}