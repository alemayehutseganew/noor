import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchApi } from '../services/api';
import { unlockAudio } from '../utils/bingoSounds';

export default function CardSelection() {
  const [searchParams] = useSearchParams();
  const stake = searchParams.get('stake') || '10';
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [takenCards, setTakenCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    if (takenCards.includes(cardNumber)) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetchApi('/rooms/join', {
        method: 'POST',
        body: JSON.stringify({
          stake: Number(stake),
          card_number: cardNumber,
          userId: localStorage.getItem('dbUserId'),
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

      navigate(`/game?roomId=${data.roomId}&stake=${stake}`);
    } catch (err) {
      setError(err.message);
      setLoading(false);
      if (err.message.includes('taken')) {
        setTakenCards((prev) => [...prev, cardNumber]);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={() => navigate('/')}
            className="text-yellow-500 hover:text-yellow-400 font-bold"
          >
            ← {t('back')}
          </button>
          <h1 className="text-2xl font-bold">{t('selectCard')} ({stake} ETB)</h1>
          <div className="w-12"></div>
        </div>

        {error && (
          <div className="bg-red-600 text-white p-3 rounded mb-4 text-center">
            {error}
          </div>
        )}

        <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2 md:gap-3 pb-10">
          {Array.from({ length: 400 }, (_, i) => i + 1).map((cardNumber) => {
            const isTaken = takenCards.includes(cardNumber);
            return (
              <button
                key={cardNumber}
                disabled={isTaken || loading}
                onClick={() => handleCardSelect(cardNumber)}
                className={`
                  relative flex items-center justify-center py-2 rounded-lg font-bold text-sm transition-all duration-150 ease-in-out
                  ${isTaken
                    ? 'bg-gray-800 text-gray-600 border-b-4 border-gray-900 cursor-not-allowed opacity-60'
                    : 'bg-white text-black shadow-md border-b-4 border-gray-300 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-1 active:border-b-0 active:mb-1'
                  }
                `}
              >
                {cardNumber}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
