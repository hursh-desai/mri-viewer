from __future__ import annotations
import re
from backend.models import InferredSeriesInfo


def _parse_floats(s: str | None) -> list[float] | None:
    if not s:
        return None
    try:
        # Handle Python list repr: "[0.1, 0.2, ...]"
        clean = s.strip().lstrip("[").rstrip("]")
        # Handle DICOM backslash-separated or comma-separated
        parts = [p.strip() for p in clean.replace("\\", ",").split(",") if p.strip()]
        return [float(p) for p in parts]
    except (ValueError, AttributeError):
        return None


def _cross(a: list[float], b: list[float]) -> list[float]:
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]


def infer_plane(iop_str: str | None) -> str:
    iop = _parse_floats(iop_str)
    if not iop or len(iop) < 6:
        return "unknown"
    normal = _cross(iop[0:3], iop[3:6])
    magnitudes = [abs(n) for n in normal]
    dominant = magnitudes.index(max(magnitudes))
    if magnitudes[dominant] < 0.8:
        return "oblique"
    return {0: "sagittal", 1: "coronal", 2: "axial"}[dominant]


def infer_sequence_type(
    series_description: str | None,
    tr: float | None,
    te: float | None,
    flip_angle: float | None,
    scanning_sequence: str | None,
    sequence_name: str | None,
    inversion_time: float | None,
) -> str:
    desc = (series_description or "").upper()
    seq_name = (sequence_name or "").upper()

    # Priority 1: explicit substrings in description
    if re.search(r'\bSTIR\b', desc):
        return "STIR"
    if re.search(r'\bT2\b', desc):
        return "T2"
    if re.search(r'\bT1\b', desc):
        return "T1"
    if re.search(r'\bPD\b', desc):
        return "PD"
    if re.search(r'\bFLAIR\b', desc):
        return "T2"

    # Priority 2: TR/TE heuristics (standard MRI ranges)
    if tr is not None and te is not None:
        if tr < 700 and te < 30:
            return "T1"
        if tr > 2000 and te > 60:
            if inversion_time and 100 <= inversion_time <= 200:
                return "STIR"
            return "T2"
        if tr > 1500 and te < 40:
            return "PD"

    # Priority 3: sequence name hints
    if "TSE" in seq_name or "FSE" in seq_name or "SE" in seq_name:
        if tr and tr > 2000:
            return "T2"

    return "unknown"


def detect_fat_saturation(
    series_description: str | None,
    scan_options: str | None,
    sequence_name: str | None,
) -> bool:
    combined = " ".join(filter(None, [series_description, scan_options, sequence_name])).upper()
    fat_sat_patterns = [r'\bFS\b', r'FATSAT', r'FAT.SAT', r'\bSPIR\b', r'\bSPAIR\b', r'\bCHESS\b', r'\bFAT\s+SUP']
    return any(re.search(p, combined) for p in fat_sat_patterns)


def is_localizer(series_description: str | None, slice_count: int) -> bool:
    desc = (series_description or "").upper()
    if re.search(r'\bLOC\b|\bSCOUT\b|\bLOCALIZER\b|\bSURVEY\b', desc):
        return True
    # Localizers typically have very few slices (1-5)
    if slice_count <= 3:
        return True
    return False


def build_display_label(
    series_description: str | None,
    plane: str,
    sequence_type: str,
    fat_saturated: bool,
    localizer: bool,
) -> str:
    if localizer:
        return f"Localizer ({plane.capitalize()})" if plane != "unknown" else "Localizer"

    # If the original description is clean and informative, clean it up
    desc = (series_description or "").strip()
    if desc and len(desc) < 30:
        return desc

    # Construct from inferred components
    parts = []
    if plane != "unknown":
        parts.append(plane.capitalize())
    if sequence_type != "unknown":
        parts.append(sequence_type)
    if fat_saturated:
        parts.append("FS")
    if not parts:
        return desc or "Unknown Series"
    return " ".join(parts)


def infer_series(
    series_description: str | None,
    iop_str: str | None,
    tr: float | None,
    te: float | None,
    flip_angle: float | None,
    scanning_sequence: str | None,
    sequence_name: str | None,
    scan_options: str | None,
    inversion_time: float | None,
    slice_count: int,
) -> InferredSeriesInfo:
    plane = infer_plane(iop_str)
    sequence_type = infer_sequence_type(
        series_description, tr, te, flip_angle,
        scanning_sequence, sequence_name, inversion_time
    )
    fat_sat = detect_fat_saturation(series_description, scan_options, sequence_name)
    localizer = is_localizer(series_description, slice_count)
    label = build_display_label(series_description, plane, sequence_type, fat_sat, localizer)

    return InferredSeriesInfo(
        plane=plane,
        sequence_type=sequence_type,
        fat_saturated=fat_sat,
        is_localizer=localizer,
        display_label=label,
    )
