import { useRef, useEffect } from "react";
import { useMriStore, selectActiveSeries, selectActiveInstance } from "./store/useMriStore";
import { ViewportCanvas } from "./components/Viewport/ViewportCanvas";
import { Toast } from "./components/Toast";
import { formatStudyDate } from "./utils/formatters";

// ─── Upload screen ────────────────────────────────────────────────────────────

function UploadScreen() {
  const uploadStudy = useMriStore((s) => s.uploadStudy);
  const error = useMriStore((s) => s.error);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    if (file.name.toLowerCase().endsWith(".zip")) {
      uploadStudy(file);
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-gray-950 gap-6">
      <div className="text-blue-400 text-2xl font-bold tracking-tight">MRI Viewer</div>
      <div
        className="flex flex-col items-center justify-center w-80 h-48 border-2 border-dashed border-gray-700 rounded-xl text-gray-500 cursor-pointer hover:border-blue-600 hover:text-gray-400 transition-colors"
        onClick={() => inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <div className="text-4xl mb-3">📂</div>
        <div className="text-sm font-medium">Drop a DICOM ZIP here</div>
        <div className="text-xs mt-1">or click to select file</div>
      </div>
      {error && (
        <div className="text-red-400 text-xs bg-red-950 border border-red-800 rounded px-3 py-2 max-w-sm text-center">
          {error}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={onInputChange}
      />
    </div>
  );
}

// ─── Processing screen ────────────────────────────────────────────────────────

function ProcessingScreen() {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-gray-950 gap-4">
      <div className="text-blue-400 text-2xl font-bold tracking-tight">MRI Viewer</div>
      <div className="text-gray-400 text-sm">Processing study…</div>
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-blue-500 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Series selector with per-series streaming progress ───────────────────────

function SeriesSelector() {
  const study = useMriStore((s) => s.study);
  const activeSeriesUid = useMriStore((s) => s.activeSeriesUid);
  const selectSeries = useMriStore((s) => s.selectSeries);
  const seriesLoadProgress = useMriStore((s) => s.seriesLoadProgress);

  if (!study || study.series.length === 0) return null;

  return (
    <div className="flex gap-1 px-3 py-2 bg-gray-900 border-b border-gray-800 overflow-x-auto shrink-0">
      {study.series.map((s) => {
        const active = s.series_uid === activeSeriesUid;
        const loaded = seriesLoadProgress[s.series_uid] ?? 0;
        const total = s.instances.length;
        const pct = total > 0 ? Math.round((loaded / total) * 100) : 100;
        const done = pct >= 100;

        return (
          <button
            key={s.series_uid}
            onClick={() => selectSeries(s.series_uid)}
            className={`relative shrink-0 px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap overflow-hidden ${
              active
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white"
            }`}
          >
            {/* Streaming progress fill */}
            {!done && (
              <div
                className={`absolute inset-0 rounded ${active ? "bg-blue-700/40" : "bg-gray-700/60"}`}
                style={{ width: `${pct}%`, transition: "width 0.2s ease" }}
              />
            )}
            <span className="relative">
              {s.inferred.display_label}
              <span className={`ml-1.5 text-[10px] ${active ? "text-blue-200" : "text-gray-500"}`}>
                {done ? total : `${loaded}/${total}`}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Slice scrubber ───────────────────────────────────────────────────────────

function SliceScrubber() {
  const activeSeries = useMriStore(selectActiveSeries);
  const activeInstance = useMriStore(selectActiveInstance);
  const activeSliceIndex = useMriStore((s) => s.activeSliceIndex);
  const setSliceIndex = useMriStore((s) => s.setSliceIndex);
  const nextSlice = useMriStore((s) => s.nextSlice);
  const prevSlice = useMriStore((s) => s.prevSlice);

  if (!activeSeries || activeSeries.instances.length === 0) return null;

  const total = activeSeries.instances.length;
  const inst = activeInstance;
  const allInst = activeSeries.instances;
  const minPos = allInst[0]?.slice_position ?? 0;
  const maxPos = allInst[total - 1]?.slice_position ?? 0;

  return (
    <div className="shrink-0 bg-gray-950 border-t border-gray-800">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={prevSlice}
          className="w-7 h-7 flex items-center justify-center rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm shrink-0"
          title="Previous slice (←)"
        >
          ‹
        </button>

        <input
          type="range"
          min={0}
          max={total - 1}
          value={activeSliceIndex}
          onChange={(e) => setSliceIndex(parseInt(e.target.value))}
          className="flex-1 min-w-0"
        />

        <button
          onClick={nextSlice}
          className="w-7 h-7 flex items-center justify-center rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm shrink-0"
          title="Next slice (→)"
        >
          ›
        </button>

        <span className="text-xs text-gray-400 tabular-nums shrink-0 w-16 text-right">
          {activeSliceIndex + 1} / {total}
        </span>

        {inst && (
          <div className="text-xs text-gray-600 tabular-nums shrink-0 hidden sm:block">
            {inst.slice_position.toFixed(1)} mm
            <span className="text-gray-700 ml-1">
              ({minPos.toFixed(0)}–{maxPos.toFixed(0)})
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

function Toolbar() {
  const viewport = useMriStore((s) => s.viewport);
  const setZoom = useMriStore((s) => s.setZoom);
  const resetViewport = useMriStore((s) => s.resetViewport);
  const resetWindowLevel = useMriStore((s) => s.resetWindowLevel);
  const toggleInvert = useMriStore((s) => s.toggleInvert);
  const setCinePlaying = useMriStore((s) => s.setCinePlaying);
  const activeSeries = useMriStore(selectActiveSeries);

  const btn =
    "px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors";
  const activeBtn =
    "px-2 py-1 text-xs rounded bg-blue-900 text-blue-200 border border-blue-700 transition-colors";

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 bg-gray-900 border-b border-gray-800 shrink-0 flex-wrap">
      <button className={btn} onClick={() => setZoom(viewport.zoom * 1.2)} title="Zoom In (+)">
        +
      </button>
      <button className={btn} onClick={() => setZoom(viewport.zoom / 1.2)} title="Zoom Out (-)">
        −
      </button>
      <button
        className={btn}
        onClick={() => {
          resetViewport();
          resetWindowLevel();
        }}
        title="Reset (R)"
      >
        Reset
      </button>
      <button
        className={viewport.invert ? activeBtn : btn}
        onClick={toggleInvert}
        title="Invert (I)"
      >
        Invert
      </button>
      {activeSeries && (
        <button
          className={viewport.isPlaying ? activeBtn : btn}
          onClick={() => setCinePlaying(!viewport.isPlaying)}
          title="Cine (Space)"
        >
          {viewport.isPlaying ? "⏸" : "▶"} Cine
        </button>
      )}
      <div className="ml-auto text-[10px] text-gray-700 hidden md:block">
        Right-drag: W/L · Left-drag: Pan · Wheel: scroll · Ctrl+Wheel: zoom
      </div>
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

function Header() {
  const study = useMriStore((s) => s.study);
  const uploadStudy = useMriStore((s) => s.uploadStudy);
  const exportAllSeries = useMriStore((s) => s.exportAllSeries);
  const seriesLoadProgress = useMriStore((s) => s.seriesLoadProgress);
  const inputRef = useRef<HTMLInputElement>(null);

  const totalLoaded = study
    ? study.series.reduce((acc, s) => acc + (seriesLoadProgress[s.series_uid] ?? 0), 0)
    : 0;
  const totalSlices = study
    ? study.series.reduce((acc, s) => acc + s.instances.length, 0)
    : 0;
  const allLoaded = totalSlices > 0 && totalLoaded >= totalSlices;

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      uploadStudy(file);
      e.target.value = "";
    }
  }

  return (
    <header className="flex items-center gap-3 px-4 py-2 bg-gray-900 border-b border-gray-700 shrink-0">
      <span className="text-sm font-bold text-blue-400">MRI Viewer</span>
      {study && (
        <>
          <span className="text-xs text-gray-400 hidden sm:block truncate">
            {study.study_description ?? "MR Study"}
          </span>
          <span className="text-xs text-gray-600 shrink-0">{formatStudyDate(study.study_date)}</span>
          <span className="text-xs text-gray-600 shrink-0">
            {study.series.length} series ·{" "}
            {study.series.reduce((a, s) => a + s.instances.length, 0)} slices
          </span>
        </>
      )}
      <div className="ml-auto flex items-center gap-2">
        {study && (
          <button
            className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700 transition-colors disabled:opacity-40"
            onClick={exportAllSeries}
            title={allLoaded ? "Export all series as ZIP" : `Loading… ${totalLoaded}/${totalSlices}`}
          >
            {allLoaded ? "Export ZIP" : `Export (${totalLoaded}/${totalSlices})`}
          </button>
        )}
        <button
          className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700 transition-colors"
          onClick={() => inputRef.current?.click()}
          title="Load new ZIP"
        >
          Load ZIP
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={onInputChange}
        />
      </div>
    </header>
  );
}

// ─── Keyboard shortcuts + cine playback ──────────────────────────────────────

function useViewerKeys() {
  const viewport = useMriStore((s) => s.viewport);
  const nextSlice = useMriStore((s) => s.nextSlice);
  const prevSlice = useMriStore((s) => s.prevSlice);
  const setZoom = useMriStore((s) => s.setZoom);
  const toggleInvert = useMriStore((s) => s.toggleInvert);
  const resetViewport = useMriStore((s) => s.resetViewport);
  const resetWindowLevel = useMriStore((s) => s.resetWindowLevel);
  const setCinePlaying = useMriStore((s) => s.setCinePlaying);
  const cineIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cine playback
  useEffect(() => {
    if (viewport.isPlaying) {
      const interval = Math.round(1000 / viewport.playFps);
      cineIntervalRef.current = setInterval(nextSlice, interval);
    } else {
      if (cineIntervalRef.current) {
        clearInterval(cineIntervalRef.current);
        cineIntervalRef.current = null;
      }
    }
    return () => {
      if (cineIntervalRef.current) clearInterval(cineIntervalRef.current);
    };
  }, [viewport.isPlaying, viewport.playFps, nextSlice]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
          e.preventDefault();
          nextSlice();
          break;
        case "ArrowLeft":
        case "ArrowUp":
          e.preventDefault();
          prevSlice();
          break;
        case "i":
          toggleInvert();
          break;
        case "r":
          resetViewport();
          resetWindowLevel();
          break;
        case " ":
          e.preventDefault();
          setCinePlaying(!viewport.isPlaying);
          break;
        case "+":
        case "=":
          setZoom(viewport.zoom * 1.2);
          break;
        case "-":
          setZoom(viewport.zoom / 1.2);
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [viewport, nextSlice, prevSlice, toggleInvert, resetViewport, resetWindowLevel, setCinePlaying, setZoom]);
}

// ─── Main viewer layout ───────────────────────────────────────────────────────

function Viewer() {
  useViewerKeys();
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-950">
      <Header />
      <SeriesSelector />
      <Toolbar />
      <div className="flex-1 min-h-0 flex flex-col">
        <ViewportCanvas />
      </div>
      <SliceScrubber />
      <Toast />
    </div>
  );
}

// ─── App root ─────────────────────────────────────────────────────────────────

export default function App() {
  const uploadState = useMriStore((s) => s.uploadState);

  if (uploadState === "idle") return <UploadScreen />;
  if (uploadState === "uploading") return <ProcessingScreen />;
  return <Viewer />;
}
