from __future__ import annotations
import io
import logging
from pathlib import Path

import numpy as np
import pydicom
import pydicom.errors
from PIL import Image

logger = logging.getLogger(__name__)


def _auto_window_level(arr: np.ndarray) -> tuple[float, float]:
    """Compute sensible W/L from pixel statistics (nonzero pixels)."""
    nonzero = arr[arr > arr.min()]
    if nonzero.size == 0:
        nonzero = arr
    mean = float(nonzero.mean())
    std = float(nonzero.std())
    wc = mean
    ww = max(std * 3, 1.0)
    return wc, ww


def apply_window_level(arr: np.ndarray, wc: float, ww: float) -> np.ndarray:
    lower = wc - ww / 2.0
    upper = wc + ww / 2.0
    scaled = np.clip((arr.astype(np.float32) - lower) / (upper - lower), 0.0, 1.0)
    return (scaled * 255).astype(np.uint8)


def decode_instance_to_png(
    file_path: Path,
    wc: float | None,
    ww: float | None,
    invert: bool,
) -> tuple[bytes, float, float]:
    """
    Decode a DICOM instance to PNG bytes.
    Returns (png_bytes, actual_wc, actual_ww).
    """
    ds = pydicom.dcmread(str(file_path))

    # Decode pixel data — pylibjpeg handles JPEG Lossless automatically
    try:
        arr = ds.pixel_array
    except Exception as e:
        raise ValueError(f"Pixel decoding failed: {e}. Ensure pylibjpeg and pylibjpeg-libjpeg are installed.") from e

    # Handle multi-frame (use first frame)
    if arr.ndim == 3 and arr.shape[0] < arr.shape[1]:
        arr = arr[0]

    # Apply RescaleSlope / RescaleIntercept if present
    slope = float(getattr(ds, "RescaleSlope", 1) or 1)
    intercept = float(getattr(ds, "RescaleIntercept", 0) or 0)
    if slope != 1 or intercept != 0:
        arr = arr.astype(np.float32) * slope + intercept

    # Determine W/L
    if wc is None or ww is None:
        dicom_wc = getattr(ds, "WindowCenter", None)
        dicom_ww = getattr(ds, "WindowWidth", None)
        if dicom_wc is not None and dicom_ww is not None:
            # May be a multi-value sequence
            wc_val = float(dicom_wc[0]) if hasattr(dicom_wc, "__iter__") and not isinstance(dicom_wc, str) else float(dicom_wc)
            ww_val = float(dicom_ww[0]) if hasattr(dicom_ww, "__iter__") and not isinstance(dicom_ww, str) else float(dicom_ww)
            wc = wc if wc is not None else wc_val
            ww = ww if ww is not None else ww_val
        else:
            auto_wc, auto_ww = _auto_window_level(arr)
            wc = wc if wc is not None else auto_wc
            ww = ww if ww is not None else auto_ww

    out = apply_window_level(arr, wc, ww)

    # Respect MONOCHROME1 (inverted by default in DICOM)
    photometric = str(getattr(ds, "PhotometricInterpretation", "MONOCHROME2")).strip()
    if photometric == "MONOCHROME1":
        out = 255 - out

    if invert:
        out = 255 - out

    img = Image.fromarray(out, mode="L")
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=False)
    return buf.getvalue(), wc, ww


def get_pixel_stats(file_path: Path) -> dict:
    """Get pixel statistics without full W/L decode, for default W/L computation."""
    ds = pydicom.dcmread(str(file_path))
    arr = ds.pixel_array.astype(np.float32)

    slope = float(getattr(ds, "RescaleSlope", 1) or 1)
    intercept = float(getattr(ds, "RescaleIntercept", 0) or 0)
    if slope != 1 or intercept != 0:
        arr = arr * slope + intercept

    wc, ww = _auto_window_level(arr)
    return {
        "min": float(arr.min()),
        "max": float(arr.max()),
        "mean": float(arr.mean()),
        "std": float(arr.std()),
        "auto_wc": wc,
        "auto_ww": ww,
    }
