import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  GoogleMap,
  useJsApiLoader,
  Marker,
} from "@react-google-maps/api";
import { destinationIcon, fuelStopIcon, weatherIcon } from "./mapMarkers";
import {
  ClockIcon,
  GasPumpIcon,
  PathIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react";
import { MAP_CONFIG } from "../../config/constants";
import MapSearch from "./MapSearch";
import { apiFetch } from "../../config/api";
import { useAppStore } from "../../store";
import {
  advanceTurnSignal,
  detectRouteTurns,
} from "../../utils/routeManeuvers";
import {
  shouldShowFuelStopWarning,
} from "../../utils/fuelStopPrompt";

function token(name) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

const mapContainerStyle = { width: "100%", height: "100%" };
const LIBRARIES = ["places", "geometry"];

const FALLBACK_LOCATION =
  MAP_CONFIG.FALLBACK_CENTER ??
  MAP_CONFIG.ENDAVA_HEADQUARTERS ??
  { lat: 44.4135, lng: 26.1132 };

const BASE_MAP_OPTIONS = {
  disableDefaultUI: false,
  zoomControl: true,
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: false,
  gestureHandling: "auto",
  keyboardShortcuts: true,
};

const DRIVING = {
  SPEED: 14,
  ZOOM: 19,
  TILT: 67.5,
  LOOK_AHEAD: 25,
};

export default function MapPanel() {
  const theme = useAppStore((s) => s.theme);
  const fuelLevel = useAppStore((s) => s.fuelLevel);
  const consumeFuelForDistance = useAppStore((s) => s.consumeFuelForDistance);
  const setAutomaticTurnSignal = useAppStore((s) => s.setAutomaticTurnSignal);

  const [center, setCenter] = useState(FALLBACK_LOCATION);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [destLocation, setDestLocation] = useState(null);
  const [tripData, setTripData] = useState(null);
  const [plannedStops, setPlannedStops] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isRouting, setIsRouting] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [tripConfirmed, setTripConfirmed] = useState(false);
  const [isDriving, setIsDriving] = useState(false);
  const [mapInstance, setMapInstance] = useState(null);
  const [geoError, setGeoError] = useState(false);
  const [navigationError, setNavigationError] = useState("");
  const [searchResetKey, setSearchResetKey] = useState(0);
  const [isFindingFuelStop, setIsFindingFuelStop] = useState(false);
  const [showFuelStopWarning, setShowFuelStopWarning] = useState(false);

  const mapRef = useRef(null);
  const carMarkerRef = useRef(null);
  const routePolylinesRef = useRef(new Set());
  const drivingPolylineRef = useRef(null);
  const animationFrameRef = useRef(null);
  const savedCameraRef = useRef(null);
  const drivingRef = useRef(false);
  const hasCenteredRef = useRef(false);
  const routeRequestRef = useRef(0);
  const latestLocationRef = useRef(null);
  const simulatedPositionRef = useRef(null);
  const drivingElapsedSecondsRef = useRef(0);
  const fuelLevelRef = useRef(fuelLevel);
  const fuelStopWarningRef = useRef(false);
  const gasStopLookupControllerRef = useRef(null);
  const routeProgressRef = useRef(0);
  const fuelConsumedThroughRef = useRef(0);
  const autoStartAfterRouteRef = useRef(false);

  const selectedRoute = tripData?.routes?.[selectedIndex] ?? null;
  const routeData = useMemo(() => {
    if (!selectedRoute) return null;
    return {
      ...selectedRoute,
      path: selectedRoute.decodedPath ?? [],
      distance: selectedRoute.distance_text,
      duration: selectedRoute.duration_text,
      maneuvers: selectedRoute.maneuvers ?? [],
      suggested_stops: selectedRoute.suggested_stops ?? tripData?.suggested_stops ?? [],
    };
  }, [selectedRoute, tripData]);


  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: LIBRARIES,
    version: "weekly",
  });

  const mapOptions = useMemo(() => {
    if (!isLoaded) return BASE_MAP_OPTIONS;

    const maps = window.google.maps;
    const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID;

    return {
      ...BASE_MAP_OPTIONS,
      renderingType: maps.RenderingType.VECTOR,
      colorScheme:
        theme === "light"
          ? maps.ColorScheme.LIGHT
          : maps.ColorScheme.DARK,
      ...(mapId ? { mapId } : {}),
    };
  }, [isLoaded, theme]);

  const polylineOptions = useMemo(() => {
    if (!isLoaded) return {};

    return {
      strokeColor: token("--accent-primary"),
      strokeOpacity: 0.9,
      strokeWeight: 6,
      clickable: false,
    };
  }, [isLoaded, theme]);

  const stopDrivingSimulation = useCallback((restoreCamera = true) => {
    drivingRef.current = false;
    setAutomaticTurnSignal(null);
    const remainingFuelDistance = Math.max(
      0,
      routeProgressRef.current - fuelConsumedThroughRef.current
    );
    if (remainingFuelDistance > 0) {
      consumeFuelForDistance(remainingFuelDistance);
    }
    fuelConsumedThroughRef.current = routeProgressRef.current;
    drivingElapsedSecondsRef.current = 0;
    routeProgressRef.current = 0;
    fuelStopWarningRef.current = false;
    setShowFuelStopWarning(false);
    gasStopLookupControllerRef.current?.abort();
    gasStopLookupControllerRef.current = null;
    setIsFindingFuelStop(false);

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (carMarkerRef.current) {
      carMarkerRef.current.setMap(null);
      carMarkerRef.current = null;
    }

    if (drivingPolylineRef.current) {
      drivingPolylineRef.current.setPath([]);
      drivingPolylineRef.current.setMap(null);
      drivingPolylineRef.current = null;
    }

    const map = mapRef.current;

    if (map) {
      map.setOptions({
        gestureHandling: "auto",
        keyboardShortcuts: true,
        zoomControl: true,
      });

      if (restoreCamera && savedCameraRef.current) {
        map.moveCamera(savedCameraRef.current);
      }
    }

    savedCameraRef.current = null;
    setIsDriving(false);
  }, [consumeFuelForDistance, setAutomaticTurnSignal]);

  const clearRoutePolylines = useCallback(() => {
    routePolylinesRef.current.forEach((polyline) => {
      polyline.setPath([]);
      polyline.setMap(null);
    });
    routePolylinesRef.current.clear();

    if (drivingPolylineRef.current) {
      drivingPolylineRef.current.setPath([]);
      drivingPolylineRef.current.setMap(null);
      drivingPolylineRef.current = null;
    }
  }, []);

  // Keep explicit ownership of Google Maps overlays so replacement and
  // cancellation detach every rendered route before React updates the preview.
  useEffect(() => {
    if (!mapInstance || !tripData?.routes?.length || !window.google?.maps || isDriving) {
      return undefined;
    }

    const overlays = [];
    tripData.routes.forEach((route, index) => {
      const path = route.decodedPath ?? [];
      if (path.length < 2) return;

      const isSelected = index === selectedIndex;
      const polyline = new window.google.maps.Polyline({
        map: mapInstance,
        path,
        ...polylineOptions,
        strokeColor: isSelected
          ? polylineOptions.strokeColor
          : token("--text-secondary"),
        strokeOpacity: isSelected ? 0.92 : 0.42,
        strokeWeight: isSelected ? 6 : 4,
        zIndex: isSelected ? 3 : 1,
        clickable: !isDriving && !tripConfirmed && !isConfirming,
      });
      const clickListener = polyline.addListener("click", () => {
        if (!isDriving && !tripConfirmed && !isConfirming) {
          setSelectedIndex(index);
        }
      });
      routePolylinesRef.current.add(polyline);
      overlays.push({ polyline, clickListener });
    });

    return () => {
      overlays.forEach(({ polyline, clickListener }) => {
        clickListener.remove();
        polyline.setPath([]);
        polyline.setMap(null);
        routePolylinesRef.current.delete(polyline);
      });
    };
  }, [isConfirming, isDriving, mapInstance, polylineOptions, selectedIndex, tripConfirmed, tripData]);

  useEffect(() => {
    if (!mapInstance || !routeData?.path?.length || !window.google?.maps) return;

    const bounds = new window.google.maps.LatLngBounds();
    routeData.path.forEach((point) => bounds.extend(point));
    if (bounds.isEmpty()) return;

    mapInstance.moveCamera({ tilt: 0, heading: 0 });
    mapInstance.fitBounds(bounds, { top: 60, bottom: 60, left: 360, right: 60 });
  }, [mapInstance, routeData]);

  useEffect(() => {
    const useFallback = () => {
      setGeoError(true);

      if (!drivingRef.current) {
        setCenter(FALLBACK_LOCATION);
      }
    };

    if (!navigator.geolocation) {
      useFallback();
      return undefined;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };

        latestLocationRef.current = { location: loc, timestamp: Date.now() };
        setCurrentLocation(loc);
        setGeoError(false);

        if (!hasCenteredRef.current) {
          hasCenteredRef.current = true;

          if (!drivingRef.current) {
            setCenter(loc);
          }
        }
      },
      useFallback,
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    return () => {
      drivingRef.current = false;
      routeRequestRef.current += 1;
      setAutomaticTurnSignal(null);
      const remainingFuelDistance = Math.max(
        0,
        routeProgressRef.current - fuelConsumedThroughRef.current
      );
      if (remainingFuelDistance > 0) {
        consumeFuelForDistance(remainingFuelDistance);
      }
      fuelConsumedThroughRef.current = routeProgressRef.current;
      gasStopLookupControllerRef.current?.abort();
      gasStopLookupControllerRef.current = null;
      routeProgressRef.current = 0;
      drivingElapsedSecondsRef.current = 0;
      fuelStopWarningRef.current = false;
      clearRoutePolylines();

      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      carMarkerRef.current?.setMap(null);
      if (drivingPolylineRef.current) {
        drivingPolylineRef.current.setPath([]);
        drivingPolylineRef.current.setMap(null);
        drivingPolylineRef.current = null;
      }
    };
  }, [clearRoutePolylines, consumeFuelForDistance, setAutomaticTurnSignal]);

  useEffect(() => {
    fuelLevelRef.current = fuelLevel;
  }, [fuelLevel]);

  const onMapLoad = useCallback((map) => {
    mapRef.current = map;
    setMapInstance(map);
  }, []);

  const onMapUnmount = useCallback(() => {
    stopDrivingSimulation(false);
    clearRoutePolylines();
    mapRef.current = null;
    setMapInstance(null);
  }, [clearRoutePolylines, stopDrivingSimulation]);

  const startDrivingSimulation = useCallback(() => {
    const map = mapRef.current;
    const path = routeData?.path;
    const maps = window.google?.maps;

    if (drivingRef.current) return false;
    if (!map || !maps || !destLocation || !path || path.length < 2) {
      setNavigationError("The map or route is not ready to start driving.");
      return false;
    }
    if (!maps.geometry?.spherical) {
      setNavigationError("Google Maps route geometry is unavailable.");
      return false;
    }

    const supportsVectorCamera =
      map.getRenderingType?.() === maps.RenderingType.VECTOR;

    const spherical = maps.geometry.spherical;
    const { turns } = detectRouteTurns(path, routeData?.maneuvers);
    const segments = [];
    let totalDistance = 0;

    for (let i = 0; i < path.length - 1; i += 1) {
      const start = new maps.LatLng(path[i].lat, path[i].lng);
      const end = new maps.LatLng(path[i + 1].lat, path[i + 1].lng);
      const length = spherical.computeDistanceBetween(start, end);

      if (length < 0.01) continue;

      segments.push({
        start,
        end,
        length,
        startDistance: totalDistance,
        endDistance: totalDistance + length,
      });

      totalDistance += length;
    }

    if (!segments.length) {
      setNavigationError("This route has no drivable coordinates.");
      return false;
    }

    const getDrivingState = (distance) => {
      const clamped = Math.max(0, Math.min(distance, totalDistance));

      let low = 0;
      let high = segments.length - 1;

      while (low < high) {
        const middle = Math.floor((low + high) / 2);

        if (clamped > segments[middle].endDistance) {
          low = middle + 1;
        } else {
          high = middle;
        }
      }

      const segment = segments[low];
      const fraction = Math.max(
        0,
        Math.min(
          1,
          (clamped - segment.startDistance) / segment.length
        )
      );

      return {
        position: spherical.interpolate(
          segment.start,
          segment.end,
          fraction
        ),
        segmentIndex: low,
      };
    };

    const positionAtDistance = (distance) => getDrivingState(distance).position;

    savedCameraRef.current = {
      center: map.getCenter()?.toJSON() ?? center,
      zoom: map.getZoom() ?? MAP_CONFIG.DEFAULT_ZOOM,
      heading: map.getHeading() ?? 0,
      tilt: map.getTilt() ?? 0,
    };

    const initialCamera = savedCameraRef.current;
    const startPosition = positionAtDistance(0);
    simulatedPositionRef.current = startPosition.toJSON();

    let heading = spherical.computeHeading(
      startPosition,
      positionAtDistance(Math.min(DRIVING.LOOK_AHEAD, totalDistance))
    );

    // Small circle representing the car.
    carMarkerRef.current = new maps.Marker({
      map,
      position: startPosition,
      zIndex: 100,
      icon: {
        path: maps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: token("--accent-primary"),
        fillOpacity: 1,
        strokeColor: token("--surface-primary"),
        strokeWeight: 2,
      },
    });

    drivingPolylineRef.current = new maps.Polyline({
      map,
      path: [startPosition, ...segments.map((s) => s.end)],
      ...polylineOptions,
      strokeColor: polylineOptions.strokeColor,
      strokeOpacity: 0.95,
      strokeWeight: 6,
      zIndex: 10,
      clickable: false,
    });

    map.setOptions({
      gestureHandling: "none",
      keyboardShortcuts: false,
      zoomControl: false,
    });

    setNavigationError(
      supportsVectorCamera
        ? ""
        : "Driving simulation started; this map does not support the tilted camera view."
    );
    drivingRef.current = true;
    setIsDriving(true);

    let previousTimestamp = null;
    let distanceTravelled = 0;
    let animationTime = 0;
    drivingElapsedSecondsRef.current = 0;
    routeProgressRef.current = 0;
    fuelConsumedThroughRef.current = 0;
    let nextTurnIndex = 0;
    let automaticSignal = null;
    const initialFuelWarning = shouldShowFuelStopWarning(0, fuelLevelRef.current);
    fuelStopWarningRef.current = initialFuelWarning;
    setShowFuelStopWarning(initialFuelWarning);

    const animate = (timestamp) => {
      if (!drivingRef.current || mapRef.current !== map) return;

      const deltaSeconds =
        previousTimestamp === null
          ? 0
          : Math.min((timestamp - previousTimestamp) / 1000, 0.1);

      previousTimestamp = timestamp;
      animationTime += deltaSeconds;
      drivingElapsedSecondsRef.current += deltaSeconds;

      distanceTravelled = Math.min(
        distanceTravelled + DRIVING.SPEED * deltaSeconds,
        totalDistance
      );
      routeProgressRef.current = distanceTravelled;

      if (distanceTravelled - fuelConsumedThroughRef.current >= DRIVING.SPEED) {
        consumeFuelForDistance(distanceTravelled - fuelConsumedThroughRef.current);
        fuelConsumedThroughRef.current = distanceTravelled;
      }

      const fuelWarning = shouldShowFuelStopWarning(
        drivingElapsedSecondsRef.current,
        fuelLevelRef.current
      );
      if (fuelWarning !== fuelStopWarningRef.current) {
        fuelStopWarningRef.current = fuelWarning;
        setShowFuelStopWarning(fuelWarning);
      }

      const signalProgress = advanceTurnSignal(
        turns,
        distanceTravelled,
        nextTurnIndex
      );
      nextTurnIndex = signalProgress.nextTurnIndex;
      if (automaticSignal !== signalProgress.signal) {
        automaticSignal = signalProgress.signal;
        setAutomaticTurnSignal(automaticSignal);
      }

      const { position, segmentIndex } = getDrivingState(distanceTravelled);
      simulatedPositionRef.current = position.toJSON();

      if (drivingPolylineRef.current) {
        const remainingPath = [position];
        for (let i = segmentIndex; i < segments.length; i += 1) {
          remainingPath.push(segments[i].end);
        }
        drivingPolylineRef.current.setPath(remainingPath);
      }
      const lookAheadDistance = Math.min(
        distanceTravelled + DRIVING.LOOK_AHEAD,
        totalDistance
      );

      if (lookAheadDistance > distanceTravelled) {
        const targetHeading = spherical.computeHeading(
          position,
          positionAtDistance(lookAheadDistance)
        );

        const headingDifference =
          ((targetHeading - heading + 540) % 360) - 180;
        const smoothing = 1 - Math.exp(-8 * deltaSeconds);

        heading += headingDifference * smoothing;
      }

      const transition = Math.min(animationTime, 1);
      const easedTransition =
        transition * transition * (3 - 2 * transition);

      const camera = {
        center: position,
        zoom:
          initialCamera.zoom +
          (DRIVING.ZOOM - initialCamera.zoom) * easedTransition,
      };
      if (supportsVectorCamera) {
        camera.heading = heading;
        camera.tilt =
          initialCamera.tilt +
          (DRIVING.TILT - initialCamera.tilt) * easedTransition;
      }
      map.moveCamera(camera);

      carMarkerRef.current?.setPosition(position);

      if (distanceTravelled >= totalDistance) {
        stopDrivingSimulation();
        return;
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);
    return true;
  }, [center, consumeFuelForDistance, destLocation, routeData, setAutomaticTurnSignal, stopDrivingSimulation]);

  const loadRoute = useCallback(
    async (destLoc, stops = [], originOverride = null) => {
      if (!originOverride) autoStartAfterRouteRef.current = false;
      stopDrivingSimulation();
      setIsFindingFuelStop(false);
      setNavigationError("");
      clearRoutePolylines();

      const requestId = ++routeRequestRef.current;

      setDestLocation(destLoc);
      setPlannedStops(stops);
      setTripData(null);
      setSelectedIndex(0);
      setTripConfirmed(false);
      setIsRouting(true);
      setNavigationError("");

      try {
        // A destination can be selected before watchPosition delivers its first
        // fix. Request a fresh fix in that case instead of routing from the map
        // fallback, which is only intended for the initial camera position.
        let origin = originOverride ?? currentLocation ?? FALLBACK_LOCATION;
        const recentLocation = latestLocationRef.current;
        if (!originOverride && recentLocation && Date.now() - recentLocation.timestamp < 20_000) {
          origin = recentLocation.location;
        } else if (!originOverride && navigator.geolocation) {
          origin = await new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
              (position) => {
                const location = {
                  lat: position.coords.latitude,
                  lng: position.coords.longitude,
                };
                latestLocationRef.current = {
                  location,
                  timestamp: Date.now(),
                };
                setCurrentLocation(location);
                setGeoError(false);
                resolve(location);
              },
              () => {
                const lastKnown = latestLocationRef.current;
                resolve(lastKnown?.location ?? currentLocation ?? FALLBACK_LOCATION);
              },
              { enableHighAccuracy: true, timeout: 10_000, maximumAge: 10_000 }
            );
          });
        }

        if (requestId !== routeRequestRef.current) return;

        const data = await apiFetch("/navigation/route", {
          method: "POST",
          body: JSON.stringify({
            origin_lat: origin.lat,
            origin_lng: origin.lng,
            dest_lat: destLoc.lat,
            dest_lng: destLoc.lng,
            waypoints: stops.map(({ lat, lng }) => ({ lat, lng })),
            current_fuel_level: fuelLevel,
          }),
        });

        if (requestId !== routeRequestRef.current) return;

        const candidateRoutes = data.routes?.length
          ? data.routes
          : [{
              index: 0,
              selected: true,
              polylines: data.polylines ?? [],
              distance_text: data.distance_text,
              duration_text: data.duration_text,
              destination_address: data.destination_address,
              maneuvers: data.maneuvers ?? [],
            }];
        const decodedRoutes = candidateRoutes.map((route) => ({
          ...route,
          suggested_stops: route.suggested_stops ?? data.suggested_stops ?? [],
          maneuvers:
            route.maneuvers ?? (route.selected ? data.maneuvers ?? [] : []),
          decodedPath: (route.polylines ?? []).flatMap((encoded) =>
            window.google.maps.geometry.encoding
              .decodePath(encoded)
              .map((point) => point.toJSON())
          ),
        }));
        const firstRouteIndex = Math.max(
          0,
          decodedRoutes.findIndex((route) => route.selected)
        );

        if ((decodedRoutes[firstRouteIndex]?.decodedPath?.length ?? 0) < 2) {
          throw new Error("The route response contains no usable path.");
        }

        setTripData({ ...data, routes: decodedRoutes, requestId });
        setSelectedIndex(firstRouteIndex);
      } catch (error) {
        if (requestId !== routeRequestRef.current) return;
        autoStartAfterRouteRef.current = false;

        console.error("Routing failed:", error);
        setNavigationError(
          "Unable to load a route. Try another destination."
        );
      } finally {
        if (requestId === routeRequestRef.current) setIsRouting(false);
      }
    },
    [clearRoutePolylines, currentLocation, fuelLevel, stopDrivingSimulation]
  );

  const handlePlaceSelect = useCallback(
    (place) => {
      if (!place?.geometry?.location) return;

      const destLoc = {
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
        place_id: place.place_id,
      };
      loadRoute(destLoc, []);
    },
    [loadRoute]
  );

  const addSuggestedStop = useCallback((stop) => {
    if (!destLocation || isDriving || tripConfirmed || isRouting) return;
    if (plannedStops.some((planned) => planned.place_id === stop.place_id)) return;
    loadRoute(destLocation, [...plannedStops, stop]);
  }, [destLocation, isDriving, isRouting, loadRoute, plannedStops, tripConfirmed]);

  const removePlannedStop = useCallback((placeId) => {
    if (!destLocation || isDriving || tripConfirmed || isRouting) return;
    loadRoute(
      destLocation,
      plannedStops.filter((stop) => stop.place_id !== placeId)
    );
  }, [destLocation, isDriving, isRouting, loadRoute, plannedStops, tripConfirmed]);


  const handleStartDriving = useCallback(() => {
    if (!routeData || isConfirming) return;

    if (!startDrivingSimulation()) return;

    if (tripData?.trip_id && !tripConfirmed) {
      const requestId = routeRequestRef.current;
      setIsConfirming(true);
      apiFetch(`/navigation/trips/${tripData.trip_id}/confirm`, {
        method: "POST",
        body: JSON.stringify({
          selected_route_index: routeData.index,
          kept_stops: plannedStops.map((stop) => stop.place_id),
          destination_place_id: destLocation?.place_id ?? null,
        }),
      })
        .then(() => {
          if (requestId === routeRequestRef.current) setTripConfirmed(true);
        })
        .catch((error) => {
          if (requestId !== routeRequestRef.current) return;
          console.error("Failed to confirm trip:", error);
          setNavigationError(
            "Driving started, but the trip could not be saved."
          );
        })
        .finally(() => setIsConfirming(false));
    }
  }, [destLocation, isConfirming, plannedStops, routeData, startDrivingSimulation, tripConfirmed, tripData]);

  const handleFuelStopDetour = useCallback(async () => {
    const origin = simulatedPositionRef.current;
    const path = routeData?.path;
    const maps = window.google?.maps;
    if (!destLocation || !origin || !path || path.length < 2 || isRouting || isFindingFuelStop) return;
    if (!maps?.geometry?.encoding || !maps.geometry.spherical) {
      setNavigationError("Route geometry is unavailable for finding a station.");
      return;
    }

    const remainingPoints = [new maps.LatLng(origin.lat, origin.lng)];
    let distanceAtPoint = 0;
    const traveledDistance = routeProgressRef.current;
    for (let index = 0; index < path.length - 1; index += 1) {
      const current = new maps.LatLng(path[index].lat, path[index].lng);
      const next = new maps.LatLng(path[index + 1].lat, path[index + 1].lng);
      distanceAtPoint += maps.geometry.spherical.computeDistanceBetween(current, next);
      if (distanceAtPoint > traveledDistance + 1) remainingPoints.push(next);
    }
    if (remainingPoints.length < 2) {
      setNavigationError("There is no remaining route ahead to search.");
      return;
    }

    const controller = new AbortController();
    gasStopLookupControllerRef.current = controller;
    setIsFindingFuelStop(true);
    setNavigationError("");

    try {
      const station = await apiFetch("/navigation/route-fuel-stop", {
        method: "POST",
        body: JSON.stringify({
          encoded_route: maps.geometry.encoding.encodePath(remainingPoints),
        }),
        signal: controller.signal,
      });
      if (controller.signal.aborted || !drivingRef.current) return;
      if (!station) {
        setNavigationError("No gas station with a small detour was found ahead.");
        return;
      }

      gasStopLookupControllerRef.current = null;
      const stop = {
        ...station,
        type: station.station_type === "charging" ? "ev_charging" : "fuel",
      };
      autoStartAfterRouteRef.current = true;
      loadRoute(destLocation, [stop, ...plannedStops], origin);
    } catch (error) {
      if (!controller.signal.aborted) {
        console.warn("Unable to find a fuel stop along the route:", error.message);
        setNavigationError("Unable to find a gas station along this route. Try again.");
      }
    } finally {
      if (gasStopLookupControllerRef.current === controller) {
        gasStopLookupControllerRef.current = null;
      }
      if (!controller.signal.aborted) setIsFindingFuelStop(false);
    }
  }, [destLocation, isFindingFuelStop, isRouting, loadRoute, plannedStops, routeData]);

  useEffect(() => {
    if (!autoStartAfterRouteRef.current || isRouting || !routeData) return;
    autoStartAfterRouteRef.current = false;
    handleStartDriving();
  }, [handleStartDriving, isRouting, routeData]);

  const cancelRoute = useCallback(() => {
    autoStartAfterRouteRef.current = false;
    routeRequestRef.current += 1;
    stopDrivingSimulation();
    clearRoutePolylines();
    setDestLocation(null);
    setPlannedStops([]);
    setTripData(null);
    setSelectedIndex(0);
    setIsRouting(false);
    setTripConfirmed(false);
    setNavigationError("");
    setSearchResetKey((key) => key + 1);

    const map = mapRef.current;
    if (map) {
      map.moveCamera({
        center: currentLocation ?? center,
        zoom: MAP_CONFIG.DEFAULT_ZOOM,
        heading: 0,
        tilt: 0,
      });
    }
  }, [center, clearRoutePolylines, currentLocation, stopDrivingSimulation]);

  if (loadError) {
    return (
      <div className="map-panel">
        <div className="map-error">Failed to load Google Maps.</div>
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
      <MapSearch
        onPlaceSelect={handlePlaceSelect}
        resetKey={searchResetKey}
      />

      <GoogleMap
        key={theme}
        mapContainerStyle={mapContainerStyle}
        center={center}
        zoom={MAP_CONFIG.DEFAULT_ZOOM}
        options={mapOptions}
        onLoad={onMapLoad}
        onUnmount={onMapUnmount}
      >
        {currentLocation && !isDriving && (
          <Marker
            position={currentLocation}
            icon={{
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: token("--accent-primary"),
              fillOpacity: 1,
              strokeWeight: 2,
              strokeColor: token("--surface-primary"),
            }}
            zIndex={2}
          />
        )}

        {destLocation && (
          <Marker position={destLocation} icon={destinationIcon(token)} zIndex={6} />
        )}

        {tripData?.weather_warnings
          ?.filter(
            (warning) =>
              warning.condition !== "fuel_warning" &&
              Number.isFinite(warning.lat) &&
              Number.isFinite(warning.lng)
          )
          .map((warning, index) => (
          <Marker
            key={`weather-${index}`}
            position={{ lat: warning.lat, lng: warning.lng }}
            title={warning.message}
            icon={weatherIcon(token)}
            zIndex={5}
          />
          ))}

        {[
          ...plannedStops.map((stop) => ({ ...stop, planned: true })),
          ...(routeData?.suggested_stops ?? []).filter(
            (suggestion) => !plannedStops.some((stop) => stop.place_id === suggestion.place_id)
          ),
        ].map((stop) => (
          <Marker
            key={`stop-${stop.place_id}`}
            position={{ lat: stop.lat, lng: stop.lng }}
            title={`${stop.name} · ${stop.arrival_fuel_pct}% fuel on arrival`}
            icon={fuelStopIcon(token, stop.planned)}
            zIndex={4}
          />
        ))}

      </GoogleMap>

      {!isDriving && tripData?.routes?.length > 0 && (
        <aside className="route-options" aria-label="Route options">
          <div className="route-options-head">
            <strong className="route-options-title">Route Options</strong>
            <div className="route-options-dest">
              {tripData.destination_address || "Choose a route"}
            </div>
          </div>
          {tripData.routes.map((route, index) => {
            const isSelected = index === selectedIndex;
            return (
              <button
                key={route.index}
                type="button"
                onClick={() => setSelectedIndex(index)}
                disabled={tripConfirmed || isDriving || isConfirming}
                aria-pressed={isSelected}
                className="route-option"
              >
                <span className="route-option-summary">
                  <strong>{route.duration_text}</strong>
                  <span>{route.distance_text}</span>
                </span>
                {route.estimated_trip_cost > 0 && (
                  <span className="route-option-fuel-cost">
                    ~{route.estimated_trip_cost} {route.fuel_currency || "RON"} ({route.estimated_fuel_litres}L)
                  </span>
                )}
                {route.explanation && (
                  <span className="route-option-why">
                    {route.explanation}
                  </span>
                )}
                <span className="route-option-tags">
                  {Number.isFinite(route.scores?.utility) && (
                    <span className="route-option-tag">
                      Utility: {(route.scores.utility * 100).toFixed(0)}%
                    </span>
                  )}
                  {route.labels?.includes("FUEL_EFFICIENT") && (
                    <span className="route-option-tag eco">Eco</span>
                  )}
                  {route.labels?.includes("MOUNTAIN_CORRIDOR") && (
                    <span className="route-option-tag mountain">Mountain</span>
                  )}
                  {route.labels?.includes("SCENIC_REGIONAL") && !route.labels?.includes("MOUNTAIN_CORRIDOR") && (
                    <span className="route-option-tag scenic">Scenic</span>
                  )}
                  {route.labels?.includes("TOURIST_CORRIDOR") && (
                    <span className="route-option-tag attraction">Touristic</span>
                  )}
                  {route.scores?.weather_risk > 0.3 && (
                    <span className="route-option-tag risk">Weather risk</span>
                  )}
                </span>
              </button>
            );
          })}
          {plannedStops.length > 0 && (
            <section className="route-stops">
              <strong className="route-stops-title">
                Stops on this route
              </strong>
              {plannedStops.map((stop) => (
                <div key={stop.place_id} className="route-stop">
                  <span className="route-stop-info">
                    <GasPumpIcon size={14} aria-hidden="true" />
                    {stop.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => removePlannedStop(stop.place_id)}
                    aria-label={`Remove ${stop.name} from the route`}
                    disabled={isRouting || isDriving || tripConfirmed || isConfirming}
                    className="route-stop-remove"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </section>
          )}

          {(routeData?.suggested_stops ?? []).some(
            (stop) => !plannedStops.some((planned) => planned.place_id === stop.place_id)
          ) && (
            <section className="route-stops suggested">
              <strong className="route-stops-title">
                Suggested fuel stops
              </strong>
              {(routeData?.suggested_stops ?? [])
                .filter((stop) => !plannedStops.some((planned) => planned.place_id === stop.place_id))
                .map((stop) => (
                  <div key={stop.place_id} className="route-stop">
                    <span className="route-stop-info">
                      <span className="route-stop-name">{stop.name}</span>
                      <span className="route-stop-meta">
                        {stop.arrival_fuel_pct}% fuel · {stop.detour_min} min detour
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => addSuggestedStop(stop)}
                      aria-label={`Add ${stop.name} as a route stop`}
                      disabled={isRouting || isDriving || tripConfirmed || isConfirming}
                      className="route-stop-add"
                    >
                      Add stop
                    </button>
                  </div>
                ))}
            </section>
          )}

        </aside>
      )}

      {isDriving && showFuelStopWarning && (
        <aside className="fuel-stop-advisory" aria-live="polite" role="status">
          <span className="fuel-stop-advisory-icon" aria-hidden="true">
            <GasPumpIcon size={18} weight="fill" />
          </span>
          <span className="fuel-stop-advisory-copy">
            <strong>Consider a quick stop</strong>
            <span>
              {fuelLevel < 30 && drivingElapsedSecondsRef.current > 7_200
                ? "Fuel is below 30% and you have been driving for over two hours."
                : fuelLevel < 30
                  ? "Your fuel level is below 30%."
                  : "You have been driving for over two hours."}
            </span>
          </span>
        </aside>
      )}

      {isRouting && (
        <div className="route-status" role="status">
          {autoStartAfterRouteRef.current
            ? "Rerouting through gas station…"
            : plannedStops.length > 0
              ? "Updating route through selected stops…"
              : "Finding route…"}
        </div>
      )}

      {routeData && (
        <div className="route-summary">
          <div className="route-summary-item">
            <ClockIcon size={18} className="route-summary-icon" aria-hidden="true" />
            {routeData.duration}
          </div>

          <div className="route-summary-item">
            <PathIcon size={18} className="route-summary-icon" aria-hidden="true" />
            {routeData.distance}
          </div>

          {routeData.estimated_trip_cost > 0 && (
            <div
              className="route-summary-item"
              title={`${routeData.estimated_fuel_litres}L @ ${routeData.fuel_price_per_l} ${routeData.fuel_currency || "RON"}/L`}
            >
              <GasPumpIcon size={18} className="route-summary-icon" aria-hidden="true" />
              ~{routeData.estimated_trip_cost} {routeData.fuel_currency || "RON"}
            </div>
          )}


          {destLocation && !isDriving && (
            <button
              type="button"
              onClick={handleStartDriving}
              disabled={isConfirming}
              className="route-drive-btn"
            >
              {isConfirming ? "Confirming…" : "Start Driving"}
            </button>
          )}

          {isDriving && (
            <>
              <button
                type="button"
                onClick={handleFuelStopDetour}
                disabled={isRouting || isFindingFuelStop}
                aria-label="Find a gas station ahead and reroute through it"
                className="route-gas-station-btn"
              >
                <GasPumpIcon size={17} weight="fill" aria-hidden="true" />
                {isFindingFuelStop ? "Finding…" : "Gas station"}
              </button>
              <button
                type="button"
                onClick={() => stopDrivingSimulation()}
                className="route-drive-btn"
              >
                Stop Driving
              </button>
            </>
          )}

          {!isDriving && (
            <button
              type="button"
              onClick={cancelRoute}
              aria-label="Cancel route"
              title="Cancel route"
              className="route-cancel-btn"
            >
              <XIcon size={15} aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {(navigationError || geoError) && (
        <div className="map-geo-notice" role="status">
          <WarningIcon size={15} className="map-geo-notice-icon" aria-hidden="true" />
          <span>
            {navigationError ||
              "Location unavailable. Using the fallback location."}
          </span>
        </div>
      )}
    </div>
  );
}
