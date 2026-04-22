import type { StudyResponse } from "../types/dicom";

const BASE = "/api";

export async function fetchStudy(redactPhi: boolean): Promise<StudyResponse> {
  const res = await fetch(`${BASE}/study?redact_phi=${redactPhi}`);
  if (!res.ok) throw new Error(`Failed to fetch study: ${res.status}`);
  return res.json();
}

export function buildImageUrl(
  sopUid: string,
  wc: number | null,
  ww: number | null,
  invert: boolean
): string {
  const params = new URLSearchParams();
  if (wc !== null) params.set("wc", String(wc));
  if (ww !== null) params.set("ww", String(ww));
  params.set("invert", String(invert));
  return `${BASE}/instance/${encodeURIComponent(sopUid)}/image?${params}`;
}

export async function fetchInstanceMeta(
  sopUid: string,
  redactPhi: boolean
): Promise<{ sop_uid: string; series_uid: string; raw_tags: Record<string, string> }> {
  const res = await fetch(`${BASE}/instance/${encodeURIComponent(sopUid)}/meta?redact_phi=${redactPhi}`);
  if (!res.ok) throw new Error(`Failed to fetch metadata: ${res.status}`);
  return res.json();
}

export async function uploadZip(file: File): Promise<StudyResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}

export async function exportSlicePng(
  sopUid: string,
  wc: number | null,
  ww: number | null,
  invert: boolean,
  redactPhi: boolean
): Promise<void> {
  const res = await fetch(`${BASE}/export/png`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sop_uid: sopUid, wc, ww, invert, redact_phi: redactPhi }),
  });
  if (!res.ok) throw new Error("Export failed");
  const blob = await res.blob();
  _downloadBlob(blob, `mri_slice.png`);
}

export async function exportSeriesStack(seriesUid: string, redactPhi: boolean): Promise<void> {
  const res = await fetch(`${BASE}/export/stack`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ series_uid: seriesUid, redact_phi: redactPhi }),
  });
  if (!res.ok) throw new Error("Stack export failed");
  const blob = await res.blob();
  _downloadBlob(blob, "mri_series.zip");
}

export async function exportMetadata(
  opts: { seriesUid?: string; sopUid?: string; redactPhi: boolean }
): Promise<void> {
  const res = await fetch(`${BASE}/export/metadata`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      series_uid: opts.seriesUid ?? null,
      sop_uid: opts.sopUid ?? null,
      redact_phi: opts.redactPhi,
    }),
  });
  if (!res.ok) throw new Error("Metadata export failed");
  const blob = await res.blob();
  _downloadBlob(blob, "mri_metadata.json");
}

function _downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
