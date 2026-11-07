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
  playersCount = 0,
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
  const [selectedCard, setSelectedCard] = useState(cardData?.id ? Number(cardData.id) : null);
  const [selectedMatrix, setSelectedMatrix] = useState(cardData?.matrix || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const currentSelectedCard = selectedCard ?? (cardData?.id ? Number(cardData.id) : null);
  const currentSelectedMatrix = selectedCard === null ? cardData?.matrix || null : selectedMatrix;
  const selectionLocked = isGameStarted
    || (countdown !== null && countdown !== undefined && countdown <= 0);
  const hasCountdown = countdown !== null && countdown !== undefined;

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
    if (!roomId || onCardUpdated) return undefined;

    const socket = SocketService.get();
    if (!socket) return undefined;

    const redirectToGame = () => {
      navigate(`/game?roomId=${encodeURIComponent(roomId)}&stake=${encodeURIComponent(stake)}`);
    };
    const handleRoomUpdate = (data) => {
      if (String(data?.status).toLowerCase() === 'playing') {
        redirectToGame();
      }
    };

    socket.on('game_started', redirectToGame);
    socket.on('game_in_progress', redirectToGame);
    socket.on('room_update', handleRoomUpdate);

    return () => {
      socket.off('game_started', redirectToGame);
      socket.off('game_in_progress', redirectToGame);
      socket.off('room_update', handleRoomUpdate);
    };
  }, [navigate, onCardUpdated, roomId, stake]);

  const handleCardSelect = async (cardNumber) => {
    unlockAudio();
    if (
      selectionLocked
      || loading
      || cardNumber === currentSelectedCard
      || (takenCards.includes(cardNumber) && cardNumber !== currentSelectedCard)
    ) return;

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
          <div className="mb-5 flex items-center justify-between gap-3">
            {!roomId ? (
              <button
                onClick={() => navigate('/')}
                className="font-bold text-yellow-500 hover:text-yellow-400"
              >
                ← {t('back')}
              </button>
            ) : <div className="w-12" />}
            <h1 className="text-center text-xl font-bold sm:text-2xl">
              {t('selectCard')} ({stake} ETB)
            </h1>
            <div className="w-12" />
          </div>

          {error && (
            <div className="mb-4 rounded bg-red-600 p-3 text-center text-white">
              {error}
            </div>
          )}

          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 md:grid-cols-10 md:gap-2">
            {Array.from({ length: 400 }, (_, i) => i + 1).map((cardNumber) => {
              const isSelected = currentSelectedCard === cardNumber;
              const isTaken = takenCards.includes(cardNumber) && !isSelected;
              const isDisabled = isTaken || loading || selectionLocked || (roomId && !cardData);

              return (
                <button
                  key={cardNumber}
                  type="button"
                  disabled={isDisabled}
                  aria-pressed={isSelected}
                  onClick={() => handleCardSelect(cardNumber)}
                  className={`relative flex items-center justify-center rounded-md border px-1 py-1 text-xs font-bold transition-all duration-100 touch-manipulation ${
                    isSelected
                      ? 'border-blue-700 border-b-4 bg-blue-500 text-white shadow-[0_3px_0_rgb(29,78,216)] active:translate-y-1 active:shadow-none'
                      : isTaken || selectionLocked || loading || (roomId && !cardData)
                        ? 'cursor-not-allowed border-gray-900 border-b-4 bg-gray-800 text-gray-600 opacity-60'
                        : 'border-gray-300 border-b-4 bg-white text-black shadow-[0_3px_0_rgb(156,163,175)] hover:-translate-y-0.5 hover:shadow-[0_4px_0_rgb(156,163,175)] active:translate-y-1 active:shadow-none'
                  }`}
                >
                  {cardNumber}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 z-30 h-32 w-full border-t border-gray-700 bg-[#0f172a] p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
        <div className="mx-auto flex h-full max-w-4xl gap-2">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl bg-white p-1.5 text-gray-900">
            <div className="mb-1 shrink-0 truncate text-center text-[10px] font-bold leading-3 sm:text-xs">
              {currentSelectedCard ? t('cardNo', { number: currentSelectedCard }) : t('selectCard')}
            </div>
            {currentSelectedMatrix ? (
              <div className="grid min-h-0 flex-1 grid-cols-5 grid-rows-6 gap-px">
                {['B', 'I', 'N', 'G', 'O'].map((letter) => (
                  <div key={letter} className="flex min-h-0 items-center justify-center rounded bg-blue-700 text-[8px] font-bold leading-none text-white sm:text-[10px]">
                    {letter}
                  </div>
                ))}
                {currentSelectedMatrix.flat().map((number, index) => (
                  <div
                    key={index}
                    className={`flex min-h-0 items-center justify-center rounded text-[8px] font-bold leading-none sm:text-[10px] ${
                      index === 12 || number === 'FREE' ? 'bg-blue-100 text-blue-900' : 'bg-gray-100'
                    }`}
                  >
                    {index === 12 || number === 'FREE' ? 'F' : number}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 items-center justify-center text-center text-[10px] text-gray-500">
                {roomId ? t('loadingCard') : t('selectCard')}
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-xl bg-blue-900/50 p-2 text-center">
            {playersCount < 2 ? (
              <span className="animate-pulse text-xs font-semibold leading-tight text-blue-100 sm:text-sm">
                {t('waitingPlayers')}
              </span>
            ) : hasCountdown ? (
              <>
                <span className="text-[10px] font-semibold leading-tight text-blue-100 sm:text-xs">
                  {t('countdown')}
                </span>
                <span className="mt-1 text-2xl font-black tabular-nums sm:text-4xl">
                  {formatTime(Math.max(0, Number(countdown)))}
                </span>
              </>
            ) : (
              <span className="text-xs font-semibold text-blue-100 sm:text-sm">
                {t('getReady')}
              </span>
            )}
            {loading && <span className="mt-1 text-[10px] text-blue-100">{t('loadingCard')}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
