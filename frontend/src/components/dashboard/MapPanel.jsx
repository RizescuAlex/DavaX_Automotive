import { useState, useCallback, useRef, useEffect } from "react";
import { GoogleMap, useJsApiLoader, Marker } from "@react-google-maps/api";
import { MAP_CONFIG } from "../../config/constants";
import MapSearch from "./MapSearch";
import { apiFetch } from "../../config/api"; 

const mapContainerStyle = { width: "100%", height: "100%" };
/* Dark map styling tuned to the "Stormy morning" palette, so the map reads as
   part of the cockpit rather than a bright rectangle punched through it. */
const MAP_STYLE_DARK = [
  { elementType: "geometry", stylers: [{ color: "#2b3744" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#a8c0d6" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#222c36" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#526c85" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#31404e" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#2f4741" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#6fd3a3" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#3f5264" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#2b3744" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#bdddfc" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#546f8a" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#222c36" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#3a4c5e" }] },
  { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#a8c0d6" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#1f2a35" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#6a89a7" }] },
];

const mapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: false,
  styles: MAP_STYLE_DARK,
};

const LIBRARIES = ["places", "geometry"];

export default function MapPanel() {
  const [center, setCenter] = useState(MAP_CONFIG.FALLBACK_CENTER);
  const [currentLocation, setCurrentLocation] = useState(null); 
  const [destLocation, setDestLocation] = useState(null);       
  const [routeData, setRouteData] = useState(null);             
  
  const [zoom, setZoom] = useState(MAP_CONFIG.DEFAULT_ZOOM);
  const [geoError, setGeoError] = useState(false);
  
  const mapRef = useRef(null);
  const hasCenteredRef = useRef(false);
  const polylineRef = useRef(null);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: LIBRARIES,
  });

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError(true);
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCurrentLocation(loc);
        
        if (!hasCenteredRef.current) {
          setCenter(loc);
          hasCenteredRef.current = true;
        }
      },
      () => setGeoError(true),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const onLoad = useCallback((map) => {
    mapRef.current = map;
  }, []);

  const handlePlaceSelect = useCallback(async (place) => {
    if (!place?.geometry?.location) return;
    
    const destLoc = {
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng(),
    };
    setDestLocation(destLoc);
    
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }
    
    if (!currentLocation) {
      setCenter(destLoc);
      mapRef.current?.panTo(destLoc);
      return;
    }

    try {
      const data = await apiFetch("/navigation/route", {
        method: "POST",
        body: JSON.stringify({
          origin_lat: currentLocation.lat,
          origin_lng: currentLocation.lng,
          dest_lat: destLoc.lat,
          dest_lng: destLoc.lng,
        })
      });

      let fullPath = [];
      if (data.polylines) {
        data.polylines.forEach(encoded => {
          const decoded = window.google.maps.geometry.encoding.decodePath(encoded);
          fullPath = fullPath.concat(decoded);
        });
      }
      
      polylineRef.current = new window.google.maps.Polyline({
        path: fullPath,
        strokeColor: "#88bdf2",
        strokeOpacity: 0.9,
        strokeWeight: 6,
        map: mapRef.current
      });
      
      setRouteData({
        distance: data.distance_text,
        duration: data.duration_text,
        address: data.destination_address
      });

      if (mapRef.current) {
        const bounds = new window.google.maps.LatLngBounds();
        bounds.extend(currentLocation);
        bounds.extend(destLoc);
        mapRef.current.fitBounds(bounds);
      }
    } catch (error) {
      console.error("Routing failed:", error);
    }
  }, [currentLocation]);

  const handleMapClick = useCallback((e) => {
  }, []);

  if (loadError) return <div className="map-panel"><div className="map-error">Failed to load Google Maps.</div></div>;
  if (!isLoaded) return <div className="map-panel"><div className="map-loading"><div className="spinner-small" /><span>Loading map…</span></div></div>;

  return (
    <div className="map-panel" style={{ position: "relative", width: "100%", height: "100%" }}>
      <MapSearch onPlaceSelect={handlePlaceSelect} />
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={center}
        zoom={zoom}
        options={mapOptions}
        onLoad={onLoad}
        onClick={handleMapClick}
      >
        {currentLocation && (
          <Marker 
            position={currentLocation} 
            icon={{
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: "#88bdf2",
              fillOpacity: 1,
              strokeWeight: 2,
              strokeColor: "#16212b",
            }}
            zIndex={2}
          />
        )}

        {destLocation && <Marker position={destLocation} />}

      </GoogleMap>

      {routeData && (
        <div style={{
          position: "absolute", bottom: "30px", left: "50%", transform: "translateX(-50%)",
          background: "var(--surface-primary)", padding: "14px 28px", borderRadius: "30px",
          color: "var(--text-primary)", display: "flex", gap: "24px", fontWeight: "600",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)", backdropFilter: "blur(12px)",
          border: "1px solid var(--border-default)", zIndex: 10
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "1.2rem" }}>🚗</span> {routeData.duration}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "1.2rem" }}>📏</span> {routeData.distance}
          </div>
        </div>
      )}
      
      {geoError && <div className="map-geo-notice">Location access denied</div>}
    </div>
  );
}
