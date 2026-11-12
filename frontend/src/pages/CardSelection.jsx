import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchApi } from '../services/api';
import SocketService from '../services/socket';
import { unlockAudio } from '../utils/bingoSounds';

const formatTime = (seconds) => {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainingSeconds = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
};

export default function CardSelection({
  countdown = null,
  playersCount,
  isGameStarted = false,
  cardData = null,
  onCardUpdated,
}) {
  const [searchParams] = useSearchParams();
  const stake = searchParams.get('stake') || '10';
  const roomId = searchParams.get('roomId');
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [takenCards, setTakenCards] = useState([]);
  const [waitingRoom, setWaitingRoom] = useState(null);
  const [socketPlayersCount, setSocketPlayersCount] = useState(null);
  const [socketCountdown, setSocketCountdown] = useState(null);
  const [selectedCard, setSelectedCard] = useState(cardData?.id ? Number(cardData.id) : null);
  const [selectedMatrix, setSelectedMatrix] = useState(cardData?.matrix || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const currentSelectedCard = selectedCard ?? (cardData?.id ? Number(cardData.id) : null);
  const currentSelectedMatrix = selectedCard === null ? cardData?.matrix || null : selectedMatrix;
  const activeRoomId = roomId || waitingRoom?.roomId;
  const currentCountdown = countdown ?? socketCountdown;
  const selectionLocked = isGameStarted
    || (currentCountdown !== null && currentCountdown !== undefined && currentCountdown <= 0);
  const hasCountdown = currentCountdown !== null && currentCountdown !== undefined;
  const displayPlayersCount = playersCount ?? socketPlayersCount ?? 0;

  useEffect(() => {
    if (roomId || onCardUpdated) return undefined;
    let cancelled = false;

    const fetchWaitingRoom = async () => {
      try {
        const res = await fetchApi(`/rooms/waiting-room?stake=${encodeURIComponent(stake)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to fetch waiting room.');
        if (cancelled) return;
        setWaitingRoom(data.roomId ? data : null);
        setSocketPlayersCount(Number(data.playerCount || 0));
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to fetch waiting room', err);
          setError(err.message || 'Failed to fetch waiting room.');
        }
      }
    };

    fetchWaitingRoom();
    return () => {
      cancelled = true;
    };
  }, [onCardUpdated, roomId, stake]);

  useEffect(() => {
    const fetchTakenCards = async () => {
      try {
        const res = await fetchApi(`/rooms/active-cards?stake=${stake}`);
        if (res.ok) {
          const data = await res.json();
          setTakenCards(data.takenCards || []);
        }
      } catch (err) {
        console.error('Failed to fetch taken cards', err);
      }
    };
    fetchTakenCards();
  }, [stake]);

  useEffect(() => {
    if (!activeRoomId || onCardUpdated) return undefined;

    const socket = SocketService.connect();
    const handlePlayersUpdated = (data) => {
      const count = Number(data?.count);
      if (Number.isFinite(count)) setSocketPlayersCount(count);
    };
    const handleCountdown = (data) => {
      const timeLeft = Number(data?.timeLeft);
      if (Number.isFinite(timeLeft)) setSocketCountdown(timeLeft);
    };

    const redirectToGame = () => {
      navigate(`/game?roomId=${encodeURIComponent(activeRoomId)}&stake=${encodeURIComponent(stake)}`);
    };
    const handleRoomUpdate = (data) => {
      if (String(data?.status).toLowerCase() === 'playing') {
        redirectToGame();
      }
    };

    socket.on('players_updated', handlePlayersUpdated);
    socket.on('countdown_tick', handleCountdown);
    socket.on('game_started', redirectToGame);
    socket.on('game_in_progress', redirectToGame);
    socket.on('room_update', handleRoomUpdate);
    socket.emit('join_room', {
      roomId: activeRoomId,
      stake: Number(stake),
      observeOnly: !roomId,
    });

    return () => {
      socket.off('players_updated', handlePlayersUpdated);
      socket.off('countdown_tick', handleCountdown);
      socket.off('game_started', redirectToGame);
      socket.off('game_in_progress', redirectToGame);
      socket.off('room_update', handleRoomUpdate);
    };
  }, [activeRoomId, navigate, onCardUpdated, roomId, stake]);

  const handleCardSelect = async (cardNumber) => {
    unlockAudio();
    if (selectionLocked || loading) return;

    if (cardNumber === currentSelectedCard) {
      if (!roomId) return;

      setLoading(true);
      setError('');

      try {
        const res = await fetchApi(`/rooms/${encodeURIComponent(roomId)}/my-card`, {
          method: 'DELETE',
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to unselect card');
        }

        setSelectedCard(null);
        setSelectedMatrix(null);
        setTakenCards((prev) => prev.filter((cardId) => cardId !== currentSelectedCard));
        onCardUpdated?.(null);
        navigate(`/select-card?stake=${encodeURIComponent(stake)}`, { replace: true });
      } catch (err) {
        setError(err.message || 'Failed to unselect card');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (takenCards.includes(cardNumber)) return;

    const previousCard = currentSelectedCard;
    const previousMatrix = currentSelectedMatrix;
    setSelectedCard(cardNumber);
    setSelectedMatrix(null);
    setLoading(true);
    setError('');

    try {
      const res = await fetchApi('/rooms/join', {
        method: 'POST',
        body: JSON.stringify({
          stake: Number(stake),
          card_number: cardNumber,
          userId: localStorage.getItem('dbUserId'),
          ...(roomId ? { roomId } : {}),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || t('joinFailed'));
      }

      if (data.status === 'spectator') {
        navigate(`/game?roomId=${data.roomId}&stake=${stake}&spectator=true`);
        return;
      }

      const joinedRoomId = data.roomId || roomId;
      if (joinedRoomId) {
        SocketService.connect().emit('join_room', {
          roomId: joinedRoomId,
          stake: Number(data.stake || stake),
        });
        setWaitingRoom({ roomId: joinedRoomId, playerCount: socketPlayersCount || 0 });
      }

      localStorage.setItem('activeGameRoom', JSON.stringify({
        roomId: data.roomId || roomId,
        stake: Number(data.stake || stake),
      }));

      const updatedCard = {
        id: Number(data.card.id),
        matrix: data.card.matrix,
      };
      setSelectedCard(updatedCard.id);
      setSelectedMatrix(updatedCard.matrix);

      if (roomId) {
        onCardUpdated?.(updatedCard);
      } else {
        navigate(`/game?roomId=${data.roomId}&stake=${stake}`);
      }
    } catch (err) {
      const errorText = String(err.message || '');
      const errorMessage = errorText.toLowerCase();
      if (roomId && ['started', 'in progress', 'playing', 'cannot join'].some((phrase) => (
        errorMessage.includes(phrase)
      ))) {
        localStorage.setItem('activeGameRoom', JSON.stringify({
          roomId,
          stake: Number(stake),
        }));
        navigate(`/game?roomId=${encodeURIComponent(roomId)}&stake=${encodeURIComponent(stake)}`);
        return;
      }

      setSelectedCard(previousCard);
      setSelectedMatrix(previousMatrix);
      setError(errorText || t('joinFailed'));
      if (errorMessage.includes('taken')) {
        setTakenCards((prev) => [...prev, cardNumber]);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#0f172a] text-white">
      <div className="flex-1 overflow-y-auto p-4 pb-36">
        <div className="mx-auto max-w-4xl">
          <div className="mx-auto mb-6 w-full max-w-lg">
            {!roomId && (
              <button
                type="button"
                onClick={() => navigate('/')}
                className="mb-4 flex items-center gap-1 font-bold text-yellow-500 transition-colors hover:text-yellow-400"
              >
                <span>←</span> {t('back')}
              </button>
            )}

            <div className="flex w-full items-center justify-between gap-2">
              <div className="flex shrink-0 items-center gap-2 rounded-xl border border-slate-600/50 bg-[#1e293b]/80 px-3 py-1.5 text-sm font-bold text-slate-200 shadow-lg backdrop-blur-sm">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                {t('players', { defaultValue: 'Players' })}: {displayPlayersCount}
              </div>

              <h1 className="whitespace-nowrap bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-right text-xl font-extrabold tracking-tight text-transparent drop-shadow-sm sm:text-2xl">
                {t('selectCard')} <span className="text-lg sm:text-xl">({stake} ETB)</span>
              </h1>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded bg-red-600 p-3 text-center text-white">
              {error}
            </div>
          )}

          <div className="mx-auto grid max-w-lg grid-cols-6 gap-1 p-2">
            {Array.from({ length: 400 }, (_, i) => i + 1).map((cardNumber) => {
              const isSelected = currentSelectedCard === cardNumber;
              const isTaken = takenCards.includes(cardNumber) && !isSelected;
              const isDisabled = isTaken || loading || selectionLocked;

              return (
                <button
                  key={cardNumber}
                  type="button"
                  disabled={isDisabled}
                  aria-pressed={isSelected}
                  onClick={() => handleCardSelect(cardNumber)}
                  className={`relative flex h-7 shrink-0 select-none items-center justify-center rounded-lg border text-[11px] font-bold transition-all duration-100 touch-manipulation sm:h-8 ${
                    isSelected
                      ? 'scale-[0.96] border-blue-900 bg-gradient-to-b from-blue-400 to-blue-600 text-white shadow-[inset_0_4px_8px_rgba(0,0,0,0.4)]'
                      : isDisabled
                        ? 'cursor-not-allowed border-slate-800 bg-slate-900 text-slate-600 opacity-50 shadow-none'
                        : 'border-slate-300 bg-white text-slate-800 shadow-[0_4px_0_rgb(148,163,184)] hover:-translate-y-0.5 hover:shadow-[0_5px_0_rgb(148,163,184)] active:translate-y-1 active:shadow-none'
                  }`}
                >
                  {cardNumber}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 z-30 h-32 w-full border-t border-slate-700 bg-[#0f172a]/95 p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] backdrop-blur-lg">
        <div className="mx-auto flex h-full max-w-4xl gap-2">
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-600/50 bg-slate-800/80 p-2 text-slate-100 shadow-xl backdrop-blur-md">
            <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-blue-500 via-purple-500 to-red-500" />
            <div className="mb-1.5 mt-0.5 shrink-0 truncate text-center text-[10px] font-bold leading-3 text-slate-300 sm:text-xs">
              {currentSelectedCard ? t('cardNo', { number: currentSelectedCard }) : t('selectCard')}
            </div>
            {currentSelectedMatrix ? (
              <div className="grid min-h-0 flex-1 grid-cols-5 grid-rows-6 gap-0.5">
                {['B', 'I', 'N', 'G', 'O'].map((letter, index) => {
                  const headerGradients = [
                    'from-blue-500 to-blue-700',
                    'from-red-500 to-red-700',
                    'from-purple-500 to-purple-700',
                    'from-green-500 to-green-700',
                    'from-yellow-400 to-yellow-600',
                  ];
                  return (
                    <div key={letter} className={`flex min-h-0 items-center justify-center rounded-t-sm bg-gradient-to-b ${headerGradients[index]} text-[9px] font-black leading-none text-white shadow-sm`}>
                      {letter}
                    </div>
                  );
                })}
                {currentSelectedMatrix.flat().map((number, index) => (
                  <div
                    key={index}
                    className={`flex min-h-0 items-center justify-center rounded-sm text-[9px] font-bold leading-none ${
                      index === 12 || number === 'FREE'
                        ? 'bg-gradient-to-br from-blue-400 to-blue-600 text-white shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]'
                        : 'bg-slate-100 text-slate-800 shadow-[0_2px_0_rgb(148,163,184)]'
                    }`}
                  >
                    {index === 12 || number === 'FREE' ? 'F' : number}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 items-center justify-center text-center text-[10px] text-slate-500">
                {roomId ? t('loadingCard') : t('selectCard')}
              </div>
            )}
          </div>

          <div className="relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-900 to-slate-800 p-3 text-center shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
            {displayPlayersCount < 2 ? (
              <div className="flex flex-col items-center gap-1.5">
                <div className="relative flex h-8 w-8 items-center justify-center">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex h-4 w-4 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-200 sm:text-xs">
                  {t('waitingPlayers')}
                </span>
              </div>
            ) : hasCountdown ? (
              <div className="flex w-full flex-col items-center">
                <span className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {t('countdown')}
                </span>
                <span className="bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-3xl font-black tabular-nums text-transparent drop-shadow-[0_0_10px_rgba(250,204,21,0.3)] sm:text-4xl">
                  {formatTime(Math.max(0, Number(currentCountdown)))}
                </span>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 transition-all duration-1000 ease-linear"
                    style={{ width: `${Math.min(100, Math.max(0, (Number(currentCountdown) / 30) * 100))}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <div className="mb-1 h-2 w-2 animate-pulse rounded-full bg-yellow-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-yellow-400">
                  {t('getReady')}
                </span>
              </div>
            )}
            {loading && <span className="absolute bottom-1 text-[9px] text-blue-300 animate-pulse">{t('loadingCard')}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
