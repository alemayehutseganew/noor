let isVoiceEnabled = false;
let isAudioUnlocked = false;
let isMuted = true;
const audioCache = {};

const retryWithM4a = (audio, fileName) => {
  audio.src = `/audio/${fileName.replace(/\.mp3$/, '.m4a')}`;
  audio.load();
  return audio.play();
};

export const preloadAudio = () => {
  if (typeof Audio === 'undefined') return;

  const ranges = {
    B: [1, 15],
    I: [16, 30],
    N: [31, 45],
    G: [46, 60],
    O: [61, 75],
  };

  Object.entries(ranges).forEach(([letter, [start, end]]) => {
    for (let number = start; number <= end; number += 1) {
      const fileName = `${letter}${number}.m4a`;
      if (!audioCache[fileName]) {
        const audio = new Audio(`/audio/${fileName}`);
        audio.preload = 'auto';
        audioCache[fileName] = audio;
      }
    }
  });
  console.log('[Audio] All 75 audio files preloaded into cache.');
};

preloadAudio();

export const unlockAudio = () => {
  if (isAudioUnlocked) return;

  const silentAudio = new Audio('/audio/B1.mp3');
  silentAudio.volume = 0;
  silentAudio.play().then(() => {
    silentAudio.pause();
    isAudioUnlocked = true;
    console.log('[Audio] HTML5 Audio unlocked.');
  }).catch((error) => {
    if (!silentAudio.error) {
      console.log('[Audio] Unlock failed:', error);
      return;
    }

    retryWithM4a(silentAudio, 'B1.mp3').then(() => {
      silentAudio.pause();
      isAudioUnlocked = true;
      console.log('[Audio] HTML5 Audio unlocked.');
    }).catch((fallbackError) => {
      console.log('[Audio] Unlock failed:', fallbackError);
    });
  });
};

export const toggleVoice = (enabled) => {
  isVoiceEnabled = enabled;
  isMuted = !enabled;
  if (!enabled) {
    Object.values(audioCache).forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
  }
};

export const playNumberAudio = (letter, number) => {
  if (
    !isVoiceEnabled
    || !/^[BINGO]$/.test(letter)
    || !Number.isInteger(Number(number))
    || Number(number) < 1
    || Number(number) > 75
  ) return;

  const fileName = `${letter}${number}.m4a`;
  Object.values(audioCache).forEach((playingAudio) => {
    if (!playingAudio.paused) {
      playingAudio.pause();
      playingAudio.currentTime = 0;
    }
  });

  if (!audioCache[fileName]) {
    audioCache[fileName] = new Audio(`/audio/${fileName}`);
  }

  const audio = audioCache[fileName];
  audio.currentTime = 0;
  audio.play().catch((error) => {
    console.warn(`[Audio] Failed to play ${fileName}. Ensure the file exists in public/audio/.`, error);
  });
};

export const toggleMute = () => {
  const nextMuted = !isMuted;
  toggleVoice(!nextMuted);
  return nextMuted;
};

export const getMuteState = () => isMuted;

export const playBallCall = (ballString) => {
  const [letter, numberString] = ballString.split('-');
  const number = Number.parseInt(numberString, 10);
  if (!/^[BINGO]$/.test(letter) || !Number.isInteger(number) || number < 1 || number > 75) return;

  playNumberAudio(letter, number);
};
