import { useState, useCallback, useRef, useEffect } from "react";
import { GoogleMap, useJsApiLoader, Marker, Polyline } from "@react-google-maps/api";
import { MAP_CONFIG } from "../../config/constants";
import MapSearch from "./MapSearch";
import { apiFetch } from "../../config/api"; 
import { useAppStore } from "../../store";
import { darkMapStyle, lightMapStyle } from "../../config/mapStyles";

const mapContainerStyle = { width: "100%", height: "100%" };

const LIBRARIES = ["places", "geometry"];

// Helper to decode google polyline strings
const decodePolyline = (encoded) => {
  if (!window.google) return [];
  return window.google.maps.geometry.encoding.decodePath(encoded);
};

export default function MapPanel() {
  const [center, setCenter] = useState(MAP_CONFIG.FALLBACK_CENTER);
  const [currentLocation, setCurrentLocation] = useState(null); 
  const [destLocation, setDestLocation] = useState(null);       
  
  // SmartRoute State
  const [tripData, setTripData] = useState(null);             
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isConfirming, setIsConfirming] = useState(false);
  const [tripConfirmed, setTripConfirmed] = useState(false);

  const fuelLevel = useAppStore((s) => Math.round(s.fuelLevel));
  const theme = useAppStore((s) => s.theme);

  const [zoom, setZoom] = useState(MAP_CONFIG.DEFAULT_ZOOM);
  const [geoError, setGeoError] = useState(false);
  
  const mapRef = useRef(null);
  const hasCenteredRef = useRef(false);

  const mapOptions = {
    disableDefaultUI: false,
    zoomControl: true,
    streetViewControl: true,
    mapTypeControl: true,
    fullscreenControl: true,
    styles: theme === "dark" ? darkMapStyle : lightMapStyle,
  };

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
    
    setDestLocation({
      ...destLoc,
      place_id: place.place_id
    });
    setTripData(null);
    setTripConfirmed(false);
    
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
          current_fuel_level: fuelLevel
        })
      });

      // Parse polylines for each route
      if (data.routes) {
        data.routes.forEach(route => {
          let fullPath = [];
          route.polylines.forEach(encoded => {
            fullPath = fullPath.concat(decodePolyline(encoded));
          });
          route.decodedPath = fullPath;
        });
      }

      setTripData(data);
      setSelectedIndex(0);

      // Fit bounds to show the entire primary route
      if (mapRef.current && data.routes && data.routes[0].decodedPath.length > 0) {
        const bounds = new window.google.maps.LatLngBounds();
        data.routes[0].decodedPath.forEach(point => bounds.extend(point));
        mapRef.current.fitBounds(bounds, { top: 50, bottom: 50, left: 350, right: 50 }); // Leave space for side panel
      }
    } catch (error) {
      console.error("Routing failed:", error);
    }
  }, [currentLocation, fuelLevel]);

  const handleConfirmTrip = async () => {
    if (!tripData?.trip_id) return;
    
    setIsConfirming(true);
    try {
      await apiFetch(`/navigation/trips/${tripData.trip_id}/confirm`, {
        method: "POST",
        body: JSON.stringify({
          selected_route_index: selectedIndex,
          kept_stops: tripData.suggested_stops?.map(s => s.place_id) || [],
          destination_place_id: destLocation.place_id || null,
        })
      });
      setTripConfirmed(true);
    } catch (error) {
      console.error("Failed to confirm trip:", error);
    } finally {
      setIsConfirming(false);
    }
  };

  if (loadError) return <div className="map-panel"><div className="map-error">Failed to load Google Maps.</div></div>;
  if (!isLoaded) return <div className="map-panel"><div className="map-loading"><div className="spinner-small" /><span>Loading map…</span></div></div>;

  return (
    <div className="map-panel" style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <MapSearch onPlaceSelect={handlePlaceSelect} />
      
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={center}
        zoom={zoom}
        options={mapOptions}
        onLoad={onLoad}
      >
        {/* Current Location Marker */}
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
            zIndex={10}
          />
        )}

        {/* Destination Marker */}
        {destLocation && <Marker position={destLocation} zIndex={5} />}

        {/* Render Routes */}
        {tripData?.routes?.map((route, idx) => {
          const isSelected = idx === selectedIndex;
          return (
            <Polyline
              key={`route-${route.index}`}
              path={route.decodedPath}
              options={{
                strokeColor: isSelected ? "#4285F4" : "#808080",
                strokeOpacity: isSelected ? 0.9 : 0.4,
                strokeWeight: isSelected ? 6 : 4,
                zIndex: isSelected ? 3 : 1,
              }}
              onClick={() => !tripConfirmed && setSelectedIndex(idx)}
            />
          );
        })}

        {/* Render Weather Warnings */}
        {tripData?.weather_warnings?.map((w, idx) => (
          <Marker
            key={`weather-${idx}`}
            position={{ lat: w.lat, lng: w.lng }}
            title={w.message}
            icon={{
              url: `data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="%23fa5252"><path d="M12 2L1 21h22L12 2zm0 3.99L19.53 19H4.47L12 5.99zM11 16h2v2h-2zm0-6h2v4h-2z"/></svg>`,
              scaledSize: new window.google.maps.Size(32, 32),
              anchor: new window.google.maps.Point(16, 16)
            }}
            zIndex={4}
          />
        ))}

        {/* Render Fuel Stops */}
        {tripData?.suggested_stops?.map((s, idx) => (
          <Marker
            key={`stop-${idx}`}
            position={{ lat: s.lat, lng: s.lng }}
            title={`${s.name} - ${s.fuel_price || '?'} RON`}
            icon={{
              url: `data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="%2315aabf"><path d="M19.36 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.36 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.64-4.96zM19 18H6c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4v1h2v-1c0-2.21 1.79-4 4-4s4 1.79 4 4-1.79 4-4 4z"/></svg>`,
              scaledSize: new window.google.maps.Size(28, 28),
              anchor: new window.google.maps.Point(14, 14)
            }}
            zIndex={4}
          />
        ))}

      </GoogleMap>

      {/* SmartRoute Overlay Panel */}
      {tripData && (
        <div style={{
          position: "absolute", top: "80px", left: "20px", width: "320px",
          background: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(12px)", borderRadius: "16px",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)",
          display: "flex", flexDirection: "column", maxHeight: "calc(100% - 100px)",
          overflow: "hidden", border: "1px solid rgba(0,0,0,0.05)", zIndex: 10
        }}>
          {/* Header */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #e9ecef", background: "#f8f9fa" }}>
            <h3 style={{ margin: 0, fontSize: "1.1rem", color: "#212529" }}>Route Options</h3>
            <p style={{ margin: "4px 0 0 0", fontSize: "0.85rem", color: "#868e96" }}>
              {tripData.destination_address || "Custom Destination"}
            </p>
          </div>

          {/* Route List */}
          <div style={{ overflowY: "auto", padding: "8px 0" }}>
            {tripData.routes.map((route, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div 
                  key={idx} 
                  onClick={() => !tripConfirmed && setSelectedIndex(idx)}
                  style={{
                    padding: "16px 20px", cursor: tripConfirmed ? "default" : "pointer",
                    borderLeft: `4px solid ${isSelected ? "#4285F4" : "transparent"}`,
                    background: isSelected ? "rgba(66, 133, 244, 0.05)" : "transparent",
                    transition: "all 0.2s ease"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <strong style={{ fontSize: "1.1rem", color: isSelected ? "#4285F4" : "#212529" }}>
                      {route.duration_text}
                    </strong>
                    <span style={{ fontSize: "0.9rem", color: "#495057", fontWeight: "500" }}>
                      {route.distance_text}
                    </span>
                  </div>
                  
                  <p style={{ margin: "0 0 8px 0", fontSize: "0.85rem", color: "#495057", lineHeight: "1.4" }}>
                    {route.explanation}
                  </p>
                  
                  {/* Score Pills */}
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    <span style={{ background: "#e7f5ff", color: "#1c7ed6", fontSize: "0.75rem", padding: "2px 6px", borderRadius: "4px", fontWeight: "600" }}>
                      Utility: {(route.scores.utility * 100).toFixed(0)}%
                    </span>
                    {route.scores.weather_risk > 0.3 && (
                      <span style={{ background: "#fff5f5", color: "#fa5252", fontSize: "0.75rem", padding: "2px 6px", borderRadius: "4px", fontWeight: "600" }}>
                        Weather Risk
                      </span>
                    )}
                    {route.labels.includes("FUEL_EFFICIENT") && (
                      <span style={{ background: "#ebfbee", color: "#2b8a3e", fontSize: "0.75rem", padding: "2px 6px", borderRadius: "4px", fontWeight: "600" }}>
                        Eco
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Footer */}
          <div style={{ padding: "16px 20px", borderTop: "1px solid #e9ecef", background: "#f8f9fa" }}>
            <button
              onClick={handleConfirmTrip}
              disabled={tripConfirmed || isConfirming}
              style={{
                width: "100%", padding: "12px", borderRadius: "8px", border: "none",
                background: tripConfirmed ? "#40c057" : "#4285F4", 
                color: "white", fontSize: "1rem", fontWeight: "600",
                cursor: (tripConfirmed || isConfirming) ? "not-allowed" : "pointer",
                transition: "background 0.2s"
              }}
            >
              {isConfirming ? "Confirming..." : tripConfirmed ? "Trip Confirmed ✓" : "Start Navigation"}
            </button>
            
            {tripData.suggested_stops?.length > 0 && (
              <p style={{ margin: "12px 0 0 0", fontSize: "0.8rem", color: "#868e96", textAlign: "center" }}>
                Includes {tripData.suggested_stops.length} planned stop(s)
              </p>
            )}
          </div>
        </div>
      )}

      {geoError && <div className="map-geo-notice">Location access denied</div>}
    </div>
  );
}
