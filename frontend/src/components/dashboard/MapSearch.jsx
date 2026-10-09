import { useRef, useState, useCallback, useEffect } from "react";
import { Autocomplete } from "@react-google-maps/api";
import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";

export default function MapSearch({ onPlaceSelect, resetKey = 0 }) {
  const [query, setQuery] = useState("");
  const autocompleteRef = useRef(null);

  useEffect(() => {
    setQuery("");
  }, [resetKey]);

  const onLoad = useCallback((autocomplete) => {
    autocompleteRef.current = autocomplete;
  }, []);

  const onPlaceChanged = useCallback(() => {
    const place = autocompleteRef.current?.getPlace();
    if (place) {
      setQuery(place.formatted_address || place.name || "");
      onPlaceSelect(place);
    }
  }, [onPlaceSelect]);

  const handleClear = () => {
    setQuery("");
  };

  return (
    <div className="map-search">
      <MagnifyingGlassIcon size={16} className="map-search-icon" />
      <Autocomplete
        onLoad={onLoad}
        onPlaceChanged={onPlaceChanged}
        options={{
          fields: ["geometry", "formatted_address", "name", "place_id"],
        }}
      >
        <input
          id="map-search-input"
          type="text"
          className="map-search-input"
          aria-label="Search for a destination"
          placeholder="Search a destination…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </Autocomplete>
      {query && (
        <button className="map-search-clear" onClick={handleClear} aria-label="Clear search">
          <XIcon size={14} />
        </button>
      )}
    </div>
  );
}
