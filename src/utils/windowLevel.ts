import type { SeriesResponse } from "../types/dicom";

export interface WL {
  wc: number;
  ww: number;
}

const SEQUENCE_DEFAULTS: Record<string, WL> = {
  T1: { wc: 600, ww: 1200 },
  T2: { wc: 400, ww: 800 },
  PD: { wc: 700, ww: 1400 },
  STIR: { wc: 300, ww: 600 },
  unknown: { wc: 500, ww: 1000 },
};

export function defaultWindowLevel(series: SeriesResponse): WL {
  const mid = Math.floor(series.instances.length / 2);
  const midInst = series.instances[mid];

  if (midInst?.window_center != null && midInst?.window_width != null) {
    return { wc: midInst.window_center, ww: midInst.window_width };
  }

  return SEQUENCE_DEFAULTS[series.inferred.sequence_type] ?? SEQUENCE_DEFAULTS.unknown;
}

export function cssFilterFromWL(
  currentWC: number,
  currentWW: number,
  baseWC: number,
  baseWW: number
): string {
  if (baseWC === 0 || baseWW === 0) return "none";
  const brightnessRatio = Math.max(0.1, Math.min(5, currentWC / baseWC));
  const contrastRatio = Math.max(0.1, Math.min(5, baseWW / currentWW));
  return `brightness(${brightnessRatio.toFixed(3)}) contrast(${contrastRatio.toFixed(3)})`;
}

export function clampWL(wc: number, ww: number): WL {
  return {
    wc: Math.max(-2000, Math.min(4000, wc)),
    ww: Math.max(1, Math.min(8000, ww)),
  };
}
