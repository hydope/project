import { useState, useEffect } from 'react';
import { useToast } from '../lib/useToast';

export default function IslamicCalendar() {
  const [islamicDate, setIslamicDate] = useState(null);
  const [prayerTimes, setPrayerTimes] = useState(null);
  const [qiblaDirection, setQiblaDirection] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [location, setLocation] = useState(null); // { latitude, longitude }
  const [locationError] = useState(null);
  void locationError;
  const [refreshing, setRefreshing] = useState(false);

  const fetchIslamicData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Get user's location if we don't have it cached
      let lat, lon;
      if (!location) {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          });
        });
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
        setLocation({ latitude: lat, longitude: lon });
      } else {
        lat = location.latitude;
        lon = location.longitude;
      }

      // Fetch Islamic date (this doesn't require location)
      const dateRes = await fetch(`https://api.aladhan.com/v1/gToH?date=${new Date().toISOString().split('T')[0]}`);
      const dateData = await dateRes.json();

      // Fetch prayer times using coordinates
      const timesRes = await fetch(`https://api.aladhan.com/v1/timings/${lat},${lon}?method=8`); // Method 8 for Shia Ithna Asheri
      const timesData = await timesRes.json();

      // Calculate Qibla direction using coordinates
      const qiblaRes = await fetch(`https://api.aladhan.com/v1/qibla/${lat},${lon}`);
      const qiblaData = await qiblaRes.json();

      setIslamicDate(dateData.data);
      setPrayerTimes(timesData.data.timings);
      setQiblaDirection(qiblaData.data.direction);
      setIsLoading(false);

      // Cache the data
      const cacheData = {
        islamicDate: dateData.data,
        prayerTimes: timesData.data.timings,
        qiblaDirection: qiblaData.data.direction,
        timestamp: Date.now()
      };
      localStorage.setItem('islamicCalendarData', JSON.stringify(cacheData));
    } catch (err) {
      console.error('Error fetching Islamic data:', err);
      setError('Failed to load Islamic calendar data');
      setIsLoading(false);

      // Try to load cached data as fallback even if expired
      const cached = localStorage.getItem('islamicCalendarData');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          setIslamicDate(parsed.islamicDate);
          setPrayerTimes(parsed.prayerTimes);
          setQiblaDirection(parsed.qiblaDirection);
          setIsLoading(false);
          setError(null); // Clear error since we have cached data
        } catch (e) {
          console.warn('Failed to load cached data as fallback:', e);
        }
      }
    }
  };

  useEffect(() => {
    // Try to load cached data
    const loadCachedData = () => {
      try {
        const cached = localStorage.getItem('islamicCalendarData');
        if (cached) {
          const parsed = JSON.parse(cached);
          const now = Date.now();
          if (now - parsed.timestamp < 24 * 60 * 60 * 1000) { // 24 hours
            setIslamicDate(parsed.islamicDate);
            setPrayerTimes(parsed.prayerTimes);
            setQiblaDirection(parsed.qiblaDirection);
            setIsLoading(false);
            return true;
          }
        }
      } catch (e) {
        console.warn('Failed to load cached Islamic calendar data:', e);
      }
      return false;
    };

    if (loadCachedData()) {
      // If we have cached data, we still want to update in background if stale
      // but we'll set a timeout to refresh after a short delay
      setTimeout(() => {
        fetchIslamicData();
      }, 30000); // Refresh after 30 seconds if we had cache
      return;
    }

    // No valid cache, fetch new data
    fetchIslamicData();
  }, []);


  // Update prayer times daily (at a random time to avoid thundering herd)
  useEffect(() => {
    const interval = setInterval(fetchIslamicData, 24 * 60 * 60 * 1000); // 24 hours
    return () => clearInterval(interval);
  }, []);

  const formatIslamicDate = (dateObj) => {
    if (!dateObj) return null;
    const months = ["Muharram", "Safar", "Rabi' al-awwal", "Rabi' al-thani", "Jumada al-awwal", "Jumada al-thani", "Rajab", "Sha'ban", "Ramadan", "Shawwal", "Dhu al-Qi'dah", "Dhu al-Hijjah"];
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const gregorianDate = new Date();
    const dayName = days[gregorianDate.getDay()];
    return `${dayName}, ${dateObj.day} ${months[dateObj.month - 1]} ${dateObj.year} AH`;
  };

  const getNextPrayer = (times) => {
    if (!times) return null;
    const now = new Date();
    const prayers = [
      { name: 'Fajr', time: times.Fajr },
      { name: 'Sunrise', time: times.Sunrise },
      { name: 'Dhuhr', time: times.Dhuhr },
      { name: 'Asr', time: times.Asr },
      { name: 'Maghrib', time: times.Maghrib },
      { name: 'Isha', time: times.Isha }
    ];

    for (const prayer of prayers) {
      const [hours, minutes] = prayer.time.split(':').map(Number);
      const prayerTime = new Date();
      prayerTime.setHours(hours, minutes, 0, 0);

      if (prayerTime > now) {
        return prayer;
      }
    }

    // If no prayer found today, return Fajr for tomorrow
    return { name: 'Fajr', time: times.Fajr };
  };

  const isFriday = () => {
    const gregorianDate = new Date();
    return gregorianDate.getDay() === 5; // 5 is Friday (0=Sunday, 1=Monday, ..., 5=Friday, 6=Saturday)
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchIslamicData();
    } finally {
      setRefreshing(false);
    }
  };

  const { addToast } = useToast();

  if (isLoading) {
    return (
      <div className="text-center py-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
        <p className="text-xs text-muted">Loading Islamic calendar...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="inline-flex items-center gap-2 text-xs text-muted bg-elevated/60 backdrop-blur rounded-lg px-3 py-1.5 border border-line/20">
        <span className="text-line/50">☪️</span>
        <span>Calendar unavailable</span>
      </div>
    );
  }

  const nextPrayer = getNextPrayer(prayerTimes);
  const isFridayToday = isFriday();

  return (
    <div className="bg-elevated/70 backdrop-blur rounded-xl p-4 border border-line/20 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer"
         onClick={() => addToast('Opening Islamic calendar details...', 'info')}
    >
      <div className="flex items-center space-x-3">
        <div className="flex-shrink-0">
          <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <span className="text-line/40">{isFridayToday ? '🕋' : '☪️'}</span>
          </div>
        </div>
        <div className="flex-1">
          <p className="text-xs font-medium text-ink">{isFridayToday ? 'Jumu\'ah Mubarak!' : 'Today'}</p>
          <p className="text-sm font-semibold text-ink">{formatIslamicDate(islamicDate)}</p>
          {nextPrayer && (
            <div className="flex items-center space-x-2 mt-1">
              <div className="h-2 w-2 rounded-full bg-primary"></div>
              <span className="text-xs text-muted">
                Next: {nextPrayer.name} ({nextPrayer.time.split(':')[0]}:{nextPrayer.time.split(':')[1]})
              </span>
            </div>
          )}
        </div>
        <div className="flex-shrink-0">
          {qiblaDirection !== null && (
            <div className="flex items-center space-x-1 text-xs">
              <span className="text-line/40">⭘</span>
              <span className="font-medium">{Math.round(qiblaDirection)}°</span>
            </div>
          )}
          {!locationError && (
            <button
              onClick={handleRefresh}
              className="ml-2 h-6 w-6 rounded-lg bg-primary/20 flex items-center justify-center text-xs hover:bg-primary/30 transition-all duration-200"
              disabled={refreshing}
            >
              {refreshing ? (
                <div className="animate-spin h-3 w-3 text-white"/>
              ) : (
                <span className="text-line/40">🔄</span>
              )}
            </button>
          )}
          {locationError && (
            <span className="ml-2 text-xs text-danger">{locationError}</span>
          )}
        </div>
      </div>

      {/* Tooltip/Details on hover */}
      <div className="mt-3 pt-2 border-t border-line/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <div className="space-y-1 text-xs">
          <p className="text-muted">Hijri Date</p>
          <p className="text-sm font-semibold text-ink">{formatIslamicDate(islamicDate)}</p>

          <p className="text-muted mt-1">Prayer Times</p>
          <div className="space-y-0">
            {Object.keys(prayerTimes || {}).map((prayer, index) => (
              <div key={index} className="flex justify-between">
                <span className="text-line/40">{prayer}</span>
                <span className="text-line/40">{prayerTimes[prayer]}</span>
              </div>
            ))}
          </div>

          {islamicDate && islamicDate.month === 9 && (
            <div className="mt-2">
              <p className="text-muted">Ramadan</p>
              <p className="text-sm font-semibold text-primary">
                {30 - islamicDate.day} days left
              </p>
            </div>
          )}

          {isFridayToday && (
            <div className="mt-2">
              <p className="text-muted">Jumu'ah (Friday)</p>
              <p className="text-sm font-semibold text-primary">
                Blessed day for congregational prayer
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}