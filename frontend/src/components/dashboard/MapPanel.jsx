import { useState, useCallback, useRef, useEffect } from "react";
import { GoogleMap, useJsApiLoader, Marker } from "@react-google-maps/api";
import { MAP_CONFIG } from "../../config/constants";
import MapSearch from "./MapSearch";
import { apiFetch } from "../../config/api"; 

const mapContainerStyle = { width: "100%", height: "100%" };
const mapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  streetViewControl: true,
  mapTypeControl: true,
  fullscreenControl: true,
  styles: [
    {
      featureType: "poi",
      elementType: "labels",
      stylers: [{ visibility: "off" }],
    },
  ],
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
        strokeColor: "#4285F4",
        strokeOpacity: 0.8,
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
              fillColor: "#4285F4",
              fillOpacity: 1,
              strokeWeight: 2,
              strokeColor: "#ffffff",
            }}
            zIndex={2}
          />
        )}

        {destLocation && <Marker position={destLocation} />}

      </GoogleMap>

      {routeData && (
        <div style={{
          position: "absolute", bottom: "30px", left: "50%", transform: "translateX(-50%)",
          background: "rgba(10, 10, 15, 0.85)", padding: "14px 28px", borderRadius: "30px",
          color: "white", display: "flex", gap: "24px", fontWeight: "600",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)", backdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.1)", zIndex: 10
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
