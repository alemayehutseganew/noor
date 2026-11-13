let isVoiceEnabled = true;
let isAudioUnlocked = false;
let isMuted = false;
const audioCache = {};

export const unlockAudio = () => {
  if (isAudioUnlocked || typeof Audio === 'undefined') return;

  try {
    const unlockAudioObj = new Audio('/audio/B1.m4a');
    unlockAudioObj.volume = 0;
    unlockAudioObj.play()
      .then(() => {
        unlockAudioObj.pause();
        isAudioUnlocked = true;
        console.log('[Audio] Mobile audio context unlocked.');
      })
      .catch((err) => console.warn('[Audio] Unlock failed:', err));
  } catch (error) {
    console.error('[Audio] Error during unlock:', error);
  }
};

export const toggleVoice = (enabled) => {
  isVoiceEnabled = enabled;
  isMuted = !enabled;
  if (!enabled) {
    Object.values(audioCache).forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }
};

export const preloadAudio = async () => {
  const ranges = {
    B: [1, 15],
    I: [16, 30],
    N: [31, 45],
    G: [46, 60],
    O: [61, 75],
  };
  const files = Object.entries(ranges).flatMap(([letter, [start, end]]) => (
    Array.from({ length: end - start + 1 }, (_, index) => `${letter}${start + index}.m4a`)
  ));
  const missingFiles = [];
  const batchSize = 8;

  for (let index = 0; index < files.length; index += batchSize) {
    const batch = files.slice(index, index + batchSize);
    await Promise.all(batch.map(async (fileName) => {
      try {
        const response = await fetch(`/audio/${fileName}`);
        if (!response.ok) {
          missingFiles.push(fileName);
          return;
        }
        await response.arrayBuffer();
      } catch {
        missingFiles.push(fileName);
      }
    }));
  }

  if (missingFiles.length > 0) {
    console.error('[Audio] ❌ MISSING OR UNREACHABLE FILES:', missingFiles.join(', '));
  } else {
    console.log('[Audio] ✅ All 75 audio files verified and fetched.');
  }
};

if (typeof window !== 'undefined' && typeof Audio !== 'undefined' && typeof fetch === 'function') {
  preloadAudio().catch((err) => {
    console.error('[Audio] Failed to verify audio files:', err);
  });
}

const fallbackToSpeech = (letter, number) => {
  if (
    typeof window === 'undefined'
    || !window.speechSynthesis
    || typeof SpeechSynthesisUtterance === 'undefined'
  ) return;

  const utterance = new SpeechSynthesisUtterance(`${letter} ${number}`);
  const amharicVoice = window.speechSynthesis.getVoices()
    .find((voice) => voice.lang.startsWith('am'));
  utterance.lang = amharicVoice ? 'am-ET' : 'en-US';
  if (amharicVoice) utterance.voice = amharicVoice;
  window.speechSynthesis.speak(utterance);
};

export const playNumberAudio = (letter, number) => {
  const parsedNumber = Number(number);
  if (
    !isVoiceEnabled
    || !isAudioUnlocked
    || !/^[BINGO]$/.test(letter)
    || !Number.isInteger(parsedNumber)
    || parsedNumber < 1
    || parsedNumber > 75
    || typeof Audio === 'undefined'
  ) return;

  Object.values(audioCache).forEach((audio) => {
    if (!audio.paused) {
      audio.pause();
      audio.currentTime = 0;
    }
  });
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }

  const fileName = `${letter}${parsedNumber}.m4a`;
  if (!audioCache[fileName]) {
    audioCache[fileName] = new Audio(`/audio/${fileName}`);
  }

  const audio = audioCache[fileName];
  audio.currentTime = 0;
  try {
    audio.play().catch((err) => {
      console.warn(`[Audio] Failed to play ${fileName}. Falling back to Web Speech API.`, err);
      fallbackToSpeech(letter, parsedNumber);
    });
  } catch (err) {
    console.warn(`[Audio] Failed to play ${fileName}. Falling back to Web Speech API.`, err);
    fallbackToSpeech(letter, parsedNumber);
  }
};

export const toggleMute = () => {
  const nextMuted = !isMuted;
  toggleVoice(!nextMuted);
  return nextMuted;
};

export const getMuteState = () => isMuted;

export const playBallCall = (ballString) => {
  if (typeof ballString !== 'string') return;
  const [letter, numberString] = ballString.split('-');
  const number = Number.parseInt(numberString, 10);
  playNumberAudio(letter, number);
};
