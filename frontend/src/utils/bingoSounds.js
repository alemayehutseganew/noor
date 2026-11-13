let isVoiceEnabled = false;
let isAudioUnlocked = false;
let isMuted = true;
const audioCache = {};

const retryWithM4a = (audio, fileName) => {
  audio.src = `/audio/${fileName.replace(/\.mp3$/, '.m4a')}`;
  audio.load();
  return audio.play();
};

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

  const fileName = `${letter}${number}.mp3`;
  if (!audioCache[fileName]) {
    audioCache[fileName] = new Audio(`/audio/${fileName}`);
  }

  const audio = audioCache[fileName];
  audio.currentTime = 0;
  audio.play().catch((error) => {
    if (!audio.error) {
      console.warn(`[Audio] Failed to play ${fileName}. Ensure the file exists in public/audio/.`, error);
      return;
    }

    retryWithM4a(audio, fileName).catch((fallbackError) => {
      console.warn(`[Audio] Failed to play ${fileName}. Ensure the file exists in public/audio/.`, fallbackError);
    });
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
