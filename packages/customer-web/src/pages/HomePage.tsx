import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Lot } from '@parking/shared';
import { apiFetch } from '../api/client';
import { geocode } from '../api/geocode';
import { useGeolocation } from '../hooks/useGeolocation';
import { LotMap, type MapPoint } from '../components/LotMap';
import { LotList } from '../components/LotList';
import { SearchBar } from '../components/SearchBar';

const CHICAGO_LOOP: MapPoint = { lat: 41.8781, lng: -87.6298 };

export function HomePage() {
  const geolocation = useGeolocation();
  const [searchPoint, setSearchPoint] = useState<MapPoint | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);

  const origin: MapPoint =
    searchPoint ?? (geolocation.status === 'granted' ? geolocation.coords! : CHICAGO_LOOP);

  const lotsQuery = useQuery({
    queryKey: ['lots', origin.lat, origin.lng],
    queryFn: () => apiFetch<Lot[]>(`/api/lots?lat=${origin.lat}&lng=${origin.lng}`),
  });

  async function handleSearch(query: string) {
    setSearchError(null);
    if (query.trim() === '') {
      return;
    }

    setIsGeocoding(true);
    try {
      const result = await geocode(query);
      if (result) {
        setSearchPoint({ lat: result.lat, lng: result.lng });
      } else {
        setSearchError(`No results for "${query}".`);
      }
    } catch {
      setSearchError('Could not search right now. Try again.');
    } finally {
      setIsGeocoding(false);
    }
  }

  const showSearchPrompt = geolocation.status === 'denied' && !searchPoint;

  return (
    <div className="home-page">
      <header className="home-header">
        <h1>Park N Stuff</h1>
      </header>

      <div className="map-shell">
        <div className="search-bar-floating">
          <SearchBar onSearch={handleSearch} isSearching={isGeocoding} />
        </div>
        <LotMap center={origin} lots={lotsQuery.data ?? []} />
      </div>

      {searchError && (
        <p className="search-error" role="alert">
          {searchError}
        </p>
      )}
      {showSearchPrompt && (
        <p className="search-prompt">
          Turn on location, or search for an address, to find parking near you.
        </p>
      )}

      <main className="lot-results">
        <h2 className="lot-results-heading">Parking near you</h2>
        {lotsQuery.isLoading && (
          <div className="skeleton-list" aria-hidden="true">
            <div className="skeleton skeleton-lot-card" />
            <div className="skeleton skeleton-lot-card" />
            <div className="skeleton skeleton-lot-card" />
          </div>
        )}
        {lotsQuery.isLoading && <span className="sr-only" role="status">Loading lots…</span>}
        {lotsQuery.isError && (
          <p role="alert">Could not load parking lots. Try again.</p>
        )}
        {lotsQuery.data && <LotList lots={lotsQuery.data} />}
      </main>
    </div>
  );
}
