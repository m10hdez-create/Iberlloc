import React, { useEffect, useRef, useState } from "react";

/* ========= FUENTE: League Spartan (evita duplicados) ========= */
(function ensureLeagueSpartan() {
  if (!document.getElementById("league-spartan-font")) {
    const link = document.createElement("link");
    link.id = "league-spartan-font";
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=League+Spartan:wght@300;400;600;700;800;900&display=swap";
    document.head.appendChild(link);
  }
})();

/* ========= PALETA ========= */
const THEME = {
  sky: "#8fb5d2",   // cielo
  ice: "#b9d5f1",   // hielo
  earth: "#ab7b3f", // tierra
  sun: "#efb43e",   // sol
};

const apiKey = process.env.REACT_APP_GOOGLE_API_KEY;

/* ========= DATOS ========= */
const SITES = [
  { id: "alcudia", title: "L'Alcúdia (Elx / Elche)", coords: { lat: 38.2397, lng: -0.69556 }, hint: "Jaciment arqueològic on va aparèixer una famosa dama ibèrica." },
  { id: "tossal", title: "Tossal de Sant Miquel (Llíria)", coords: { lat: 39.621367, lng: -0.599027 }, hint: "Vistes des del monestir de Sant Miquel a un antic assentament íber a l'entorn d'Edeta." },
  { id: "los_villares", title: "Los Villares (Kelin, Caudete de las Fuentes)", coords: { lat: 39.552854, lng: -1.282821 }, hint: "Poblat íber emmurallat identificat com l'antiga Kelin." },
  { id: "bastida", title: "La Bastida de les Alcuses (Moixent)", coords: { lat: 38.813869, lng: -0.802118 }, hint: "En aquest lloc es va trobar una famosa figureta d'un guerrer." },
  { id: "punta_orley", title: "Punta d'Orley (Vall d'Uixó)", coords: { lat: 39.823611, lng: -0.251667 }, hint: "Poblat íber sobre un promontori a prop de la costa." },
];

/* ========= UTILIDADES ========= */
function loadGoogleMapsScript(apiKey) {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) return resolve(window.google);
    const id = "google-maps-script";
    const existing = document.getElementById(id);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.google), { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = id;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function haversineDistanceKm(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const aa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

function computeScoreForDistance(distanceKm) {
  const maxPoints = 1000;
  const maxDistance = 1200;
  return Math.max(0, Math.round(maxPoints * (1 - distanceKm / maxDistance)));
}

/* ========= FRAME (marco decorativo con tu paleta) ========= */
function Frame({ children, pad = 10, innerPad = 12, bg = THEME.ice }) {
  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${THEME.sun}, ${THEME.earth})`,
        padding: pad,
        borderRadius: 16,
      }}
    >
      <div
        style={{
          background: bg,
          padding: innerPad,
          borderRadius: 12,
          boxShadow: `0 2px 0 0 ${THEME.earth} inset`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ========= COMPONENTE PRINCIPAL ========= */
export default function Iberlloc() {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [roundIndex, setRoundIndex] = useState(0);
  const [guessedLocation, setGuessedLocation] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [score, setScore] = useState(0);
  const [roundResults, setRoundResults] = useState([]);
  const [gameOver, setGameOver] = useState(false);

  const panoramaRef = useRef(null);
  const mapRef = useRef(null);
  const panoramaInstance = useRef(null);
  const mapInstance = useRef(null);
  const markerInstance = useRef(null);
  const markersRef = useRef([]);
  const linesRef = useRef([]);
  const revealedRef = useRef(false);
  const gameOverRef = useRef(false);
  const zoomIntervalRef = useRef(null);

  useEffect(() => { revealedRef.current = revealed; }, [revealed]);
  useEffect(() => { gameOverRef.current = gameOver; }, [gameOver]);

  useEffect(() => {
    loadGoogleMapsScript(apiKey)
      .then(() => setLoaded(true))
      .catch(() => setError("Error carregant Google Maps."));
  }, []);

  useEffect(() => {
    if (!loaded) return;

    const site = SITES[roundIndex];
    setShowHint(false);
    setGuessedLocation(null);
    setRevealed(false);
    revealedRef.current = false;

    // Street View
    const sv = new window.google.maps.StreetViewService();
    const panoOptions = {
      position: site.coords,
      pov: { heading: 34, pitch: 0 },
      addressControl: false,
      linksControl: true,
      panControl: false,
      enableCloseButton: false,
    };
    if (!panoramaInstance.current) {
      panoramaInstance.current = new window.google.maps.StreetViewPanorama(
        panoramaRef.current,
        panoOptions
      );
    } else {
      panoramaInstance.current.setOptions(panoOptions);
    }
    sv.getPanorama({ location: site.coords, radius: 400 }, (data, status) => {
      if (status === "OK" && data?.location?.pano) {
        panoramaInstance.current.setPano(data.location.pano);
      } else {
        panoramaInstance.current.setPosition(site.coords);
      }
    });

    // Mapa
    if (!mapInstance.current) {
      mapInstance.current = new window.google.maps.Map(mapRef.current, {
        center: { lat: 40.0, lng: -3.5 },
        zoom: 6,
        streetViewControl: false,
      });

      mapInstance.current.addListener("click", (e) => {
        if (revealedRef.current || gameOverRef.current) return;
        const lat = e.latLng.lat();
        const lng = e.latLng.lng();
        placeGuessMarker({ lat, lng });
      });
    } else {
      mapInstance.current.setCenter({ lat: 40.0, lng: -3.5 });
      mapInstance.current.setZoom(6);
    }

    if (markerInstance.current) {
      markerInstance.current.setMap(null);
      markerInstance.current = null;
    }

    if (zoomIntervalRef.current) {
      clearInterval(zoomIntervalRef.current);
      zoomIntervalRef.current = null;
    }
  }, [loaded, roundIndex]);

  function placeGuessMarker(latlng) {
    if (markerInstance.current) {
      markerInstance.current.setPosition(latlng);
    } else {
      markerInstance.current = new window.google.maps.Marker({
        map: mapInstance.current,
        position: latlng,
      });
    }
    setGuessedLocation(latlng);
  }

  function zoomToReal(real) {
    const map = mapInstance.current;
    if (!map) return;
    map.panTo(real);
    if (zoomIntervalRef.current) clearInterval(zoomIntervalRef.current);
    let z = map.getZoom();
    const target = 12;
    const step = target > z ? 1 : -1;
    zoomIntervalRef.current = setInterval(() => {
      z += step;
      map.setZoom(z);
      if (z === target) {
        clearInterval(zoomIntervalRef.current);
        zoomIntervalRef.current = null;
      }
    }, 120);
  }

  function onReveal() {
    if (!guessedLocation) {
      alert("Fes una suposició abans de revelar.");
      return;
    }
    const site = SITES[roundIndex];
    const real = site.coords;
    const dist = haversineDistanceKm(guessedLocation, real);
    const pts = computeScoreForDistance(dist);

    setScore((s) => s + pts);
    setRoundResults((r) => [...r, { name: site.title, points: pts }]);

    const realMarker = new window.google.maps.Marker({
      map: mapInstance.current,
      position: real,
      label: `${roundIndex + 1}`,
      icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 6, strokeColor: THEME.earth },
      title: site.title,
    });
    markersRef.current.push(realMarker);

    const line = new window.google.maps.Polyline({
      path: [guessedLocation, real],
      map: mapInstance.current,
      geodesic: true,
      strokeColor: THEME.sun,
      strokeWeight: 3,
    });
    linesRef.current.push(line);

    zoomToReal(real);
    revealedRef.current = true;
    setRevealed(true);
  }

  function onNext() {
    if (markerInstance.current) markerInstance.current.setMap(null);
    setGuessedLocation(null);
    setShowHint(false);
    setRevealed(false);
    revealedRef.current = false;

    if (roundIndex < SITES.length - 1) {
      setRoundIndex((i) => i + 1);
    } else {
      setGameOver(true);
      gameOverRef.current = true;
    }
  }

  function restart() {
    markersRef.current.forEach((m) => m.setMap(null));
    linesRef.current.forEach((l) => l.setMap(null));
    markersRef.current = [];
    linesRef.current = [];
    if (markerInstance.current) markerInstance.current.setMap(null);
    setRoundIndex(0);
    setScore(0);
    setRoundResults([]);
    setGuessedLocation(null);
    setShowHint(false);
    setRevealed(false);
    setGameOver(false);
    revealedRef.current = false;
    gameOverRef.current = false;
  }

  if (error) {
    return (
      <div
        style={{
          minHeight: "100vh",
          fontFamily: "'League Spartan', sans-serif",
          color: THEME.earth,
          display: "grid",
          placeItems: "center",
          background: `linear-gradient(135deg, ${THEME.sky}, ${THEME.ice})`,
          padding: 16,
        }}
      >
        <Frame bg={THEME.ice}>
          <div>{error}</div>
        </Frame>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{
        fontFamily: "'League Spartan', system-ui, sans-serif",
        background: `
          radial-gradient(1200px 800px at 10% 10%, ${THEME.ice} 0%, transparent 60%),
          radial-gradient(1000px 700px at 90% 20%, ${THEME.sun}22 0%, transparent 60%),
          linear-gradient(135deg, ${THEME.sky} 0%, ${THEME.ice} 45%, ${THEME.sun} 100%)
        `,
        padding: "16px",
      }}
    >
      <header style={{ display: "flex", justifyContent: "space-between", color: THEME.earth }}>
        <Frame pad={8} innerPad={10} bg={THEME.sky}>
          <h1 style={{ fontWeight: 800, fontSize: 26, margin: 0 }}>Iberlloc — Miniapp</h1>
        </Frame>
        <Frame pad={8} innerPad={10} bg={THEME.ice}>
          <div style={{ textAlign: "right", fontWeight: 600 }}>
            <div>Ronda {roundIndex + 1} / {SITES.length}</div>
            <div>Punts: {score}</div>
          </div>
        </Frame>
      </header>

      <main style={{ display: "grid", gap: 16, marginTop: 16 }}>
        <section>
          <Frame bg={THEME.ice}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <h2 style={{ fontWeight: 800, fontSize: 18, margin: 0 }}>Mira al voltant (Street View)</h2>
              <div style={{ fontSize: 13, opacity: 0.8 }}>Usa el ratolí o el dit per a navegar</div>
            </div>
            <div
              ref={panoramaRef}
              style={{
                width: "100%",
                height: 420,
                borderRadius: 10,
                border: `3px solid ${THEME.earth}`,
                boxShadow: `0 0 0 6px ${THEME.sun}55`,
              }}
            />
          </Frame>

          <Frame bg={THEME.sky}>
            <h3 style={{ fontWeight: 700, margin: 0 }}>Pista cultural</h3>
            {!showHint ? (
              <button
                onClick={() => setShowHint(true)}
                style={{
                  marginTop: 10,
                  padding: "8px 12px",
                  background: THEME.sun,
                  color: THEME.earth,
                  fontWeight: 700,
                  borderRadius: 8,
                  border: `2px solid ${THEME.earth}`,
                  cursor: "pointer",
                }}
              >
                Mostrar pista
              </button>
            ) : (
              <p style={{ fontSize: 14, marginTop: 10 }}>{SITES[roundIndex].hint}</p>
            )}
          </Frame>
        </section>

        <aside>
          <Frame bg={THEME.ice}>
            <h3 style={{ fontWeight: 700, margin: 0 }}>Mapa — fes la teua suposició</h3>
            <div
              ref={mapRef}
              style={{
                width: "100%",
                height: 320,
                marginTop: 8,
                borderRadius: 10,
                border: `3px solid ${THEME.earth}`,
                boxShadow: `0 0 0 6px ${THEME.sky}66`,
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                onClick={onReveal}
                disabled={!guessedLocation || revealed}
                style={{
                  padding: "10px 14px",
                  background: revealed ? THEME.sky : THEME.sun,
                  color: THEME.earth,
                  fontWeight: 800,
                  borderRadius: 10,
                  border: `2px solid ${THEME.earth}`,
                  opacity: !guessedLocation || revealed ? 0.6 : 1,
                  cursor: !guessedLocation || revealed ? "not-allowed" : "pointer",
                }}
              >
                Revelar ubicació
              </button>
              <button
                onClick={onNext}
                style={{
                  padding: "10px 14px",
                  background: THEME.sky,
                  color: THEME.earth,
                  fontWeight: 800,
                  borderRadius: 10,
                  border: `2px solid ${THEME.earth}`,
                  cursor: "pointer",
                }}
              >
                {roundIndex < SITES.length - 1 ? "Següent mapa" : "Finalitzar / Reiniciar"}
              </button>
            </div>
          </Frame>
        </aside>
      </main>

      {gameOver && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
            zIndex: 50,
            background: `${THEME.earth}99`, // velo con tu paleta
            fontFamily: "'League Spartan', sans-serif",
          }}
        >
          <Frame pad={14} innerPad={0} bg="transparent">
            <div
              style={{
                background: THEME.ice,       // FONDO SÓLIDO del contenido
                padding: 16,
                borderRadius: 12,
                border: `6px solid ${THEME.earth}`,                           // borde interior
                boxShadow: `0 0 0 10px ${THEME.sun}, 0 0 0 16px ${THEME.earth}`, // marco doble
                maxWidth: 640,
                width: "100%",
              }}
            >
              <h2 style={{ textAlign: "center", fontWeight: 900, fontSize: 28, marginBottom: 12 }}>
                BEN FET!
              </h2>
              <p style={{ textAlign: "center", marginBottom: 12 }}>
                Puntuació final: <strong>{score}</strong> punts
              </p>
              <ul style={{ paddingLeft: 20 }}>
                {roundResults.map((r, idx) => (
                  <li key={idx} style={{ marginBottom: 6 }}>
                    {r.name} — {r.points} pts
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 16, display: "flex", justifyContent: "center" }}>
                <button
                  onClick={restart}
                  style={{
                    padding: "10px 16px",
                    background: THEME.sky,
                    color: THEME.earth,
                    fontWeight: 800,
                    borderRadius: 10,
                    border: `2px solid ${THEME.earth}`,
                    cursor: "pointer",
                  }}
                >
                  Reiniciar
                </button>
              </div>
            </div>
          </Frame>
        </div>
      )}
    </div>
  );
}
