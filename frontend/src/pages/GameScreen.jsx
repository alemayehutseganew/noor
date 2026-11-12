import { useEffect, useState, Fragment } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import CardSelection from './CardSelection';
import SocketService from '../services/socket';
import { useWallet } from '../WalletContext';
import { getMuteState, playBallCall, toggleMute } from '../utils/bingoSounds';

const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

const getBallColor = (letter) => {
  switch(letter) {
    case 'B': return 'bg-blue-500 border-blue-900 shadow-[0_4px_0_#1e3a8a]';
    case 'I': return 'bg-red-500 border-red-900 shadow-[0_4px_0_#7f1d1d]';
    case 'N': return 'bg-purple-500 border-purple-900 shadow-[0_4px_0_#4c1d95]';
    case 'G': return 'bg-green-500 border-green-900 shadow-[0_4px_0_#14532d]';
    case 'O': return 'bg-yellow-500 border-yellow-900 shadow-[0_4px_0_#78350f]';
    default: return 'bg-gray-500 border-gray-700 shadow-[0_4px_0_#1f2937]';
  }
};

const getBallGradient = (letter) => {
  switch (letter) {
    case 'B': return 'from-blue-400 to-blue-800';
    case 'I': return 'from-red-400 to-red-800';
    case 'N': return 'from-purple-400 to-purple-800';
    case 'G': return 'from-green-400 to-green-800';
    case 'O': return 'from-yellow-400 to-orange-600';
    default: return 'from-gray-400 to-gray-800';
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
  const { balance } = useWallet();

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
      if (data?.reason === 'no_winner' || (Array.isArray(data?.winners) && data.winners.length === 0)) {
        navigate(`/select-card?stake=${stake}`);
        return;
      }

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
      <div className="min-h-screen bg-gradient-to-b from-[#0f172a] via-[#1e293b] to-[#020617] p-3 font-sans text-white">
        <div className="mx-auto w-full max-w-5xl">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-600/50 bg-slate-800/60 p-2.5 shadow-2xl backdrop-blur-lg">
            <div className="flex flex-wrap gap-2 text-xs font-bold sm:text-sm">
              <div className="flex min-h-11 items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/80 px-3 shadow-inner"><span className="text-slate-400">{t('win')}:</span><span className="text-emerald-400">--</span></div>
              <div className="flex min-h-11 items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/80 px-3 shadow-inner"><span className="text-slate-400">{t('stake')}:</span><span className="text-blue-400">{stake || '--'}</span></div>
              <div className="flex min-h-11 items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/80 px-3 shadow-inner">
                <span className="text-slate-400">{t('call')}:</span><span className="text-amber-300">
                  {spectatorBall ? `${spectatorBall.letter}-${spectatorBall.number}` : '--'}
                </span>
              </div>
              <div className="flex min-h-11 items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/80 px-3 shadow-inner"><span className="text-slate-400">{t('players')}:</span><span className="text-violet-300">{playersCount}</span></div>
            </div>
            <div className="ml-auto flex items-center gap-2 text-xs">
              <div className="flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/80 px-3 shadow-inner">
                <span className="text-sm text-yellow-400" aria-hidden="true">💰</span>
                <span className="text-sm font-black tabular-nums text-white sm:text-base">
                  {Number(balance).toFixed(2)} <span className="text-[10px] font-bold text-slate-400">ETB</span>
                </span>
              </div>
              <button type="button" onClick={() => i18n.changeLanguage(i18n.language === 'en' ? 'am' : 'en')} className="h-11 min-w-11 rounded-full bg-slate-700 px-3 font-bold text-white shadow-[0_4px_0_rgb(51,65,85)] transition-all active:translate-y-1 active:shadow-none">
                {i18n.language === 'en' ? 'AM' : 'EN'}
              </button>
              <button
                type="button"
                aria-label={isMuted ? t('unmuteSound') : t('muteSound')}
                onClick={() => setIsMuted(toggleMute())}
                className="h-11 min-w-11 rounded-full bg-slate-700 p-2 text-white shadow-[0_4px_0_rgb(51,65,85)] transition-all hover:bg-slate-600 active:translate-y-1 active:shadow-none"
              >
                {isMuted ? '\u{1F507}' : '\u{1F50A}'}
              </button>
            </div>
          </div>

          <div className="mb-4 rounded-2xl border border-blue-400/30 bg-blue-950/60 p-4 text-center shadow-xl backdrop-blur">
            <p className="mb-1 text-lg font-bold text-blue-100">{t('pleaseWait')}</p>
            <p className="text-sm text-blue-200">{t('gameInProgress')}</p>
            <p className="mt-2 text-xs text-slate-400">{t('gameInProgressContinuation')}</p>
          </div>

          <div className="rounded-2xl border border-slate-600/50 bg-slate-800/80 p-3 shadow-2xl sm:p-6">
            <div className="mb-5 flex flex-col items-center">
              {spectatorBall ? (
                <div className={`relative flex h-40 w-40 flex-col items-center justify-center rounded-full bg-gradient-to-br shadow-[0_20px_40px_rgba(0,0,0,0.6),inset_0_-10px_20px_rgba(0,0,0,0.6),inset_0_10px_20px_rgba(255,255,255,0.4)] sm:h-48 sm:w-48 ${getBallGradient(spectatorBall.letter)}`}>
                  <div className="pointer-events-none absolute left-4 top-2 h-1/4 w-2/3 -rotate-12 rounded-full bg-white/30 blur-md" />
                  <span className="z-10 mt-1 text-2xl font-bold text-white drop-shadow-lg">{spectatorBall.letter}</span>
                  <span className="z-10 text-6xl font-black text-white drop-shadow-[0_5px_5px_rgba(0,0,0,0.6)]">{spectatorBall.number}</span>
                </div>
              ) : (
                <div className="flex h-40 w-40 animate-pulse items-center justify-center rounded-full bg-gradient-to-br from-slate-500 to-slate-800 shadow-[0_20px_40px_rgba(0,0,0,0.6),inset_0_-10px_20px_rgba(0,0,0,0.6),inset_0_10px_20px_rgba(255,255,255,0.3)] sm:h-48 sm:w-48">
                  <span className="text-4xl text-white">-</span>
                </div>
              )}
              <p className="mt-3 text-sm text-slate-300">{t('ballsCalled', { count: spectatorNumbers.length })}</p>
            </div>

            <div className="mb-4 flex min-h-11 flex-wrap justify-center gap-2">
              {spectatorHistory.slice(-5).reverse().map((num) => {
                let letter = 'B';
                if (num > 15) letter = 'I';
                if (num > 30) letter = 'N';
                if (num > 45) letter = 'G';
                if (num > 60) letter = 'O';
                return (
                  <div key={num} className={`flex h-11 w-11 items-center justify-center rounded-full border border-white/30 text-sm font-bold text-white ${getBallColor(letter)}`}>
                    {num}
                  </div>
                );
              })}
            </div>

            <div className="grid max-h-96 grid-cols-5 gap-1.5 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950/80 p-2 sm:grid-cols-10">
              {Array.from({ length: 75 }, (_, i) => i + 1).map((num) => {
                const isCalled = spectatorNumbers.includes(num);
                let letter = 'B';
                if (num > 15) letter = 'I';
                if (num > 30) letter = 'N';
                if (num > 45) letter = 'G';
                if (num > 60) letter = 'O';
                return (
                  <div key={num} className={`flex min-h-11 min-w-11 items-center justify-center rounded-xl text-sm ${isCalled ? `${getBallColor(letter).split(' ')[0]} font-bold text-white shadow-[0_4px_0_rgba(0,0,0,0.6)]` : 'bg-slate-800 text-slate-500'}`}>
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
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-b from-[#0f172a] via-[#1e293b] to-[#020617] p-3 font-sans text-white flex flex-col">
      <div className="relative z-[60] mb-4 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-600/50 bg-slate-800/60 p-2.5 shadow-2xl backdrop-blur-lg">
        <div className="flex flex-wrap gap-2 text-xs font-bold sm:text-sm">
          <div className="flex min-h-11 items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/80 px-3 shadow-inner"><span className="text-slate-400">{t('win')}:</span><span className="text-emerald-400">{gameStarted ? '0' : '--'}</span></div>
          <div className="flex min-h-11 items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/80 px-3 shadow-inner"><span className="text-slate-400">{t('stake')}:</span><span className="text-blue-400">{stake || '--'}</span></div>
          <div className="flex min-h-11 items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/80 px-3 shadow-inner"><span className="text-slate-400">{t('call')}:</span><span className="text-amber-300">{gameStarted ? calledNumbers.length : '--'}</span></div>
          <div className="flex min-h-11 items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/80 px-3 shadow-inner"><span className="text-slate-400">{t('players')}:</span><span className="text-violet-300">{playersCount}</span></div>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <div className="flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/80 px-3 shadow-inner">
            <span className="text-sm text-yellow-400" aria-hidden="true">💰</span>
            <span className="text-sm font-black tabular-nums text-white sm:text-base">
              {Number(balance).toFixed(2)} <span className="text-[10px] font-bold text-slate-400">ETB</span>
            </span>
          </div>
          <button type="button" onClick={() => i18n.changeLanguage(i18n.language === 'en' ? 'am' : 'en')} className="h-11 min-w-11 rounded-full bg-slate-700 px-3 font-bold text-white shadow-[0_4px_0_rgb(51,65,85)] transition-all hover:bg-slate-600 active:translate-y-1 active:shadow-none">
            {i18n.language === 'en' ? 'AM' : 'EN'}
          </button>
          <button
            type="button"
            aria-label={isMuted ? t('unmuteSound') : t('muteSound')}
            onClick={() => setIsMuted(toggleMute())}
            className="h-11 min-w-11 rounded-full bg-slate-700 p-2 text-white shadow-[0_4px_0_rgb(51,65,85)] transition-all hover:bg-slate-600 active:translate-y-1 active:shadow-none"
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
        <div className="flex flex-1 items-center justify-center text-slate-400">
          {t('waitingPlayersLine1')}
          <br />
          {t('waitingPlayersLine2')}
        </div>
      ) : (
        <>
      <div className="flex w-full shrink-0 items-center justify-center pb-2">
        {countdown !== null ? (
          <span className="text-7xl font-bold text-white">{formatTime(countdown)}</span>
        ) : currentBall ? (
          <div className={`relative flex h-40 w-40 items-center justify-center rounded-full bg-gradient-to-br shadow-[0_20px_40px_rgba(0,0,0,0.6),inset_0_-10px_20px_rgba(0,0,0,0.6),inset_0_10px_20px_rgba(255,255,255,0.4)] sm:h-48 sm:w-48 ${getBallGradient(currentBall.letter)}`}>
            <div className="pointer-events-none absolute left-4 top-2 h-1/4 w-2/3 -rotate-12 rounded-full bg-white/30 blur-md" />
            <span className="z-10 text-4xl font-black text-white drop-shadow-[0_5px_5px_rgba(0,0,0,0.6)] sm:text-5xl">{currentBall.letter}-{currentBall.number}</span>
          </div>
        ) : (
          <span className="font-bold text-slate-400">{t('waitingGame')}</span>
        )}
      </div>
      <div className="grid flex-1 grid-cols-2 items-start gap-2 sm:gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex min-h-8 flex-wrap justify-center gap-1">
            {calledHistory.slice(-10).map((ball, i) => (
              <div key={i} className={`flex h-8 w-8 items-center justify-center rounded-full border border-white/30 text-[10px] font-bold text-white sm:h-9 sm:w-9 sm:text-xs ${getBallColor(ball.letter)}`}>{ball.number}</div>
            ))}
          </div>
          <div className="flex flex-col gap-1 overflow-hidden rounded-xl border border-slate-600/50 bg-slate-800/80 p-1.5 shadow-xl">
            <div className="grid grid-cols-5 gap-1">
              {['B', 'I', 'N', 'G', 'O'].map((letter) => (
                <div key={letter} className={`rounded border-b-2 border-black/30 bg-gradient-to-b py-1 text-center text-xs font-black text-white shadow-md ${getBallGradient(letter)}`}>{letter}</div>
              ))}
            </div>
            <div className="grid grid-cols-5 gap-1">
              {Array.from({ length: 15 }, (_, rowIndex) => (
                <Fragment key={rowIndex}>
                  {[0, 1, 2, 3, 4].map((colIndex) => {
                    const num = rowIndex + 1 + (colIndex * 15);
                    const isCalled = calledNumbers.includes(num);
                    const letter = num <= 15 ? 'B' : num <= 30 ? 'I' : num <= 45 ? 'N' : num <= 60 ? 'G' : 'O';
                    return (
                      <div key={num} className={`flex h-6 items-center justify-center rounded text-[10px] sm:h-7 sm:text-xs ${isCalled ? `bg-gradient-to-br ${getBallGradient(letter)} font-bold text-white shadow-[0_3px_0_rgba(0,0,0,0.6)]` : 'border border-slate-700 bg-slate-900 text-slate-400 shadow-inner'}`}>{num}</div>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col items-center gap-2">
          <div className="flex w-full flex-col items-center gap-2">
            {cardsData && cardsData.length > 0 ? (
              <div className="w-full rounded-xl border border-slate-600/50 bg-slate-800/80 p-1.5 shadow-xl">
                <div className="mb-1 text-center text-[10px] font-bold text-slate-300 sm:text-xs">{t('cardNo', { number: cardsData[0]?.id || '?' })}</div>
                <div className="mb-1 grid grid-cols-5 gap-1">
                  {['B', 'I', 'N', 'G', 'O'].map((letter) => (
                    <div key={letter} className={`rounded border-b-2 border-black/30 bg-gradient-to-b py-1 text-center text-xs font-black text-white shadow-md ${getBallGradient(letter)}`}>{letter}</div>
                  ))}
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {cardsData[0]?.matrix?.flat().map((num, index) => {
                    const isFree = index === 12 || num === 'FREE';
                    const isMarked = isFree || markedNumbers.includes(num);
                    return (
                      <button type="button" key={index} onClick={() => !isFree && handleDaub(num)} className={`aspect-square min-h-0 min-w-0 flex items-center justify-center rounded-md border text-[10px] font-bold transition-all duration-150 sm:text-xs ${isFree ? 'border-blue-300/30 bg-gradient-to-br from-blue-500 to-blue-800 text-white shadow-[inset_0_4px_8px_rgba(0,0,0,0.45)]' : isMarked ? 'border-emerald-300/30 bg-gradient-to-br from-emerald-400 to-emerald-700 text-white shadow-[inset_0_4px_8px_rgba(0,0,0,0.5)]' : 'border-slate-300 bg-slate-100 text-slate-900 shadow-[0_3px_0_rgb(148,163,184)] hover:bg-white active:translate-y-0.5 active:shadow-none'}`}>
                        {isFree ? 'F' : num}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="py-4 text-center text-xs text-white">{t('loadingCard')}</div>
            )}
            <button type="button" onClick={handleBingoClick} className="min-h-11 w-full rounded-lg border border-amber-300/50 bg-gradient-to-b from-yellow-300 to-amber-500 py-2 text-base font-extrabold text-slate-900 shadow-[0_4px_0_rgb(180,83,9)] transition-all active:translate-y-1 active:shadow-none">{t('bingo')}</button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md transition-opacity">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="game-result-title"
            className="w-full max-w-sm rounded-3xl border border-slate-600/50 bg-slate-800/90 p-8 text-center shadow-[0_0_50px_rgba(0,0,0,0.8)] transition-transform duration-300"
          >
            <div className="mb-4 flex justify-center">
              <div className={`flex h-20 w-20 items-center justify-center rounded-full text-4xl ${gameResult.type === 'win' ? 'animate-bounce bg-yellow-400 shadow-[0_0_30px_rgba(250,204,21,0.6)]' : 'animate-pulse bg-slate-700 text-blue-200 shadow-inner'}`}>
                {gameResult.type === 'win' ? '🏆' : '✨'}
              </div>
            </div>
            <h2
              id="game-result-title"
              className={`mb-3 text-3xl font-black ${gameResult.type === 'win' ? 'bg-gradient-to-r from-yellow-300 to-yellow-500 bg-clip-text text-transparent' : 'text-slate-100'}`}
            >
              {t(gameResult.type === 'win' ? gameResult.titleKey : 'wellPlayed')}
            </h2>
            <p className="mb-8 text-base leading-relaxed text-slate-300">{t(gameResult.messageKey, {
              ...gameResult.messageValues,
              name: gameResult.messageValues?.name || t('player'),
            })}</p>
            <button
              type="button"
              onClick={() => { setGameResult(null); navigate('/'); }}
              className="min-h-12 w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 py-3.5 font-bold text-white shadow-[0_5px_0_#1e3a8a] transition-all active:translate-y-1 active:shadow-none"
            >
              {t('backToLobby')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameScreen;
