import { useRef, useState, useCallback } from "react";
import { Autocomplete } from "@react-google-maps/api";
import { Search, X } from "lucide-react";

export default function MapSearch({ onPlaceSelect }) {
  const [query, setQuery] = useState("");
  const autocompleteRef = useRef(null);

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
      <Search size={16} className="map-search-icon" />
      <Autocomplete
        onLoad={onLoad}
        onPlaceChanged={onPlaceChanged}
        options={{
          fields: ["geometry", "formatted_address", "name"],
        }}
      >
        <input
          id="map-search-input"
          type="text"
          className="map-search-input"
          placeholder="Search a destination…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </Autocomplete>
      {query && (
        <button className="map-search-clear" onClick={handleClear} aria-label="Clear search">
          <X size={14} />
        </button>
      )}
    </div>
  );
}
