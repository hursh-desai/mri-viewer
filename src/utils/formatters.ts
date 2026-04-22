export function formatPatientName(raw: string | null): string {
  if (!raw) return "Unknown";
  // DICOM format: LAST^FIRST^MIDDLE^PREFIX^SUFFIX
  return raw.replace(/\^/g, " ").trim();
}

export function formatStudyDate(raw: string | null): string {
  if (!raw || raw.length < 8) return raw ?? "Unknown";
  const y = raw.slice(0, 4);
  const m = raw.slice(4, 6);
  const d = raw.slice(6, 8);
  return `${y}-${m}-${d}`;
}

export function formatTrTe(tr: number | null, te: number | null): string {
  const parts: string[] = [];
  if (tr !== null) parts.push(`TR ${tr.toFixed(0)} ms`);
  if (te !== null) parts.push(`TE ${te.toFixed(0)} ms`);
  return parts.join(" / ") || "—";
}

export function formatVoxelSize(
  pixelSpacing: [number, number] | null,
  sliceThickness: number | null
): string {
  if (!pixelSpacing) return "—";
  const inPlane = pixelSpacing[0].toFixed(3);
  const slice = sliceThickness ? sliceThickness.toFixed(1) : "?";
  return `${inPlane} × ${inPlane} × ${slice} mm`;
}

export function formatNumber(val: number | null, decimals = 1): string {
  if (val === null || val === undefined) return "—";
  return val.toFixed(decimals);
}

export function planeBadgeColor(plane: string): string {
  switch (plane) {
    case "axial":
      return "bg-blue-900 text-blue-300";
    case "sagittal":
      return "bg-green-900 text-green-300";
    case "coronal":
      return "bg-purple-900 text-purple-300";
    default:
      return "bg-gray-700 text-gray-400";
  }
}

export function seqTypeBadgeColor(seq: string): string {
  switch (seq) {
    case "T1":
      return "bg-orange-900 text-orange-300";
    case "T2":
      return "bg-cyan-900 text-cyan-300";
    case "PD":
      return "bg-teal-900 text-teal-300";
    default:
      return "bg-gray-700 text-gray-400";
  }
}
