import React, { useEffect, useRef, useState } from "react";

const GOOGLE_MAPS_API_KEY = "AIzaSyBhQteBWTR-kQ1V9HBCQcz8SaZ0ZOOWEr0";

const SITES = [
  { id: "alcudia", title: "L'Alcúdia (Elx / Elche)", coords: { lat: 38.2397, lng: -0.69556 }, hint: "Jaciment arqueològic on va aparèixer una famosa dama ibérica." },
  { id: "tossal", title: "Tossal de Sant Miquel (Llíria)", coords: { lat: 39.621367, lng: -0.599027 }, hint: "Vistes des del monestir de Sant Miquel a un antic assentament íber a l'entorn d'Edeta." },
  { id: "los_villares", title: "Los Villares (Kelin, Caudete de las Fuentes)", coords: { lat: 39.552854, lng: -1.282821 }, hint: "Poblat íber emmurallat identificat com l'antiga Kelin." },
  { id: "bastida", title: "La Bastida de les Alcuses (Moixent)", coords: { lat: 38.813869, lng: -0.802118 }, hint: "En aquest lloc es va trobar una famosa figureta d'un guerrer." },
  { id: "punta_orley", title: "Punta d'Orley (Vall d'Uixó)", coords: { lat: 39.823611, lng: -0.251667 }, hint: "Poblat íber sobre un promontori a prop de la costa." },
];

function loadGoogleMapsScript(apiKey) {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) return resolve(window.google);
    const id = "google-maps-script";
    if (document.getElementById(id)) {
      document.getElementById(id).addEventListener("load", () => resolve(window.google));
      return;
    }
    const script = document.createElement("script");
    script.id = id;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google);
    script.onerror = (e) => reject(e);
    document.head.appendChild(script);
  });
}

function haversineDistanceKm(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const aa = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return R * c;
}

export default function Iberlloc() {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const panoramaRef = useRef(null);
  const mapRef = useRef(null);
  const panoramaInstance = useRef(null);
  const mapInstance = useRef(null);
  const markerInstance = useRef(null);
  const [guessMarkers, setGuessMarkers] = useState([]);

  const [roundIndex, setRoundIndex] = useState(0);
  const [guessedLocation, setGuessedLocation] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [score, setScore] = useState(0);
  const [roundResults, setRoundResults] = useState([]);

  useEffect(() => {
    loadGoogleMapsScript(GOOGLE_MAPS_API_KEY)
      .then(() => setLoaded(true))
      .catch(() => setError("Error carregant Google Maps. Revisa la teua clau API i connexió."));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const site = SITES[roundIndex];
    setShowHint(false); // reset de pista
    setGuessedLocation(null);
    setRevealed(false);

    // Street View
    const sv = new window.google.maps.StreetViewService();
    const panoOptions = {
      position: site.coords,
      pov: { heading: 34, pitch: 0 },
      addressControl: false,
      linksControl: true,
      panControl: false,
      enableCloseButton: false,
      motionTracking: false,
    };
    if (!panoramaInstance.current) {
      panoramaInstance.current = new window.google.maps.StreetViewPanorama(panoramaRef.current, panoOptions);
    } else {
      panoramaInstance.current.setOptions(panoOptions);
    }
    sv.getPanorama({ location: site.coords, radius: 200 }, (data, status) => {
      if (status === "OK" && data?.location?.pano) {
        panoramaInstance.current.setPano(data.location.pano);
        panoramaInstance.current.setVisible(true);
      } else {
        panoramaInstance.current.setPosition(site.coords);
        panoramaInstance.current.setVisible(true);
      }
    });

    // Mapa
    const mapOpts = {
      center: { lat: 40.0, lng: -3.5 },
      zoom: 6,
      streetViewControl: false,
      mapTypeId: "roadmap",
    };
    if (!mapInstance.current) {
      mapInstance.current = new window.google.maps.Map(mapRef.current, mapOpts);
      mapInstance.current.addListener("click", (e) => {
        if (revealed) return;
        const lat = e.latLng.lat();
        const lng = e.latLng.lng();
        placeGuessMarker({ lat, lng });
      });
    } else {
      mapInstance.current.setOptions(mapOpts);
    }

    if (markerInstance.current) {
      markerInstance.current.setMap(null);
      markerInstance.current = null;
    }

  }, [loaded, roundIndex, revealed]);

  function placeGuessMarker(latlng) {
    if (markerInstance.current) {
      markerInstance.current.setPosition(latlng);
    } else {
      markerInstance.current = new window.google.maps.Marker({ map: mapInstance.current, position: latlng });
    }
    mapInstance.current.panTo(latlng);
    setGuessedLocation(latlng);
  }

  function computeScoreForDistance(distanceKm) {
    const max = 5000;
    const maxDistance = 2000;
    return Math.max(0, Math.round(max * (1 - distanceKm / maxDistance)));
  }

  function onReveal() {
    if (!guessedLocation) return alert("Fes una suposició al mapa abans de revelar.");
    const site = SITES[roundIndex];
    const guess = { lat: guessedLocation.lat, lng: guessedLocation.lng };
    const real = site.coords;
    const dist = haversineDistanceKm(guess, real);
    const pts = computeScoreForDistance(dist);
    setScore((s) => s + pts);

    // marcador de la posición real con número
    const marker = new window.google.maps.Marker({
      map: mapInstance.current,
      position: real,
      label: `${roundIndex + 1}`,
      icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 6, strokeColor: "black" }
    });
    setGuessMarkers((prev) => [...prev, marker]);

    // línea entre suposición y real
    new window.google.maps.Polyline({
      path: [guess, real],
      map: mapInstance.current,
      geodesic: true,
    });

    const bounds = new window.google.maps.LatLngBounds();
    bounds.extend(guess);
    bounds.extend(real);
    mapInstance.current.fitBounds(bounds, 50);

    setRevealed(true);
  }

  function onNext() {
    if (roundIndex < SITES.length - 1) {
      setRoundIndex((i) => i + 1);
    } else {
      alert(`Joc finalitzat! Puntuació total: ${score} punts.`);
      // limpiar marcadores para nuevo juego
      guessMarkers.forEach((m) => m.setMap(null));
      setGuessMarkers([]);
      setRoundIndex(0);
      setScore(0);
      setRoundResults([]);
    }
  }

  if (error) {
    return <div className="p-6 max-w-3xl mx-auto"><h2 className="text-xl font-bold">Error</h2><p>{error}</p></div>;
  }

  return (
    <div className="p-4 max-w-5xl mx-auto font-sans" style={{ background: "#d2b48c", minHeight: "100vh" }}>
      <header className="flex items-center justify-between mb-4">
        <h1 style={{ fontFamily: "'Cinzel', serif", fontSize: "2rem", color: "#4b2e05" }}>Iberlloc — Miniapp</h1>
        <div className="text-right">
          <div>Ronda {roundIndex + 1} / {SITES.length}</div>
          <div>Punts: {score}</div>
        </div>
      </header>

      <main className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="space-y-2">
          <div className="bg-white rounded-lg p-2 text-overlay">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold">Mira al voltant (Street View)</h2>
              <div className="text-sm text-gray-600">Usa el ratolí o el dit per a navegar</div>
            </div>
            <div ref={panoramaRef} style={{ width: "100%", height: "420px" }} className="rounded" />
          </div>

          <div className="bg-white rounded-lg p-3 shadow text-overlay">
            <h3 className="font-semibold">Pista cultural</h3>
            {!showHint ? (
              <button
                onClick={() => setShowHint(true)}
                className="mt-2 px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600"
              >
                Mostrar pista
              </button>
            ) : (
              <p className="text-sm text-gray-800 mt-2">{SITES[roundIndex].hint}</p>
            )}
          </div>
        </section>

        <aside className="space-y-3">
          <div className="bg-white rounded-lg p-3 shadow text-overlay">
            <h3 className="font-semibold">Mapa — fes la teua suposició</h3>
            <div ref={mapRef} style={{ width: "100%", height: "300px" }} className="rounded mt-2" />
            <div className="flex gap-2 mt-3">
              <button onClick={onReveal} className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700" disabled={!guessedLocation || revealed}>
                Revelar ubicació
              </button>
              <button onClick={onNext} className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700">
                {roundIndex < SITES.length - 1 ? "Següent mapa" : "Finalitzar / Reiniciar"}
              </button>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
