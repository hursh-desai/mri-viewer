import { create } from "zustand";
import type { StudyResponse } from "../types/dicom";
import { buildImageUrl } from "../api/client";
import { defaultWindowLevel, clampWL } from "../utils/windowLevel";

export interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
  windowCenter: number;
  windowWidth: number;
  invert: boolean;
  isPlaying: boolean;
  playFps: number;
}

export type UploadState = "idle" | "uploading" | "ready";

interface MriStore {
  uploadState: UploadState;
  study: StudyResponse | null;
  error: string | null;

  // Per-series streaming image cache: seriesUid → blob URL per slice index (null = not yet received)
  seriesImages: Record<string, (string | null)[]>;
  seriesLoadProgress: Record<string, number>;
  // W/L actually used when encoding the streamed images for each series
  seriesWL: Record<string, { wc: number; ww: number }>;

  activeSeriesUid: string | null;
  activeSliceIndex: number;

  viewport: ViewportState;
  baseWC: number;
  baseWW: number;

  currentImageUrl: string | null;
  imageLoading: boolean;

  toast: { message: string; type: "error" | "info" } | null;

  uploadStudy: (file: File) => Promise<void>;
  selectSeries: (uid: string) => void;
  setSliceIndex: (index: number) => void;
  nextSlice: () => void;
  prevSlice: () => void;
  setWindowLevel: (wc: number, ww: number) => void;
  resetWindowLevel: () => void;
  setZoom: (zoom: number) => void;
  setPan: (dx: number, dy: number) => void;
  resetViewport: () => void;
  toggleInvert: () => void;
  setCinePlaying: (playing: boolean) => void;
  setPlayFps: (fps: number) => void;
  loadImage: (sopUid: string) => Promise<void>;
  exportAllSeries: () => Promise<void>;
  showToast: (message: string, type?: "error" | "info") => void;
  clearToast: () => void;
}

const DEFAULT_VIEWPORT: ViewportState = {
  zoom: 1,
  panX: 0,
  panY: 0,
  windowCenter: 500,
  windowWidth: 1000,
  invert: false,
  isPlaying: false,
  playFps: 8,
};

// Module-level state for async operations
const _eventSources: Record<string, EventSource> = {};
const _wlCache: Map<string, string> = new Map();
let _loadSeq = 0;
let _imageDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function _cacheKey(sopUid: string, wc: number, ww: number, invert: boolean): string {
  return `${sopUid}|${Math.round(wc)}|${Math.round(ww)}|${invert}`;
}

function _b64ToBlobUrl(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
}

function _startStreamForSeries(uid: string, wc: number, ww: number): void {
  if (_eventSources[uid]) {
    _eventSources[uid].close();
    delete _eventSources[uid];
  }

  const url = `/api/series/${encodeURIComponent(uid)}/stream?wc=${wc}&ww=${ww}`;
  const es = new EventSource(url);
  _eventSources[uid] = es;

  es.onmessage = (event) => {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(event.data as string);
    } catch {
      return;
    }

    if (data.done) {
      es.close();
      delete _eventSources[uid];
      return;
    }

    if (typeof data.index !== "number" || typeof data.image_b64 !== "string") return;

    const index = data.index as number;
    const blobUrl = _b64ToBlobUrl(data.image_b64 as string);
    const actualWc = data.wc as number;
    const actualWw = data.ww as number;

    useMriStore.setState((state) => {
      const existing = state.seriesImages[uid];
      if (!existing || existing[index]) return {}; // already have this slot

      const images = [...existing];
      images[index] = blobUrl;

      const newImages = { ...state.seriesImages, [uid]: images };
      const newProgress = {
        ...state.seriesLoadProgress,
        [uid]: (state.seriesLoadProgress[uid] || 0) + 1,
      };
      const newWL =
        index === 0
          ? { ...state.seriesWL, [uid]: { wc: actualWc, ww: actualWw } }
          : state.seriesWL;

      // If this is the slice the viewer is waiting for, show it immediately
      let currentImageUrl = state.currentImageUrl;
      let imageLoading = state.imageLoading;
      if (
        uid === state.activeSeriesUid &&
        index === state.activeSliceIndex &&
        !state.currentImageUrl
      ) {
        currentImageUrl = blobUrl;
        imageLoading = false;
      }

      return {
        seriesImages: newImages,
        seriesLoadProgress: newProgress,
        seriesWL: newWL,
        currentImageUrl,
        imageLoading,
      };
    });
  };

  es.onerror = () => {
    es.close();
    delete _eventSources[uid];
  };
}

export const useMriStore = create<MriStore>((set, get) => ({
  uploadState: "idle",
  study: null,
  error: null,
  seriesImages: {},
  seriesLoadProgress: {},
  seriesWL: {},
  activeSeriesUid: null,
  activeSliceIndex: 0,
  viewport: { ...DEFAULT_VIEWPORT },
  baseWC: 500,
  baseWW: 1000,
  currentImageUrl: null,
  imageLoading: false,
  toast: null,

  uploadStudy: async (file: File) => {
    // Close any open streams from previous study
    for (const uid of Object.keys(_eventSources)) {
      _eventSources[uid].close();
      delete _eventSources[uid];
    }
    _wlCache.clear();

    set({ uploadState: "uploading", error: null, study: null });

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      const study: StudyResponse = await res.json();

      // Init per-series image arrays
      const seriesImages: Record<string, (string | null)[]> = {};
      const seriesLoadProgress: Record<string, number> = {};
      for (const s of study.series) {
        seriesImages[s.series_uid] = new Array(s.instances.length).fill(null);
        seriesLoadProgress[s.series_uid] = 0;
      }

      set({
        uploadState: "ready",
        study,
        seriesImages,
        seriesLoadProgress,
        seriesWL: {},
      });

      // Select first series with images
      const firstSeries = study.series.find((s) => s.instances.length > 0);
      if (firstSeries) get().selectSeries(firstSeries.series_uid);

      // Start streaming all series concurrently
      for (const s of study.series) {
        if (s.instances.length > 0) {
          const wl = defaultWindowLevel(s);
          _startStreamForSeries(s.series_uid, wl.wc, wl.ww);
        }
      }
    } catch (e) {
      set({ uploadState: "idle", error: String(e) });
      get().showToast(`Upload failed: ${e}`, "error");
    }
  },

  selectSeries: (uid: string) => {
    const study = get().study;
    if (!study) return;
    const series = study.series.find((s) => s.series_uid === uid);
    if (!series || series.instances.length === 0) return;

    const wl = defaultWindowLevel(series);
    const cachedUrl = get().seriesImages[uid]?.[0] ?? null;

    set({
      activeSeriesUid: uid,
      activeSliceIndex: 0,
      viewport: { ...DEFAULT_VIEWPORT, windowCenter: wl.wc, windowWidth: wl.ww },
      baseWC: wl.wc,
      baseWW: wl.ww,
      currentImageUrl: cachedUrl,
      imageLoading: !cachedUrl,
    });
  },

  setSliceIndex: (index: number) => {
    const series = selectActiveSeries(get());
    if (!series) return;
    const clamped = Math.max(0, Math.min(series.instances.length - 1, index));
    if (clamped === get().activeSliceIndex) return;

    const { activeSeriesUid, seriesImages, viewport, baseWC, baseWW } = get();
    const uid = activeSeriesUid!;

    const isDefaultWL =
      Math.abs(viewport.windowCenter - baseWC) < 1 &&
      Math.abs(viewport.windowWidth - baseWW) < 1 &&
      !viewport.invert;

    const cachedUrl = isDefaultWL ? (seriesImages[uid]?.[clamped] ?? null) : null;

    if (cachedUrl) {
      set({ activeSliceIndex: clamped, currentImageUrl: cachedUrl, imageLoading: false });
    } else if (!isDefaultWL) {
      // W/L adjusted — on-demand fetch (keep showing current image while loading)
      set({ activeSliceIndex: clamped });
      const inst = series.instances[clamped];
      if (inst) get().loadImage(inst.sop_uid);
    } else {
      // Default W/L but not yet streamed — wait for SSE
      set({ activeSliceIndex: clamped, currentImageUrl: null, imageLoading: true });
    }
  },

  nextSlice: () => {
    const series = selectActiveSeries(get());
    if (!series) return;
    const next = (get().activeSliceIndex + 1) % series.instances.length;
    get().setSliceIndex(next);
  },

  prevSlice: () => {
    const series = selectActiveSeries(get());
    if (!series) return;
    const prev =
      (get().activeSliceIndex - 1 + series.instances.length) % series.instances.length;
    get().setSliceIndex(prev);
  },

  setWindowLevel: (wc: number, ww: number) => {
    const clamped = clampWL(wc, ww);
    set((state) => ({
      viewport: { ...state.viewport, windowCenter: clamped.wc, windowWidth: clamped.ww },
    }));
    if (_imageDebounceTimer) clearTimeout(_imageDebounceTimer);
    _imageDebounceTimer = setTimeout(() => {
      const inst = selectActiveInstance(get());
      if (inst) get().loadImage(inst.sop_uid);
    }, 80);
  },

  resetWindowLevel: () => {
    const { baseWC, baseWW } = get();
    const clamped = clampWL(baseWC, baseWW);
    set((state) => ({
      viewport: { ...state.viewport, windowCenter: clamped.wc, windowWidth: clamped.ww },
    }));
    // Switch back to streamed image if available
    const { activeSeriesUid, activeSliceIndex, seriesImages } = get();
    if (activeSeriesUid) {
      const cached = seriesImages[activeSeriesUid]?.[activeSliceIndex] ?? null;
      if (cached) {
        set({ currentImageUrl: cached, imageLoading: false });
        return;
      }
    }
    const inst = selectActiveInstance(get());
    if (inst) get().loadImage(inst.sop_uid);
  },

  setZoom: (zoom: number) => {
    set((state) => ({
      viewport: { ...state.viewport, zoom: Math.max(0.1, Math.min(20, zoom)) },
    }));
  },

  setPan: (dx: number, dy: number) => {
    set((state) => ({
      viewport: {
        ...state.viewport,
        panX: state.viewport.panX + dx,
        panY: state.viewport.panY + dy,
      },
    }));
  },

  resetViewport: () => {
    set((state) => ({
      viewport: { ...state.viewport, zoom: 1, panX: 0, panY: 0 },
    }));
  },

  toggleInvert: () => {
    set((state) => ({
      viewport: { ...state.viewport, invert: !state.viewport.invert },
    }));
    const inst = selectActiveInstance(get());
    if (inst) get().loadImage(inst.sop_uid);
  },

  setCinePlaying: (playing: boolean) => {
    set((state) => ({ viewport: { ...state.viewport, isPlaying: playing } }));
  },

  setPlayFps: (fps: number) => {
    set((state) => ({
      viewport: { ...state.viewport, playFps: Math.max(1, Math.min(30, fps)) },
    }));
  },

  loadImage: async (sopUid: string) => {
    const { viewport } = get();
    const seq = ++_loadSeq;

    const key = _cacheKey(sopUid, viewport.windowCenter, viewport.windowWidth, viewport.invert);
    if (_wlCache.has(key)) {
      set({ currentImageUrl: _wlCache.get(key)!, imageLoading: false });
      return;
    }

    set({ imageLoading: true });
    const url = buildImageUrl(sopUid, viewport.windowCenter, viewport.windowWidth, viewport.invert);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Image load failed: ${res.status}`);
      const blob = await res.blob();
      if (seq !== _loadSeq) return;

      const blobUrl = URL.createObjectURL(blob);
      _wlCache.set(key, blobUrl);
      set({ currentImageUrl: blobUrl, imageLoading: false });
    } catch (e) {
      if (seq === _loadSeq) {
        set({ imageLoading: false });
        get().showToast(`Image load failed: ${e}`, "error");
      }
    }
  },

  exportAllSeries: async () => {
    const { study, seriesImages } = get();
    if (!study) return;

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

    let totalSlices = 0;
    let exported = 0;

    for (const series of study.series) {
      const uid = series.series_uid;
      const images = seriesImages[uid] ?? [];
      const cached = images.filter(Boolean);
      totalSlices += cached.length;
    }

    if (totalSlices === 0) {
      get().showToast("No images loaded yet — wait for streaming to complete", "info");
      return;
    }

    get().showToast(`Exporting ${totalSlices} slices…`, "info");

    for (const series of study.series) {
      const uid = series.series_uid;
      const images = seriesImages[uid] ?? [];
      const label = series.inferred.display_label.replace(/[/\\:*?"<>|]/g, "_");
      const folder = zip.folder(label)!;

      for (let i = 0; i < images.length; i++) {
        const url = images[i];
        if (!url) continue;
        try {
          const res = await fetch(url);
          const buf = await res.arrayBuffer();
          const pad = String(i + 1).padStart(4, "0");
          folder.file(`slice_${pad}.png`, buf);
          exported++;
        } catch {
          // skip failed slice
        }
      }
    }

    const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const studyDate = study.study_date ?? "unknown";
    a.download = `mri_${studyDate}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
    get().showToast(`Exported ${exported} slices`, "info");
  },

  showToast: (message: string, type: "error" | "info" = "info") => {
    set({ toast: { message, type } });
    setTimeout(() => set({ toast: null }), 4000);
  },

  clearToast: () => set({ toast: null }),
}));

// ─── Selectors ────────────────────────────────────────────────────────────────

export const selectActiveSeries = (s: MriStore) =>
  s.study?.series.find((sr) => sr.series_uid === s.activeSeriesUid) ?? null;

export const selectActiveInstance = (s: MriStore) => {
  const series = s.study?.series.find((sr) => sr.series_uid === s.activeSeriesUid);
  return series?.instances[s.activeSliceIndex] ?? null;
};
