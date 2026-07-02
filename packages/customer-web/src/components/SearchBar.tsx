import { useState, type FormEvent } from 'react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  isSearching?: boolean;
}

/**
 * Submit-only search (Enter or the button) — geocoding hits the public
 * Nominatim API, which rate-limits per client, so we never fire on
 * keystrokes.
 */
export function SearchBar({ onSearch, isSearching = false }: SearchBarProps) {
  const [query, setQuery] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearch(query);
  }

  return (
    <form className="search-bar" role="search" onSubmit={handleSubmit}>
      <input
        type="search"
        className="search-bar-input"
        placeholder="Search by address or neighborhood"
        aria-label="Search for parking near an address"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <button type="submit" className="search-bar-button" disabled={isSearching}>
        {isSearching ? 'Searching…' : 'Search'}
      </button>
    </form>
  );
}
