import { useEffect, useState, Fragment } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import CardSelection from './CardSelection';
import SocketService from '../services/socket';
import { getMuteState, playBallCall, toggleMute } from '../utils/bingoSounds';

const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

const getBallColor = (letter) => {
  switch(letter) {
    case 'B': return 'bg-blue-700 border-blue-900';
    case 'I': return 'bg-red-600 border-red-800';
    case 'N': return 'bg-purple-600 border-purple-800';
    case 'G': return 'bg-green-600 border-green-800';
    case 'O': return 'bg-yellow-500 border-yellow-700';
    default: return 'bg-gray-500 border-gray-700';
  }
};

const GameScreen = () => {
  const socket = SocketService.get() || SocketService.connect()
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const roomId = searchParams.get('roomId') || 'room_10';
  const stake = parseInt(searchParams.get('stake')) || 10;
  const spectatorFromUrl = searchParams.get('spectator') === 'true';
  const userId = localStorage.getItem('dbUserId');
  const { t, i18n } = useTranslation();

  const [calledNumbers, setCalledNumbers] = useState([]);
  const [currentBall, setCurrentBall] = useState(null);
  const [calledHistory, setCalledHistory] = useState([]);
  const [markedNumbers, setMarkedNumbers] = useState([]);
  const [cardsData, setCardsData] = useState([]);
  const [playerCount, setPlayerCount] = useState(0);
  const playersCount = playerCount;
  const [readyPlayers, setReadyPlayers] = useState(0);
  const [countdown, setCountdown] = useState(null);
  const [gameStarted, setGameStarted] = useState(false);
  const isSpectator = spectatorFromUrl;
  const [spectatorNumbers, setSpectatorNumbers] = useState([]);
  const [spectatorBall, setSpectatorBall] = useState(null);
  const [bingoMessage, setBingoMessage] = useState(null);
  const [gameResult, setGameResult] = useState(null);
  const [isMuted, setIsMuted] = useState(getMuteState());

  useEffect(() => {
    if (!userId) return;

    const handleJoin = () => {
      socket.emit('join_room', { roomId, userId, stake, spectator: isSpectator });
    };

    socket.on('room_update', (data) => {
      if (Number.isFinite(Number(data.players))) setPlayerCount(Number(data.players));
      if (Number.isFinite(Number(data.readyPlayers))) setReadyPlayers(Number(data.readyPlayers));
    });
    socket.on('players_updated', (data) => {
      if (Number.isFinite(Number(data.count))) setPlayerCount(Number(data.count));
    });
    socket.on('game_in_progress', (data) => {
      setCardsData([]);
      setMarkedNumbers([]);
      setGameStarted(false);
      setSpectatorNumbers(data.calledNumbers || []);
      setSpectatorBall(data.currentBall || null);
      if (Number.isFinite(Number(data.players))) setPlayerCount(Number(data.players));
      if (!isSpectator) {
        navigate(`/game?roomId=${encodeURIComponent(roomId)}&stake=${stake}&spectator=true`, { replace: true });
        return;
      }
    });
    socket.on('spectator_sync', (data) => {
      setSpectatorNumbers(data.calledNumbers || []);
      setSpectatorBall(data.currentBall || null);
      if (Number.isFinite(Number(data.players))) setPlayerCount(Number(data.players));
    });
    socket.on('insufficient_funds', (data) => {
      alert(`💰 ${data.message}`);
      window.location.href = '/wallet';
    });
    socket.on('game_aborted', (data) => {
      alert(`⚠️ ${data.message}`);
      window.location.href = '/';
    });
    socket.on('countdown_tick', (data) => setCountdown(data.timeLeft ?? data.seconds ?? null));
    socket.on('my_cards', (data) => {
      if (!isSpectator && data.cards && data.cards.length > 0) setCardsData(data.cards);
    });
    socket.on('game_started', () => {
      setCountdown(null);
      setGameStarted(true);
    });
    socket.on('new_number_called', (data) => {
      const ball = data.ball || `${data.letter}-${data.number}`;
      playBallCall(ball);
      const [ballLetter, ballNumber] = ball.split('-');
      const number = Number(data.number ?? ballNumber);
      const letter = data.letter || ballLetter;
      if (!Number.isFinite(number) || !letter) return;

      setCurrentBall({ number, letter });
      setCalledNumbers(data.calledNumbers || (prev => (
        prev.includes(number) ? prev : [...prev, number]
      )));
      if (isSpectator) {
        setSpectatorBall({ number, letter });
        setSpectatorNumbers(data.calledNumbers || (prev => (
          prev.includes(number) ? prev : [...prev, number]
        )));
      } else {
        setCalledHistory(prev => [...prev.slice(-4), { number, letter }]);
      }
    });
    socket.on('game_over', (data) => {
      const myId = String(userId);
      const isWinner = data.winnerIds?.some(id => String(id) === myId);
      if (isSpectator) {
        setGameResult({
          type: 'loss',
          titleKey: 'gameOver',
          messageKey: 'winnerIs',
          messageValues: { name: data.winnerName },
        });
        return;
      }

      if (isWinner) {
        setGameResult({
          type: 'win',
          titleKey: 'congratulations',
          messageKey: 'youWon',
          messageValues: { amount: Number(data.payout).toFixed(2) },
        });
      } else {
        setGameResult({
          type: 'loss',
          titleKey: 'gameOver',
          messageKey: 'winnerIs',
          messageValues: { name: data.winnerName },
        });
      }
      setTimeout(() => { setGameResult(null); navigate('/'); }, 5000);
    });
    socket.on('game_ended_for_spectators', () => {
      if (!isSpectator) return

      setGameResult((current) => current || {
        type: 'loss',
        titleKey: 'gameOver',
        messageKey: 'roundEnded',
      });
    });
    socket.on('next_game_ready', (data) => {
      if (!isSpectator) return
      setGameResult(null);
      setSpectatorNumbers([]);
      setSpectatorBall(null);
      navigate(`/select-card?stake=${data.stake || stake}`);
    });
    socket.on('room_reset', (data) => {
      if (!isSpectator) return
      setGameResult(null);
      setSpectatorNumbers([]);
      setSpectatorBall(null);
      navigate(`/select-card?stake=${data.stake || stake}`);
    });
    socket.on('bingo_result', (data) => {
      setBingoMessage(data);
      setTimeout(() => setBingoMessage(null), 4000);
    });
    socket.on('bingo_invalid', (data) => {
      setBingoMessage({ success: false, message: data.message });
      setTimeout(() => setBingoMessage(null), 4000);
    });

    if (socket.connected) handleJoin();
    else socket.on('connect', handleJoin);

    return () => {
      socket.off('connect', handleJoin);
      socket.off('room_update');
      socket.off('players_updated');
      socket.off('game_in_progress');
      socket.off('spectator_sync');
      socket.off('insufficient_funds');
      socket.off('game_aborted');
      socket.off('countdown_tick');
      socket.off('my_cards');
      socket.off('game_started');
      socket.off('new_number_called');
      socket.off('game_over');
      socket.off('game_ended_for_spectators');
      socket.off('next_game_ready');
      socket.off('room_reset');
      socket.off('bingo_result');
      socket.off('bingo_invalid');
    };
  }, [socket, roomId, userId, stake, isSpectator, navigate]);

  const handleDaub = (num) => {
    if (!calledNumbers.map(Number).includes(Number(num))) return;
    if (markedNumbers.map(Number).includes(Number(num))) return;
    setMarkedNumbers(prev => [...prev, Number(num)]);
  };

  const handleBingoClick = () => {
    if (!gameStarted || isSpectator) return;
    const cardId = cardsData[0]?.id || cardsData[0]?.cardId;
    if (!cardId) return;
    socket.emit('claim_bingo', { roomId, userId: localStorage.getItem('dbUserId'), cardId, markedNumbers });
  };

  const spectatorHistory = [...spectatorNumbers];
  if (
    spectatorBall &&
    Number(spectatorHistory[spectatorHistory.length - 1]) === Number(spectatorBall.number)
  ) {
    spectatorHistory.pop();
  }

  if (isSpectator) {
    return (
      <div className="min-h-screen bg-[#1e3a5f] text-white p-4 font-sans">
        <div className="mx-auto w-full max-w-5xl">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md bg-[#112A46] p-3 shadow-md">
            <div className="flex flex-wrap gap-2 text-xs font-bold sm:text-sm">
              <div className="rounded bg-[#2A4B6E] px-3 py-1">{t('win')}: --</div>
              <div className="rounded bg-[#2A4B6E] px-3 py-1">{t('stake')}: {stake || '--'}</div>
              <div className="rounded bg-[#2A4B6E] px-3 py-1">
                {t('call')}: {spectatorBall ? `${spectatorBall.letter}-${spectatorBall.number}` : '--'}
              </div>
              <div className="rounded bg-[#2A4B6E] px-3 py-1">{t('players')}: {playersCount}</div>
            </div>
            <div className="flex gap-1 text-xs">
              <button onClick={() => i18n.changeLanguage(i18n.language === 'en' ? 'am' : 'en')} className="rounded bg-[#2A4B6E] px-3 py-1 hover:bg-[#3A5B7E]">
                {i18n.language === 'en' ? 'AM' : 'EN'}
              </button>
              <button
                type="button"
                aria-label={isMuted ? t('unmuteSound') : t('muteSound')}
                onClick={() => setIsMuted(toggleMute())}
                className="ml-2 rounded-full bg-gray-800 p-2 text-white hover:bg-gray-700"
              >
                {isMuted ? '\u{1F507}' : '\u{1F50A}'}
              </button>
            </div>
          </div>

          <div className="mb-4 rounded-xl border border-blue-500 bg-blue-900/90 p-4 text-center shadow-lg">
            <p className="mb-1 text-lg font-bold">{t('pleaseWait')}</p>
            <p className="text-sm text-blue-200">{t('gameInProgress')}</p>
            <p className="mt-2 text-xs text-gray-400">{t('gameInProgressContinuation')}</p>
          </div>

          <div className="rounded-xl border border-blue-900 bg-[#112A46] p-4 shadow-2xl sm:p-6">
            <div className="mb-5 flex flex-col items-center">
              {spectatorBall ? (
                <div className={`flex h-36 w-36 flex-col items-center justify-center rounded-full border-8 shadow-xl ${getBallColor(spectatorBall.letter)}`}>
                  <span className="mt-1 text-2xl font-bold text-white">{spectatorBall.letter}</span>
                  <span className="text-6xl font-bold text-white">{spectatorBall.number}</span>
                </div>
              ) : (
                <div className="flex h-36 w-36 animate-pulse items-center justify-center rounded-full bg-gray-600">
                  <span className="text-4xl text-white">-</span>
                </div>
              )}
              <p className="mt-2 text-sm text-gray-300">{t('ballsCalled', { count: spectatorNumbers.length })}</p>
            </div>

            <div className="mb-4 flex min-h-10 justify-center gap-2">
              {spectatorHistory.slice(-5).reverse().map((num) => {
                let letter = 'B';
                if (num > 15) letter = 'I';
                if (num > 30) letter = 'N';
                if (num > 45) letter = 'G';
                if (num > 60) letter = 'O';
                return (
                  <div key={num} className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-bold ${getBallColor(letter)}`}>
                    {num}
                  </div>
                );
              })}
            </div>

            <div className="grid max-h-80 grid-cols-5 gap-1 overflow-y-auto rounded-lg bg-[#0d1f33] p-2 sm:grid-cols-10">
              {Array.from({ length: 75 }, (_, i) => i + 1).map((num) => {
                const isCalled = spectatorNumbers.includes(num);
                let letter = 'B';
                if (num > 15) letter = 'I';
                if (num > 30) letter = 'N';
                if (num > 45) letter = 'G';
                if (num > 60) letter = 'O';
                return (
                  <div key={num} className={`rounded py-1 text-center text-xs ${isCalled ? `${getBallColor(letter).split(' ')[0]} font-bold text-white` : 'bg-[#1e3a5f] text-gray-500'}`}>
                    {num}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {gameResult && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
            <div className="w-full max-w-sm rounded-2xl border-4 border-red-500 bg-[#112A46] p-8 text-center">
              <h2 className="mb-4 text-4xl font-bold text-red-400">{t(gameResult.titleKey)}</h2>
              <p className="text-xl text-white">{t(gameResult.messageKey, {
                ...gameResult.messageValues,
                name: gameResult.messageValues?.name || t('player'),
              })}</p>
              <p className="mt-4 text-sm text-blue-200">{t('returningToCardSelection')}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!gameStarted) {
    return (
      <CardSelection
        countdown={countdown}
        playersCount={playersCount}
        isGameStarted={gameStarted || (countdown !== null && countdown <= 0)}
        cardData={cardsData[0] || null}
        onCardUpdated={(updatedCard) => {
          setCardsData([updatedCard]);
          setMarkedNumbers([]);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#1e3a5f] text-white p-2 font-sans flex flex-col">
      <div className="relative z-[60] flex flex-wrap items-center justify-between gap-1 mb-4 bg-[#112A46] p-2 rounded-md shadow-md">
        <div className="flex gap-2 text-xs font-bold">
          <div className="bg-[#2A4B6E] px-3 py-1 rounded">{t('win')}: {gameStarted ? '0' : '--'}</div>
          <div className="bg-[#2A4B6E] px-3 py-1 rounded">{t('stake')}: {stake || '--'}</div>
          <div className="bg-[#2A4B6E] px-3 py-1 rounded">{t('call')}: {gameStarted ? calledNumbers.length : '--'}</div>
          <div className="bg-[#2A4B6E] px-3 py-1 rounded">{t('players')}: {playersCount}</div>
        </div>
        <div className="flex gap-1 text-xs">
          <button onClick={() => i18n.changeLanguage(i18n.language === 'en' ? 'am' : 'en')} className="bg-[#2A4B6E] px-3 py-1 rounded hover:bg-[#3A5B7E]">
            {i18n.language === 'en' ? 'AM' : 'EN'}
          </button>
          <button
            type="button"
            aria-label={isMuted ? t('unmuteSound') : t('muteSound')}
            onClick={() => setIsMuted(toggleMute())}
            className="ml-2 rounded-full bg-gray-800 p-2 text-white hover:bg-gray-700"
          >
            {isMuted ? '\u{1F507}' : '\u{1F50A}'}
          </button>
        </div>
      </div>
      {countdown !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-gradient-to-br from-indigo-900 to-blue-900 px-6 py-10 text-center shadow-2xl ring-1 ring-white/20 animate-pulse sm:px-12 sm:py-14">
            <p className="mb-4 text-xl font-bold text-blue-100 sm:text-2xl">
              {t('countdown')}
            </p>
            <div className="text-6xl font-black text-white drop-shadow-lg sm:text-8xl">
              {formatTime(countdown)}
            </div>
            <p className="mt-5 text-lg font-semibold text-blue-100 sm:text-xl">
              {t('getReady')}
            </p>
          </div>
        </div>
      )}
      {!gameStarted && countdown === null ? (
        <div className="flex-1 flex justify-center items-center text-gray-400">
          {t('waitingPlayersLine1')}
          <br />
          {t('waitingPlayersLine2')}
        </div>
      ) : (
        <>
      <div className="flex flex-row gap-2 flex-1">
        <div className="w-1/2 flex flex-col gap-4">
          <div className="w-full h-40 flex items-center justify-center mb-4">
            {countdown !== null ? (
              <span className="text-7xl font-bold text-white">{formatTime(countdown)}</span>
            ) : currentBall ? (
              <div className={`w-40 h-40 rounded-full border-8 flex items-center justify-center shadow-2xl ${getBallColor(currentBall.letter)}`}>
                <span className="text-5xl font-black text-white">{currentBall.letter}-{currentBall.number}</span>
              </div>
            ) : (
              <span className="text-gray-400 font-bold">{t('waitingGame')}</span>
            )}
          </div>
          <div className="flex gap-2 justify-center h-10">
            {calledHistory.map((ball, i) => (
              <div key={i} className={`w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold text-sm ${getBallColor(ball.letter)}`}>{ball.number}</div>
            ))}
          </div>
          <div className="bg-[#4a5568] p-2 rounded-lg shadow-md">
            <div className="grid grid-cols-5 gap-1">
              {['B', 'I', 'N', 'G', 'O'].map((letter) => (
                <div key={letter} className={`text-center text-xl py-1 rounded text-white ibm-plex-mono-bold-italic ${getBallColor(letter).split(' ')[0]}`}>{letter}</div>
              ))}
              {Array.from({ length: 15 }, (_, rowIndex) => (
                <Fragment key={rowIndex}>
                  {[0, 1, 2, 3, 4].map((colIndex) => {
                    const num = rowIndex + 1 + (colIndex * 15);
                    const isCalled = calledNumbers.includes(num);
                    return (
                      <div key={num} className={`text-center text-sm py-1.5 rounded ${isCalled ? 'bg-yellow-400 text-black font-bold' : 'bg-[#1e3a5f] text-white'}`}>{num}</div>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        </div>

        <div className="w-1/2 flex flex-col justify-center items-center gap-4 py-10">
          <div className="w-full flex flex-col items-center gap-4">
            {cardsData && cardsData.length > 0 ? (
              <div className="bg-[#4a5568] p-3 rounded-xl shadow-lg">
                <div className="text-center font-bold text-lg mb-2 text-gray-200">{t('cardNo', { number: cardsData[0]?.id || '?' })}</div>
                <div className="grid grid-cols-5 gap-1 mb-2">
                  {['B', 'I', 'N', 'G', 'O'].map((letter) => (
                    <div key={letter} className={`text-center text-xl py-1 rounded text-white ibm-plex-mono-bold-italic ${getBallColor(letter).split(' ')[0]}`}>{letter}</div>
                  ))}
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {cardsData[0]?.matrix?.flat().map((num, index) => {
                    const isFree = index === 12 || num === 'FREE';
                    const isMarked = isFree || markedNumbers.includes(num);
                    return (
                      <button key={index} onClick={() => !isFree && handleDaub(num)} className={`aspect-square flex items-center justify-center font-bold text-lg rounded-md shadow-sm transition-transform ${isFree ? 'bg-blue-600 text-white border-b-0 transform translate-y-1' : isMarked ? 'bg-green-500 text-white border-b-0 transform translate-y-1' : 'bg-white text-black border-b-4 border-gray-300 hover:bg-gray-100'}`}>
                        {isFree ? 'F' : num}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-white text-center mt-10">{t('loadingCard')}</div>
            )}
            <button onClick={handleBingoClick} className="w-full max-w-sm bg-yellow-500 text-[#112A46] font-extrabold text-2xl py-4 rounded-xl shadow-lg">{t('bingo')}</button>
          </div>
        </div>
      </div>
        </>
      )}

      {bingoMessage && (
        <div className={`fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 px-6 py-4 rounded-xl shadow-2xl font-bold text-center z-50 ${bingoMessage.success ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {bingoMessage.message}
        </div>
      )}

      {gameResult && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className={`bg-[#112A46] rounded-2xl p-8 max-w-sm w-full text-center border-4 ${gameResult.type === 'win' ? 'border-yellow-500' : 'border-red-500'}`}>
            <h2 className={`text-4xl font-bold mb-4 ${gameResult.type === 'win' ? 'text-yellow-400' : 'text-red-400'}`}>
              {t(gameResult.titleKey)}
            </h2>
            <p className="text-white text-xl mb-8">{t(gameResult.messageKey, {
              ...gameResult.messageValues,
              name: gameResult.messageValues?.name || t('player'),
            })}</p>
            <button onClick={() => { setGameResult(null); navigate('/'); }} className="w-full bg-white text-[#112A46] font-bold py-3 rounded-xl">{t('backToLobby')}</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameScreen;
