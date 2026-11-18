let isVoiceEnabled = true;
let isAudioUnlocked = false;
let isMuted = false;
const audioCache = {};
const MAX_CACHE_SIZE = 10;

export const unlockAudio = () => {
  if (isAudioUnlocked || typeof Audio === 'undefined') return;

  try {
    const unlockAudioObj = new Audio('/audio/B1.m4a');
    unlockAudioObj.volume = 0;
    unlockAudioObj.play()
      .then(() => {
        unlockAudioObj.pause();
        isAudioUnlocked = true;
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
    if (Object.keys(audioCache).length >= MAX_CACHE_SIZE) {
      const oldestKey = Object.keys(audioCache)[0];
      audioCache[oldestKey].pause();
      delete audioCache[oldestKey];
    }
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
