import React, { useState, useEffect, useMemo, useCallback } from "react";
import Papa from "papaparse";
import {
  saveLibrary,
  loadLibrary,
  loadCompilationIndex,
  saveCompilationIndex,
  saveCompilation,
  loadCompilation,
  deleteCompilation,
} from "./storage.js";

/* ---------------------------------------------------------
   Bitácora — archivo personal de escuchas
   Paleta: papel kaki, tinta, verde seco, azul apagado, oro
--------------------------------------------------------- */

const TOKENS = {
  paper: "#E7E0C9",
  paperDeep: "#DCD3B4",
  ink: "#26221A",
  inkSoft: "#5B5443",
  green: "#3C4A34",
  blue: "#48626C",
  gold: "#B98B3E",
  rust: "#8C4A32",
  line: "#C9BF9E",
  white: "#F7F4E9",
};

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function fmtDate(d) {
  if (!d) return "";
  try {
    return new Intl.DateTimeFormat("es-CL", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);
  } catch {
    return "";
  }
}

function fmtMinutes(ms) {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h} h ${m} min`;
}

/* ---------- Parsing helpers ---------- */

function parseJSONFile(text) {
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error("El JSON no contiene una lista de reproducciones.");
  return data;
}

function parseCSVFile(text) {
  const res = Papa.parse(text, { header: true, skipEmptyLines: true });
  return res.data;
}

function detectHeaders(rows) {
  const set = new Set();
  rows.slice(0, 50).forEach((r) => Object.keys(r).forEach((k) => set.add(k)));
  return Array.from(set);
}

// Best-effort guess of which header maps to which field, based on common
// Spotify / Apple Music export field names. The user confirms afterward.
function guessMapping(headers) {
  const lower = headers.map((h) => h.toLowerCase());
  const find = (candidates) => {
    for (const c of candidates) {
      const idx = lower.findIndex((h) => h.includes(c));
      if (idx !== -1) return headers[idx];
    }
    return "";
  };
  return {
    track: find(["master_metadata_track_name", "trackname", "track name", "track description", "title", "song"]),
    artist: find(["master_metadata_album_artist_name", "artistname", "artist name", "artist"]),
    album: find(["master_metadata_album_album_name", "albumname", "album name", "album"]),
    date: find(["ts", "endtime", "end time", "event end timestamp", "date", "timestamp"]),
    msPlayed: find(["ms_played", "msplayed", "play duration milliseconds", "duration", "play duration"]),
  };
}

function buildLibrary(rawRows, mapping) {
  const plays = [];
  for (const row of rawRows) {
    const track = (row[mapping.track] || "").toString().trim();
    const artist = (row[mapping.artist] || "").toString().trim();
    if (!track || !artist) continue;
    const album = mapping.album ? (row[mapping.album] || "").toString().trim() : "";
    let date = null;
    if (mapping.date && row[mapping.date]) {
      const d = new Date(row[mapping.date]);
      if (!isNaN(d.getTime())) date = d.toISOString();
    }
    let ms = 0;
    if (mapping.msPlayed && row[mapping.msPlayed]) {
      const n = parseFloat(row[mapping.msPlayed]);
      if (!isNaN(n)) ms = n;
    }
    plays.push({ track, artist, album, date, ms });
  }
  return plays;
}

/* ---------- Aggregation ---------- */

function aggregate(plays, year) {
  const filtered = year
    ? plays.filter((p) => p.date && new Date(p.date).getFullYear() === year)
    : plays;

  const trackMap = new Map();
  const artistMap = new Map();

  for (const p of filtered) {
    const tKey = p.track + " — " + p.artist;
    if (!trackMap.has(tKey)) {
      trackMap.set(tKey, { track: p.track, artist: p.artist, plays: 0, ms: 0 });
    }
    const t = trackMap.get(tKey);
    t.plays += 1;
    t.ms += p.ms || 0;

    if (!artistMap.has(p.artist)) {
      artistMap.set(p.artist, { artist: p.artist, plays: 0, ms: 0 });
    }
    const a = artistMap.get(p.artist);
    a.plays += 1;
    a.ms += p.ms || 0;
  }

  const topTracks = Array.from(trackMap.values()).sort((a, b) => b.plays - a.plays);
  const topArtists = Array.from(artistMap.values()).sort((a, b) => b.plays - a.plays);

  return { topTracks, topArtists, totalPlays: filtered.length };
}

function getYears(plays) {
  const set = new Set();
  plays.forEach((p) => {
    if (p.date) set.add(new Date(p.date).getFullYear());
  });
  return Array.from(set).sort((a, b) => b - a);
}

/* ---------- UI atoms ---------- */

function Rule() {
  return <div style={{ height: 1, background: TOKENS.line, margin: "18px 0" }} />;
}

function Button({ children, onClick, variant = "primary", disabled, style }) {
  const base = {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 13,
    letterSpacing: "0.02em",
    padding: "10px 18px",
    borderRadius: 3,
    cursor: disabled ? "default" : "pointer",
    border: "1px solid " + TOKENS.ink,
    opacity: disabled ? 0.4 : 1,
    transition: "background 0.15s ease, color 0.15s ease",
  };
  const variants = {
    primary: { background: TOKENS.ink, color: TOKENS.paper },
    ghost: { background: "transparent", color: TOKENS.ink },
    quiet: { background: "transparent", color: TOKENS.inkSoft, border: "1px solid transparent" },
  };
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{ ...base, ...variants[variant], ...style }}
    >
      {children}
    </button>
  );
}

function Header({ view, setView, hasLibrary }) {
  const tabs = [
    { id: "dashboard", label: "Panel" },
    { id: "compilations", label: "Compilaciones" },
    { id: "import", label: "Importar" },
  ];
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h1
          style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontSize: 30,
            fontWeight: 500,
            color: TOKENS.ink,
            margin: 0,
          }}
        >
          Bitácora de escuchas
        </h1>
        <div style={{ display: "flex", gap: 4 }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              disabled={t.id !== "import" && !hasLibrary}
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 12,
                padding: "7px 12px",
                background: view === t.id ? TOKENS.ink : "transparent",
                color: view === t.id ? TOKENS.paper : t.id !== "import" && !hasLibrary ? TOKENS.line : TOKENS.inkSoft,
                border: "1px solid " + (view === t.id ? TOKENS.ink : TOKENS.line),
                borderRadius: 3,
                cursor: t.id !== "import" && !hasLibrary ? "default" : "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <Rule />
    </div>
  );
}

/* ---------- Import & mapping ---------- */

function ImportView({ onParsed }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleFiles = useCallback(async (fileList) => {
    setError("");
    setBusy(true);
    try {
      let allRows = [];
      for (const file of Array.from(fileList)) {
        const text = await file.text();
        const isCsv = file.name.toLowerCase().endsWith(".csv");
        const rows = isCsv ? parseCSVFile(text) : parseJSONFile(text);
        allRows = allRows.concat(rows);
      }
      if (allRows.length === 0) throw new Error("No se encontraron filas en los archivos.");
      onParsed(allRows);
    } catch (e) {
      setError(e.message || "No se pudo leer el archivo.");
    } finally {
      setBusy(false);
    }
  }, [onParsed]);

  return (
    <div>
      <p style={{ color: TOKENS.inkSoft, fontFamily: "'Fraunces', serif", fontSize: 16, lineHeight: 1.6, maxWidth: 560 }}>
        Sube los archivos que descargaste de Spotify (JSON) o Apple Music (CSV).
        Puedes seleccionar varios a la vez si tu historial viene en más de un archivo.
      </p>
      <label
        style={{
          display: "block",
          marginTop: 24,
          border: "1px dashed " + TOKENS.inkSoft,
          borderRadius: 4,
          padding: "36px 20px",
          textAlign: "center",
          cursor: "pointer",
          background: TOKENS.paperDeep,
        }}
      >
        <input
          type="file"
          accept=".json,.csv"
          multiple
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          style={{ display: "none" }}
        />
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: TOKENS.ink }}>
          {busy ? "Leyendo archivos…" : "Seleccionar archivos (.json / .csv)"}
        </div>
      </label>
      {error && (
        <div style={{ marginTop: 14, color: TOKENS.rust, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
          {error}
        </div>
      )}
    </div>
  );
}

function MappingView({ rawRows, onConfirm, onCancel }) {
  const headers = useMemo(() => detectHeaders(rawRows), [rawRows]);
  const [mapping, setMapping] = useState(() => guessMapping(headers));
  const preview = rawRows.slice(0, 3);

  const fields = [
    { key: "track", label: "Nombre de la canción", required: true },
    { key: "artist", label: "Artista", required: true },
    { key: "album", label: "Álbum (opcional)", required: false },
    { key: "date", label: "Fecha de reproducción", required: false },
    { key: "msPlayed", label: "Duración escuchada, en ms (opcional)", required: false },
  ];

  const canConfirm = mapping.track && mapping.artist;

  return (
    <div>
      <p style={{ color: TOKENS.inkSoft, fontFamily: "'Fraunces', serif", fontSize: 16, maxWidth: 560, lineHeight: 1.6 }}>
        Encontré {rawRows.length.toLocaleString("es-CL")} filas. Dime qué columna corresponde a cada campo
        para poder leer tu historial correctamente.
      </p>
      <div style={{ display: "grid", gap: 16, marginTop: 20, maxWidth: 480 }}>
        {fields.map((f) => (
          <div key={f.key}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: TOKENS.inkSoft, marginBottom: 5 }}>
              {f.label}{f.required ? " *" : ""}
            </div>
            <select
              value={mapping[f.key] || ""}
              onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
              style={{
                width: "100%",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 13,
                padding: "8px 10px",
                background: TOKENS.white,
                border: "1px solid " + TOKENS.line,
                borderRadius: 3,
                color: TOKENS.ink,
              }}
            >
              <option value="">— sin usar —</option>
              {headers.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {preview.length > 0 && (
        <div style={{ marginTop: 24, overflowX: "auto" }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: TOKENS.inkSoft, marginBottom: 8 }}>
            vista previa
          </div>
          <table style={{ borderCollapse: "collapse", fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" }}>
            <thead>
              <tr>
                {headers.slice(0, 6).map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "4px 10px 4px 0", color: TOKENS.inkSoft, borderBottom: "1px solid " + TOKENS.line }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i}>
                  {headers.slice(0, 6).map((h) => (
                    <td key={h} style={{ padding: "4px 10px 4px 0", color: TOKENS.ink, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {String(row[h] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 26 }}>
        <Button onClick={() => onConfirm(mapping)} disabled={!canConfirm}>Construir mi archivo</Button>
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
}

/* ---------- Dashboard ---------- */

function Dashboard({ plays, onStartCompilation }) {
  const years = useMemo(() => getYears(plays), [plays]);
  const [year, setYear] = useState(null);
  const { topTracks, topArtists, totalPlays } = useMemo(() => aggregate(plays, year), [plays, year]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 22 }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: TOKENS.inkSoft }}>
          {totalPlays.toLocaleString("es-CL")} reproducciones registradas{year ? ` en ${year}` : ""}
        </div>
        {years.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <button
              onClick={() => setYear(null)}
              style={pillStyle(year === null)}
            >todo</button>
            {years.map((y) => (
              <button key={y} onClick={() => setYear(y)} style={pillStyle(year === y)}>{y}</button>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 32 }}>
        <RankedList
          title="Canciones más escuchadas"
          items={topTracks.slice(0, 10).map((t, i) => ({
            rank: i + 1,
            primary: t.track,
            secondary: t.artist,
            meta: `${t.plays} reproducciones`,
          }))}
          accent={TOKENS.blue}
        />
        <RankedList
          title="Artistas más escuchados"
          items={topArtists.slice(0, 10).map((a, i) => ({
            rank: i + 1,
            primary: a.artist,
            secondary: "",
            meta: `${a.plays} reproducciones`,
          }))}
          accent={TOKENS.green}
        />
      </div>

      <Rule />
      <Button onClick={() => onStartCompilation(year)}>Crear compilación desde aquí</Button>
    </div>
  );
}

function pillStyle(active) {
  return {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12,
    padding: "5px 10px",
    borderRadius: 3,
    border: "1px solid " + (active ? TOKENS.ink : TOKENS.line),
    background: active ? TOKENS.ink : "transparent",
    color: active ? TOKENS.paper : TOKENS.inkSoft,
    cursor: "pointer",
  };
}

function RankedList({ title, items, accent }) {
  return (
    <div>
      <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 19, fontWeight: 500, color: TOKENS.ink, margin: "0 0 12px" }}>
        {title}
      </h2>
      <div>
        {items.map((it) => (
          <div
            key={it.rank}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 14,
              padding: "9px 0",
              borderBottom: "1px solid " + TOKENS.line,
            }}
          >
            <div
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: it.rank <= 3 ? 20 : 13,
                fontWeight: it.rank <= 3 ? 600 : 400,
                color: it.rank <= 3 ? accent : TOKENS.inkSoft,
                width: 30,
                flexShrink: 0,
              }}
            >
              {String(it.rank).padStart(2, "0")}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: it.rank <= 3 ? 17 : 15, color: TOKENS.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {it.primary}
              </div>
              {it.secondary && (
                <div style={{ fontSize: 12, color: TOKENS.inkSoft, fontFamily: "'IBM Plex Mono', monospace" }}>{it.secondary}</div>
              )}
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: TOKENS.inkSoft, flexShrink: 0 }}>
              {it.meta}
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div style={{ color: TOKENS.inkSoft, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, padding: "10px 0" }}>
            sin datos para este período
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Compilations ---------- */

function NewCompilationForm({ plays, defaultYear, onCreate, onCancel }) {
  const years = useMemo(() => getYears(plays), [plays]);
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("tracks");
  const [year, setYear] = useState(defaultYear || null);
  const [count, setCount] = useState(20);

  const handleCreate = () => {
    const { topTracks, topArtists } = aggregate(plays, year);
    const base = source === "tracks" ? topTracks : topArtists;
    const items = base.slice(0, count).map((it, i) => ({
      rank: i + 1,
      track: it.track || "",
      artist: it.artist,
      plays: it.plays,
      note: "",
    }));
    onCreate({
      id: uid(),
      title: title.trim() || "Compilación sin título",
      createdAt: new Date().toISOString(),
      year: year || null,
      source,
      note: "",
      items,
    });
  };

  return (
    <div>
      <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 22, color: TOKENS.ink, marginTop: 0 }}>Nueva compilación</h2>
      <div style={{ display: "grid", gap: 16, maxWidth: 440 }}>
        <div>
          <div style={labelStyle}>Título</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ej. lo que sonó ese invierno"
            style={inputStyle}
          />
        </div>
        <div>
          <div style={labelStyle}>Basado en</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setSource("tracks")} style={pillStyle(source === "tracks")}>canciones</button>
            <button onClick={() => setSource("artists")} style={pillStyle(source === "artists")}>artistas</button>
          </div>
        </div>
        <div>
          <div style={labelStyle}>Período</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setYear(null)} style={pillStyle(year === null)}>todo</button>
            {years.map((y) => (
              <button key={y} onClick={() => setYear(y)} style={pillStyle(year === y)}>{y}</button>
            ))}
          </div>
        </div>
        <div>
          <div style={labelStyle}>Cuántas posiciones</div>
          <input
            type="number"
            min={5}
            max={100}
            value={count}
            onChange={(e) => setCount(parseInt(e.target.value, 10) || 20)}
            style={{ ...inputStyle, width: 90 }}
          />
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 26 }}>
        <Button onClick={handleCreate}>Generar</Button>
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
}

const labelStyle = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 11,
  color: TOKENS.inkSoft,
  marginBottom: 5,
};

const inputStyle = {
  width: "100%",
  fontFamily: "'Fraunces', serif",
  fontSize: 15,
  padding: "9px 11px",
  background: TOKENS.white,
  border: "1px solid " + TOKENS.line,
  borderRadius: 3,
  color: TOKENS.ink,
  boxSizing: "border-box",
};

function CompilationsList({ index, onOpen, onNew, onDelete }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 22, color: TOKENS.ink, margin: 0 }}>Tus compilaciones</h2>
        <Button onClick={onNew}>Nueva</Button>
      </div>
      {index.length === 0 && (
        <p style={{ color: TOKENS.inkSoft, fontFamily: "'Fraunces', serif", fontSize: 15 }}>
          Todavía no guardas ninguna. Crea la primera desde el panel o con el botón de arriba.
        </p>
      )}
      <div>
        {index.map((c) => (
          <div
            key={c.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "14px 0",
              borderBottom: "1px solid " + TOKENS.line,
            }}
          >
            <div style={{ cursor: "pointer" }} onClick={() => onOpen(c.id)}>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 17, color: TOKENS.ink }}>{c.title}</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: TOKENS.inkSoft }}>
                {c.year || "todo el historial"} · {fmtDate(new Date(c.createdAt))}
              </div>
            </div>
            <Button variant="quiet" onClick={() => onDelete(c.id)}>eliminar</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompilationDetail({ comp, onSave, onBack }) {
  const [items, setItems] = useState(comp.items);
  const [note, setNote] = useState(comp.note || "");
  const [dirty, setDirty] = useState(false);

  const updateItemNote = (rank, value) => {
    setItems((arr) => arr.map((it) => (it.rank === rank ? { ...it, note: value } : it)));
    setDirty(true);
  };

  const handleSave = () => {
    onSave({ ...comp, items, note });
    setDirty(false);
  };

  return (
    <div>
      <Button variant="quiet" onClick={onBack} style={{ padding: "0 0 12px", border: "none" }}>← volver</Button>
      <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, color: TOKENS.ink, margin: "0 0 4px" }}>{comp.title}</h2>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: TOKENS.inkSoft, marginBottom: 18 }}>
        {comp.year || "todo el historial"} · {comp.source === "tracks" ? "canciones" : "artistas"}
      </div>

      <textarea
        value={note}
        onChange={(e) => { setNote(e.target.value); setDirty(true); }}
        placeholder="una nota general para esta compilación…"
        rows={3}
        style={{ ...inputStyle, resize: "vertical", marginBottom: 24 }}
      />

      <div>
        {items.map((it) => (
          <div key={it.rank} style={{ padding: "12px 0", borderBottom: "1px solid " + TOKENS.line }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: it.rank <= 3 ? 20 : 13,
                  fontWeight: it.rank <= 3 ? 600 : 400,
                  color: it.rank <= 3 ? TOKENS.gold : TOKENS.inkSoft,
                  width: 30,
                  flexShrink: 0,
                }}
              >
                {String(it.rank).padStart(2, "0")}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: it.rank <= 3 ? 17 : 15, color: TOKENS.ink }}>
                  {it.track || it.artist}
                </div>
                {it.track && (
                  <div style={{ fontSize: 12, color: TOKENS.inkSoft, fontFamily: "'IBM Plex Mono', monospace" }}>{it.artist}</div>
                )}
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: TOKENS.inkSoft }}>{it.plays} reprod.</div>
            </div>
            <input
              value={it.note}
              onChange={(e) => updateItemNote(it.rank, e.target.value)}
              placeholder="nota para esta posición…"
              style={{ ...inputStyle, marginTop: 8, fontSize: 13, padding: "6px 9px" }}
            />
          </div>
        ))}
      </div>

      <div style={{ marginTop: 22 }}>
        <Button onClick={handleSave} disabled={!dirty}>Guardar cambios</Button>
      </div>
    </div>
  );
}

/* ---------- Root ---------- */

export default function App() {
  const [loading, setLoading] = useState(true);
  const [library, setLibraryState] = useState(null); // { mapping, plays }
  const [rawRows, setRawRows] = useState(null);
  const [view, setView] = useState("import");
  const [compIndex, setCompIndex] = useState([]);
  const [openCompId, setOpenCompId] = useState(null);
  const [openComp, setOpenComp] = useState(null);
  const [creatingCompYear, setCreatingCompYear] = useState(undefined);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const lib = await loadLibrary();
        const idx = await loadCompilationIndex();
        if (lib) {
          setLibraryState(lib);
          setView("dashboard");
        }
        setCompIndex(idx);
      } catch (e) {
        setLoadError((e && e.message) || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleParsed = (rows) => setRawRows(rows);

  const handleMappingConfirm = async (mapping) => {
    const plays = buildLibrary(rawRows, mapping);
    await saveLibrary(mapping, plays);
    setLibraryState({ mapping, plays });
    setRawRows(null);
    setView("dashboard");
  };

  const handleCreateCompilation = async (comp) => {
    await saveCompilation(comp);
    const newIndex = [{ id: comp.id, title: comp.title, year: comp.year, createdAt: comp.createdAt }, ...compIndex];
    await saveCompilationIndex(newIndex);
    setCompIndex(newIndex);
    setCreatingCompYear(undefined);
    setOpenCompId(comp.id);
    setOpenComp(comp);
    setView("compilation-detail");
  };

  const handleOpenCompilation = async (id) => {
    const c = await loadCompilation(id);
    setOpenCompId(id);
    setOpenComp(c);
    setView("compilation-detail");
  };

  const handleSaveCompilation = async (comp) => {
    await saveCompilation(comp);
    setOpenComp(comp);
    const newIndex = compIndex.map((c) => (c.id === comp.id ? { ...c, title: comp.title } : c));
    await saveCompilationIndex(newIndex);
    setCompIndex(newIndex);
  };

  const handleDeleteCompilation = async (id) => {
    await deleteCompilation(id);
    const newIndex = compIndex.filter((c) => c.id !== id);
    await saveCompilationIndex(newIndex);
    setCompIndex(newIndex);
  };

  const hasLibrary = !!library;

  return (
    <div
      style={{
        fontFamily: "'Fraunces', Georgia, serif",
        background: TOKENS.paper,
        color: TOKENS.ink,
        minHeight: "100%",
        padding: "28px 22px 60px",
        boxSizing: "border-box",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        input:focus, textarea:focus, select:focus { outline: 2px solid ${TOKENS.blue}; outline-offset: 1px; }
        button:focus-visible { outline: 2px solid ${TOKENS.blue}; outline-offset: 1px; }
      `}</style>

      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <Header view={view} setView={setView} hasLibrary={hasLibrary} />

        {loading && (
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: TOKENS.inkSoft }}>cargando…</div>
        )}

        {loadError && (
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: TOKENS.rust, background: TOKENS.paperDeep, padding: 14, borderRadius: 4, marginBottom: 20 }}>
            Error al conectar con la base de datos:<br />{loadError}
          </div>
        )}

        {!loading && view === "import" && !rawRows && (
          <ImportView onParsed={handleParsed} />
        )}
        {!loading && view === "import" && rawRows && (
          <MappingView rawRows={rawRows} onConfirm={handleMappingConfirm} onCancel={() => setRawRows(null)} />
        )}

        {!loading && view === "dashboard" && hasLibrary && (
          <Dashboard
            plays={library.plays}
            onStartCompilation={(year) => { setCreatingCompYear(year); setView("new-compilation"); }}
          />
        )}

        {!loading && view === "new-compilation" && hasLibrary && (
          <NewCompilationForm
            plays={library.plays}
            defaultYear={creatingCompYear}
            onCreate={handleCreateCompilation}
            onCancel={() => setView("compilations")}
          />
        )}

        {!loading && view === "compilations" && (
          <CompilationsList
            index={compIndex}
            onOpen={handleOpenCompilation}
            onNew={() => { setCreatingCompYear(null); setView("new-compilation"); }}
            onDelete={handleDeleteCompilation}
          />
        )}

        {!loading && view === "compilation-detail" && openComp && (
          <CompilationDetail comp={openComp} onSave={handleSaveCompilation} onBack={() => setView("compilations")} />
        )}
      </div>
    </div>
  );
}
