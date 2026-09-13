import { useState, useCallback, useRef, useEffect } from "react";
import { GoogleMap, useJsApiLoader, Marker } from "@react-google-maps/api";
import { MAP_CONFIG } from "../../config/constants";
import MapSearch from "./MapSearch";

const mapContainerStyle = { width: "100%", height: "100%" };

const mapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: true,
  styles: [
    {
      featureType: "poi",
      elementType: "labels",
      stylers: [{ visibility: "off" }],
    },
  ],
};

const LIBRARIES = ["places"];

export default function MapPanel() {
  const [center, setCenter] = useState(MAP_CONFIG.FALLBACK_CENTER);
  const [markerPos, setMarkerPos] = useState(null);
  const [zoom, setZoom] = useState(MAP_CONFIG.DEFAULT_ZOOM);
  const [geoError, setGeoError] = useState(false);
  const mapRef = useRef(null);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: LIBRARIES,
  });

  // Get user's current live location and track it
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError(true);
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCenter(loc);
        setMarkerPos(loc);
      },
      () => {
        setGeoError(true);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    // Clean up the watcher when the component unmounts
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const onLoad = useCallback((map) => {
    mapRef.current = map;
  }, []);

  const handlePlaceSelect = useCallback((place) => {
    if (!place?.geometry?.location) return;
    const loc = {
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng(),
    };
    setCenter(loc);
    setMarkerPos(loc);
    setZoom(MAP_CONFIG.SEARCH_ZOOM);
    mapRef.current?.panTo(loc);
  }, []);

  const handleMapClick = useCallback((e) => {
    const loc = { lat: e.latLng.lat(), lng: e.latLng.lng() };
    setMarkerPos(loc);
  }, []);

  if (loadError) {
    return (
      <div className="map-panel">
        <div className="map-error">
          <p>Failed to load Google Maps.</p>
          <p className="text-muted">Check your VITE_GOOGLE_MAPS_API_KEY in .env</p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="map-panel">
        <div className="map-loading">
          <div className="spinner-small" />
          <span>Loading map…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="map-panel">
      <MapSearch onPlaceSelect={handlePlaceSelect} />
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={center}
        zoom={zoom}
        options={mapOptions}
        onLoad={onLoad}
        onClick={handleMapClick}
      >
        {markerPos && (
          <Marker 
            position={markerPos} 
            icon={{
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: "#4285F4",
              fillOpacity: 1,
              strokeWeight: 2,
              strokeColor: "#ffffff",
            }}
          />
        )}
      </GoogleMap>
      {geoError && (
        <div className="map-geo-notice">
          Location access denied — showing default location
        </div>
      )}
    </div>
  );
}
