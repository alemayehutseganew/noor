import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchApi } from '../services/api';
import { unlockAudio } from '../utils/bingoSounds';

const formatTime = (seconds) => {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainingSeconds = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
};

export default function CardSelection({
  countdown = null,
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
      setSelectedCard(previousCard);
      setSelectedMatrix(previousMatrix);
      setError(err.message);
      if (err.message.toLowerCase().includes('taken')) {
        setTakenCards((prev) => [...prev, cardNumber]);
      }
    } finally {
      setLoading(false);
    }
  };

  const hasCountdown = countdown !== null && countdown !== undefined;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#0f172a] text-white">
      <div className="flex-1 overflow-y-auto p-4 pb-48">
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

          <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-10 md:gap-3">
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
                  className={`relative flex items-center justify-center rounded-lg border-b-4 py-2 text-sm font-bold transition-all ${
                    isSelected
                      ? 'border-blue-700 bg-blue-500 text-white'
                      : isTaken || selectionLocked || loading || (roomId && !cardData)
                        ? 'cursor-not-allowed border-gray-900 bg-gray-800 text-gray-600 opacity-60'
                        : 'border-gray-300 bg-white text-black shadow-md hover:-translate-y-0.5 hover:shadow-lg active:translate-y-1'
                  }`}
                >
                  {cardNumber}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 z-30 w-full border-t border-gray-700 bg-[#0f172a] p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:p-4">
        <div className="mx-auto flex max-w-4xl gap-3 sm:gap-4">
          <div className="min-w-0 flex-1 rounded-xl bg-white p-2 text-gray-900">
            <div className="mb-1 truncate text-center text-xs font-bold sm:text-sm">
              {currentSelectedCard ? t('cardNo', { number: currentSelectedCard }) : t('selectCard')}
            </div>
            {currentSelectedMatrix ? (
              <div className="grid grid-cols-5 gap-0.5">
                {['B', 'I', 'N', 'G', 'O'].map((letter) => (
                  <div key={letter} className="rounded bg-blue-700 py-0.5 text-center text-[9px] font-bold text-white sm:text-xs">
                    {letter}
                  </div>
                ))}
                {currentSelectedMatrix.flat().map((number, index) => (
                  <div
                    key={index}
                    className={`flex aspect-square items-center justify-center rounded text-[9px] font-bold sm:text-xs ${
                      index === 12 || number === 'FREE' ? 'bg-blue-100 text-blue-900' : 'bg-gray-100'
                    }`}
                  >
                    {index === 12 || number === 'FREE' ? 'F' : number}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex min-h-20 items-center justify-center text-center text-xs text-gray-500">
                {roomId ? t('loadingCard') : t('selectCard')}
              </div>
            )}
          </div>

          <div className="flex flex-1 flex-col items-center justify-center rounded-xl bg-blue-900/50 p-2 text-center">
            <span className="text-xs font-semibold text-blue-100">
              {hasCountdown ? t('countdown') : t('pleaseWait')}
            </span>
            <span className="mt-1 text-2xl font-black tabular-nums sm:text-4xl">
              {hasCountdown ? formatTime(Math.max(0, Number(countdown))) : '--:--'}
            </span>
            {loading && <span className="mt-1 text-[10px] text-blue-100">{t('loadingCard')}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
