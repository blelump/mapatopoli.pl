import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  LayersControl,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const { BaseLayer } = LayersControl;

const STATUS_COLORS = {
  healthy: "#2e7d32",
  declining: "#ef6c00",
  dead: "#b71c1c",
  unknown: "#616161",
};

const STATUS_LABELS = {
  healthy: "Zdrowe",
  declining: "Zamierające",
  dead: "Martwe",
  unknown: "Nieznane",
};

const SPECIES_LABELS = {
  nigra: "Topola czarna",
  alba: "Topola biała",
  unknown: "Nieznane",
};

const ALL_SPECIES = Object.keys(SPECIES_LABELS);
const ALL_STATUSES = Object.keys(STATUS_LABELS);
const TREES_URL = "/trees.json";

function useHashRouter() {
  const [hash, setHash] = useState(window.location.hash.slice(1) || "/");

  useEffect(() => {
    function onHashChange() {
      setHash(window.location.hash.slice(1) || "/");
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = useCallback((path) => {
    window.location.hash = path;
  }, []);

  const route = hash.startsWith("/tree/") ? "/" : hash;
  const focusedTreeId = hash.startsWith("/tree/") ? hash.slice(6) : null;

  return { route, focusedTreeId, navigate };
}

function AboutPage() {
  return (
    <section className="px-3 py-12 md:px-6 md:py-20">
      <div className="mx-auto max-w-2xl">
        <h1 className="mt-6 text-4xl font-semibold tracking-tight md:text-5xl">Dlaczego to robimy?</h1>
        <div className="mt-8 space-y-6 text-base leading-7 text-stone-600 md:text-lg md:leading-8">
          <p>
            Ta strona powstała, by w jednym miejscu zebrać i udokumentować stanowiska topoli —
            czarnej i białej — rosnących w Polsce. Chodzi o drzewa dojrzałe, stare i zamierające,
            które często nie mają żadnej formalnej ochrony, a są kluczowym elementem ekosystemów
            rzecznych i lasów łęgowych.
          </p>
          <p>
            Topola czarna (<em>Populus nigra</em>) to gatunek rodzimy, związany z dolinami
            największych polskich rzek — Wisły, Odry, Warty, Bugu i Narwi. Jej populacje
            kurczą się z powodu regulacji rzek, wycinki i presji urbanistycznej. Podobnie
            topola biała (<em>Populus alba</em>), choć pospolitsza, traci swoje naturalne
            siedliska.
          </p>
          <p>
            Mapa ma ułatwić inwentaryzację — każdy może dodać stanowisko, przypisać mu
            status kondycji i dołączyć zdjęcia. W ten sposób powstaje wspólna, otwarta baza
            wiedzy o tych drzewach.
          </p>
          <p>
            Projekt jest statyczny — nie wymaga serwera, backendu ani bazy danych. Wszystko
            żyje w jednym pliku JSON i katalogach ze zdjęciami. Możesz go hostować gdziekolwiek,
            a dane edytować zwykłym edytorem tekstu.
          </p>
        </div>
      </div>
    </section>
  );
}

function normalizeSpecies(value) {
  const normalized = String(value ?? "unknown").trim().toLowerCase();
  return SPECIES_LABELS[normalized] ? normalized : "unknown";
}

function normalizeStatus(value) {
  const normalized = String(value ?? "unknown").trim().toLowerCase();
  return STATUS_COLORS[normalized] ? normalized : "unknown";
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim().replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeTree(rawTree, index) {
  const source = rawTree && typeof rawTree === "object" ? rawTree : {};
  const speciesCode = normalizeSpecies(source.species_code ?? source.speciesCode);
  const status = normalizeStatus(source.status);

  return {
    id: String(source.id ?? `tree-${index}`),
    name: String(source.name ?? `Drzewo ${index + 1}`),
    species: String(source.species ?? SPECIES_LABELS[speciesCode]),
    species_code: speciesCode,
    status,
    lat: toNumber(source.lat ?? source.latitude),
    lng: toNumber(source.lng ?? source.lon ?? source.longitude),
    river_valley: String(source.river_valley ?? source.riverValley ?? "—"),
    notes: String(source.notes ?? "―"),
    photos: Array.isArray(source.photos)
      ? source.photos.filter((p) => typeof p === "string").map((p) => `/photos/${String(source.id ?? `tree-${index}`)}/${p}`)
      : [],
  };
}

function isRenderableTree(tree) {
  return Number.isFinite(tree?.lat) && Number.isFinite(tree?.lng);
}

function markerIcon(tree) {
  const species = normalizeSpecies(tree.species_code);
  const status = normalizeStatus(tree.status);
  const color = STATUS_COLORS[status] ?? STATUS_COLORS.unknown;


  const radius = species === "alba" ? "4px" : "999px";

  return L.divIcon({
    className: "",
    html: `<div style="width:18px;height:18px;border-radius:${radius};background:${color};border:2px solid rgba(255,255,255,.96);box-shadow:0 0 0 2px rgba(0,0,0,.18),0 8px 14px rgba(0,0,0,.18);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  });
}

function FitBounds({ trees, skipFocus }) {
  const map = useMap();

  useEffect(() => {
    if (skipFocus) return;
    const timer = window.setTimeout(() => {
      map.invalidateSize();

      const points = trees.filter(isRenderableTree).map((tree) => [tree.lat, tree.lng]);
      if (points.length === 1) {
        map.setView(points[0], 12);
      } else if (points.length > 1) {
        map.fitBounds(points, { padding: [40, 40], maxZoom: 12 });
      }
    }, 80);

    return () => window.clearTimeout(timer);
  }, [map, trees, skipFocus]);

  return null;
}

function FocusTree({ treeId, trees, programmaticPopup }) {
  const map = useMap();

  useEffect(() => {
    if (!treeId) return;
    const tree = trees.find((t) => t.id === treeId);
    if (!tree || !isRenderableTree(tree)) return;

    const timer = window.setTimeout(() => {
      programmaticPopup.current = true;
      map.setView([tree.lat, tree.lng], 14, { animate: true });
      map.eachLayer((layer) => {
        if (layer.getLatLng) {
          const ll = layer.getLatLng();
          if (Math.abs(ll.lat - tree.lat) < 0.0001 && Math.abs(ll.lng - tree.lng) < 0.0001) {
            layer.openPopup();
          }
        }
      });
      setTimeout(() => { programmaticPopup.current = false; }, 100);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [map, treeId, trees, programmaticPopup]);

  return null;
}

function ChipFilter({ value, label, checked, onChange, children }) {
  return (
    <label
      className={[
        "inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition",
        checked
          ? "border-green-900/25 bg-green-900/10 text-stone-950 shadow-inner"
          : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50",
      ].join(" ")}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={() => onChange(value)}
      />
      {children}
      <span>{label}</span>
    </label>
  );
}

function ShapeIcon({ species }) {
  if (species === "unknown") {
    return (
      <span className="h-0 w-0 border-x-[7px] border-b-[13px] border-x-transparent border-b-stone-600" />
    );
  }

  return (
    <span
      className={`h-3 w-3 bg-stone-600 ${
        species === "alba" ? "rounded-[3px]" : "rounded-full"
      }`}
    />
  );
}

function ColorDot({ status }) {
  return (
    <span
      className="h-3 w-3 rounded-full"
      style={{ backgroundColor: STATUS_COLORS[status] }}
    />
  );
}

function PhotoLightbox({ tree, onClose }) {
  const [index, setIndex] = useState(0);
  const photos = tree.photos ?? [];

  if (photos.length === 0) return null;

  function prev() {
    setIndex((i) => (i - 1 + photos.length) % photos.length);
  }

  function next() {
    setIndex((i) => (i + 1) % photos.length);
  }

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/85 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full flex-col items-center justify-center p-4 md:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex w-full items-center justify-between text-sm text-white/70 md:mb-2">
          <span>{tree.name} · {index + 1}/{photos.length}</span>
          <button className="text-2xl text-white/80 hover:text-white" onClick={onClose}>✕</button>
        </div>

        <div className="relative flex flex-1 items-center justify-center overflow-hidden">
          <img
            src={photos[index]}
            alt={`${tree.name} — zdjęcie ${index + 1}`}
            className="max-h-[70vh] max-w-full rounded-lg object-contain md:rounded-xl"
          />
        </div>

        {photos.length > 1 && (
          <div className="mt-3 flex w-full items-center justify-center gap-3">
            <button
              className="shrink-0 rounded-full bg-white/15 px-3 py-2 text-sm text-white hover:bg-white/25 md:px-4"
              onClick={prev}
            >
              ←
            </button>
            <div className="flex flex-wrap justify-center gap-1.5">
              {photos.map((_, i) => (
                <button
                  key={i}
                  className={`h-2 rounded-full transition ${i === index ? "w-6 bg-white" : "w-2 bg-white/40"}`}
                  onClick={() => setIndex(i)}
                />
              ))}
            </div>
            <button
              className="shrink-0 rounded-full bg-white/15 px-3 py-2 text-sm text-white hover:bg-white/25 md:px-4"
              onClick={next}
            >
              →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function runNormalizationTests() {
  const cases = [
    [
      { lat: "52,1", lng: "19.4" },
      { species_code: "unknown", status: "unknown", lat: 52.1, lng: 19.4 },
    ],
    [
      { species_code: "NIGRA", status: "HEALTHY", lat: 52, lng: 21 },
      { species_code: "nigra", status: "healthy", lat: 52, lng: 21 },
    ],
    [
      { speciesCode: "alba", status: "declining", latitude: "50.1", longitude: "18.2" },
      { species_code: "alba", status: "declining", lat: 50.1, lng: 18.2 },
    ],
    [
      { species_code: "bad", status: "bad", lat: null, lng: undefined },
      { species_code: "unknown", status: "unknown", lat: null, lng: null },
    ],
    [null, { species_code: "unknown", status: "unknown", lat: null, lng: null }],
    [
      { species_code: "hybrid", status: "dead", lat: "53.12", lon: "23.16" },
      { species_code: "hybrid", status: "dead", lat: 53.12, lng: 23.16 },
    ],
  ];

  cases.forEach(([input, expected], index) => {
    const result = normalizeTree(input, index);
    for (const key of Object.keys(expected)) {
      if (!Object.is(result[key], expected[key])) {
        console.error("Normalization test failed", { index, key, result, expected });
      }
    }
  });
}

if (typeof window !== "undefined" && window.location.hostname === "localhost") {
  runNormalizationTests();
}

export default function App() {
  const { route, focusedTreeId, navigate } = useHashRouter();
  const [trees, setTrees] = useState([]);
  const [error, setError] = useState("");
  const [speciesFilter, setSpeciesFilter] = useState(() => new Set(ALL_SPECIES));
  const [statusFilter, setStatusFilter] = useState(() => new Set(ALL_STATUSES));
  const [selectedTree, setSelectedTree] = useState(null);
  const programmaticPopup = useRef(false);

  useEffect(() => {
    let cancelled = false;

    fetch(TREES_URL, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Nie udało się wczytać ${TREES_URL}`);

        const text = await response.text();
        if (text.trim().startsWith("<")) {
          throw new Error(
            "trees.json zwraca HTML zamiast JSON. Plik prawdopodobnie nie leży w public/trees.json",
          );
        }
        return JSON.parse(text);
      })
      .then((data) => {
        if (cancelled) return;
        setTrees(Array.isArray(data) ? data.map(normalizeTree) : []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const renderableTrees = useMemo(() => trees.filter(isRenderableTree), [trees]);

  const visibleTrees = useMemo(() => {
    return renderableTrees.filter(
      (tree) => speciesFilter.has(tree.species_code) && statusFilter.has(tree.status),
    );
  }, [renderableTrees, speciesFilter, statusFilter]);

  const skippedCount = trees.length - renderableTrees.length;

  function toggleSpecies(value) {
    setSpeciesFilter((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function toggleStatus(value) {
    setStatusFilter((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function showAll() {
    setSpeciesFilter(new Set(ALL_SPECIES));
    setStatusFilter(new Set(ALL_STATUSES));
  }

  function hideAll() {
    setSpeciesFilter(new Set());
    setStatusFilter(new Set());
  }

  return (
    <main className="min-h-screen text-stone-950">
      <header className="border-b border-stone-200/80 bg-stone-100/80 backdrop-blur md:sticky md:top-0 md:z-[1000]">
        <div className="flex flex-col gap-3 px-3 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <a href="#/" className="flex items-center gap-3 font-bold tracking-tight">
            <span className="logo-dot h-3 w-3 rounded-full bg-green-900" />
            Mapa topoli
          </a>
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-stone-600">
            <a href="#/" className="hover:text-stone-950">Mapa</a>
            <a href="#/dlaczego-to-robimy" className="hover:text-stone-950">Dlaczego to robimy?</a>
          </nav>
        </div>
      </header>

      {route === "/dlaczego-to-robimy" ? (
        <AboutPage />
      ) : (
        <>
      <section
        id="o-gatunku"
        className="grid gap-7 px-3 py-8 md:grid-cols-[1fr_360px] md:items-end md:px-6 md:py-12"
      >
        <div>
          <div className="inline-flex rounded-full border border-green-900/15 bg-green-900/10 px-3 py-1.5 text-xs font-extrabold uppercase tracking-widest text-green-950">
            Populus nigra
          </div>
          <div className="ml-2 inline-flex rounded-full border border-green-900/15 bg-green-900/10 px-3 py-1.5 text-xs font-extrabold uppercase tracking-widest text-green-950">
            Populus alba
          </div>
          <h1 className="mt-5 max-w-4xl text-5xl font-semibold leading-[.96] tracking-[-0.055em] md:text-7xl">
            Stanowiska topoli w Polsce
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-stone-600 md:text-lg">
Zbieranie i dokumentowanie stanowisk topoli — czarnej i białej.
Stare, dojrzałe i zamierające drzewa w jednym miejscu.
          </p>
          <button
            className="mt-5 rounded-full border border-green-900/25 bg-green-900/10 px-5 py-2.5 text-sm font-semibold text-green-950 transition hover:bg-green-900/20"
            onClick={() => navigate("/dlaczego-to-robimy")}
          >
            Dlaczego to robimy?
          </button>
        </div>

      </section>

      <section id="mapa" className="w-full px-3 py-6 md:px-6">
        <div className="mb-4">
          <h2 className="text-3xl font-semibold tracking-tight">Mapa stanowisk</h2>
        </div>

        <div className="flex flex-col gap-4 md:flex-row">
          <div className="min-w-0 flex-1">
            <div className="relative w-full overflow-hidden rounded-2xl border border-stone-200 shadow-xl">

              {error ? (
                <div className="flex h-[60vh] items-center justify-center p-6 text-center text-sm text-stone-600">
                  {error}
                </div>
              ) : (
                <MapContainer
                  center={[52.1, 19.4]}
                  zoom={6}
                  scrollWheelZoom
                  className="h-[60vh] w-full md:h-[70vh] lg:h-[78vh]"
                >
                  <LayersControl position="topright">
                    <BaseLayer checked name="Mapa OSM">
                      <TileLayer
                        maxZoom={19}
                        attribution="&copy; OpenStreetMap contributors"
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                    </BaseLayer>

                    <BaseLayer name="Ortofotomapa (Esri)">
                      <TileLayer
                        maxZoom={19}
                        attribution="Tiles &copy; Esri"
                        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                      />
                    </BaseLayer>
                  </LayersControl>

                  <FitBounds trees={visibleTrees} skipFocus={!!focusedTreeId} />
                  <FocusTree treeId={focusedTreeId} trees={visibleTrees} programmaticPopup={programmaticPopup} />

                  {visibleTrees.map((tree) => (
                    <Marker
                      key={tree.id}
                      position={[tree.lat, tree.lng]}
                      icon={markerIcon(tree)}
                      eventHandlers={{
                        popupopen: () => {
                          if (!programmaticPopup.current) {
                            window.location.hash = `/tree/${tree.id}`;
                          }
                        },
                      }}
                    >
                      <Popup>
                        <div className="space-y-1 text-sm">
                          <div><strong>Gatunek:</strong> {tree.species}</div>
                          <div><strong>Status:</strong> {STATUS_LABELS[tree.status]}</div>
                          <div><strong>Współrzędne:</strong> {tree.lat.toFixed(5)}, {tree.lng.toFixed(5)}</div>
                          <div><strong>Uwagi:</strong> {tree.notes}</div>
                          {tree.photos[0] && (
                            <img
                              src={tree.photos[0]}
                              alt={tree.name}
                              className="mt-1 h-32 w-full rounded-lg object-contain bg-stone-100"
                            />
                          )}
                          {tree.photos.length > 0 && (
                            <button
                              className="mt-2 rounded-lg border px-3 py-1 text-sm"
                              onClick={() => setSelectedTree(tree)}
                            >
                              Zobacz zdjęcia
                            </button>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              )}
            </div>
          </div>

          <div className="md:w-72 lg:w-80 shrink-0">
            <div className="rounded-3xl border border-stone-200 bg-white/85 p-4 shadow-sm">
              <h3 className="text-base font-bold">Filtry</h3>

              <div className="mt-3 grid gap-4">
                <div>
                  <div className="mb-2 text-xs font-bold uppercase">Gatunek</div>
                  <div className="flex flex-wrap gap-2">
                    {ALL_SPECIES.map((species) => (
                      <ChipFilter
                        key={species}
                        value={species}
                        label={SPECIES_LABELS[species]}
                        checked={speciesFilter.has(species)}
                        onChange={toggleSpecies}
                      >
                        <ShapeIcon species={species} />
                      </ChipFilter>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs font-bold uppercase">Stan</div>
                  <div className="flex flex-wrap gap-2">
                    {ALL_STATUSES.map((status) => (
                      <ChipFilter
                        key={status}
                        value={status}
                        label={STATUS_LABELS[status]}
                        checked={statusFilter.has(status)}
                        onChange={toggleStatus}
                      >
                        <ColorDot status={status} />
                      </ChipFilter>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button className="rounded-xl border px-3 py-2 text-sm" onClick={showAll}>
                  Pokaż wszystko
                </button>
                <button className="rounded-xl border px-3 py-2 text-sm" onClick={hideAll}>
                  Ukryj wszystko
                </button>

                <div className="ml-auto text-sm text-stone-600">
                  {visibleTrees.length} punktów
                  {skippedCount > 0 ? ` · pominięto bez współrzędnych: ${skippedCount}` : ""}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
        </>
      )}

      {selectedTree && (
        <PhotoLightbox tree={selectedTree} onClose={() => setSelectedTree(null)} />
      )}
    </main>
  );
}
