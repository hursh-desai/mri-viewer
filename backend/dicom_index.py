from __future__ import annotations
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pydicom
import pydicom.errors

from backend.config import DATA_ROOT, MR_IMAGE_STORAGE_UID
from backend.slice_sorter import InstanceRecord, spatial_sort_instances

logger = logging.getLogger(__name__)


@dataclass
class SeriesBucket:
    series_uid: str
    dicomdir_meta: dict[str, str] = field(default_factory=dict)
    instances: list[InstanceRecord] = field(default_factory=list)


@dataclass
class StudyIndex:
    study_uid: str
    study_meta: dict[str, str] = field(default_factory=dict)
    patient_meta: dict[str, str] = field(default_factory=dict)
    series: dict[str, SeriesBucket] = field(default_factory=dict)
    data_root: Path = DATA_ROOT


_current_index: StudyIndex | None = None


def get_index() -> StudyIndex:
    if _current_index is None:
        raise RuntimeError("Study index not built yet")
    return _current_index


def set_index(idx: StudyIndex) -> None:
    global _current_index
    _current_index = idx


def _ds_str(ds: Any, keyword: str, default: str = "") -> str:
    try:
        val = ds.get(keyword)
        if val is None:
            return default
        return str(val).strip()
    except Exception:
        return default


def _parse_dicomdir_ref(ref: Any) -> str | None:
    """Convert DICOMDIR ReferencedFileID to a path string."""
    if ref is None:
        return None
    if hasattr(ref, "__iter__") and not isinstance(ref, str):
        parts = list(ref)
        if not parts:
            return None
        return str(Path(*parts))
    s = str(ref).replace("\\", "/")
    return s if s else None


def _load_single_header(args: tuple[Path, Path]) -> InstanceRecord | None:
    """Load DICOM header stopping before pixel data. Returns None on failure."""
    file_path, data_root = args
    try:
        ds = pydicom.dcmread(str(file_path), stop_before_pixels=True, force=True)

        # Skip non-image SOPs (localizers, overview bitmaps, etc.)
        sop_class = _ds_str(ds, "SOPClassUID")
        if sop_class and sop_class not in (MR_IMAGE_STORAGE_UID, ""):
            # Allow enhanced MR and basic MR
            pass  # Keep all — series_intelligence will classify

        sop_uid = _ds_str(ds, "SOPInstanceUID")
        if not sop_uid:
            # Generate a fallback UID from path
            sop_uid = f"unknown.{file_path.name}"

        # Extract all scalar tags as strings for the meta dict
        meta: dict[str, str] = {}
        for elem in ds:
            try:
                tag_str = f"({elem.tag.group:04X},{elem.tag.element:04X})"
                if elem.VR in ("SQ", "OB", "OW", "OD", "OF", "UN"):
                    continue
                meta[tag_str] = str(elem.value).strip()
                # Also store by keyword for easy access
                if elem.keyword:
                    meta[elem.keyword] = str(elem.value).strip()
            except Exception:
                pass

        rel_path = str(file_path.relative_to(data_root))
        return InstanceRecord(sop_uid=sop_uid, file_path=file_path, meta=meta)

    except Exception as e:
        logger.warning("Failed to read %s: %s", file_path, e)
        return None


def build_index_from_dicomdir(dicomdir_path: Path, data_root: Path) -> StudyIndex:
    """Parse DICOMDIR and load all instance headers in parallel."""
    logger.info("Building index from DICOMDIR: %s", dicomdir_path)

    try:
        dd = pydicom.dcmread(str(dicomdir_path), force=True)
    except Exception as e:
        logger.error("Failed to read DICOMDIR: %s", e)
        return _build_index_by_scan(data_root)

    study_index = StudyIndex(study_uid="unknown", data_root=data_root)
    current_series_uid: str | None = None

    try:
        records = dd.DirectoryRecordSequence
    except AttributeError:
        logger.warning("DICOMDIR has no DirectoryRecordSequence, falling back to scan")
        return _build_index_by_scan(data_root)

    file_paths_by_series: dict[str, list[Path]] = {}

    for record in records:
        rtype = _ds_str(record, "DirectoryRecordType")

        if rtype == "PATIENT":
            study_index.patient_meta["PatientName"] = _ds_str(record, "PatientName")
            study_index.patient_meta["PatientID"] = _ds_str(record, "PatientID")

        elif rtype == "STUDY":
            uid = _ds_str(record, "StudyInstanceUID", "unknown")
            study_index.study_uid = uid
            study_index.study_meta = {
                "StudyInstanceUID": uid,
                "StudyDate": _ds_str(record, "StudyDate"),
                "StudyTime": _ds_str(record, "StudyTime"),
                "StudyDescription": _ds_str(record, "StudyDescription"),
                "AccessionNumber": _ds_str(record, "AccessionNumber"),
            }

        elif rtype == "SERIES":
            uid = _ds_str(record, "SeriesInstanceUID", f"unknown_{len(study_index.series)}")
            current_series_uid = uid
            bucket = SeriesBucket(
                series_uid=uid,
                dicomdir_meta={
                    "SeriesNumber": _ds_str(record, "SeriesNumber"),
                    "Modality": _ds_str(record, "Modality", "MR"),
                    "SeriesDescription": _ds_str(record, "SeriesDescription"),
                },
            )
            study_index.series[uid] = bucket
            file_paths_by_series[uid] = []

        elif rtype == "IMAGE" and current_series_uid:
            ref = getattr(record, "ReferencedFileID", None)
            rel = _parse_dicomdir_ref(ref)
            if rel:
                abs_path = dicomdir_path.parent / rel
                if abs_path.exists():
                    file_paths_by_series[current_series_uid].append(abs_path)
                else:
                    logger.warning("DICOMDIR references non-existent file: %s", abs_path)

    # Load headers in parallel
    all_files: list[tuple[Path, str]] = [
        (path, series_uid)
        for series_uid, paths in file_paths_by_series.items()
        for path in paths
    ]

    logger.info("Loading headers for %d files...", len(all_files))

    with ThreadPoolExecutor(max_workers=8) as executor:
        future_map = {
            executor.submit(_load_single_header, (path, data_root)): (path, series_uid)
            for path, series_uid in all_files
        }
        for future in as_completed(future_map):
            _, series_uid = future_map[future]
            try:
                record = future.result()
                if record is not None:
                    study_index.series[series_uid].instances.append(record)
            except Exception as e:
                path, _ = future_map[future]
                logger.warning("Header load failed for %s: %s", path, e)

    # Spatially sort each series
    for bucket in study_index.series.values():
        bucket.instances = spatial_sort_instances(bucket.instances)

    # Compute slice positions for each instance (already done in sort)
    logger.info(
        "Index built: %d series, %d total instances",
        len(study_index.series),
        sum(len(b.instances) for b in study_index.series.values()),
    )
    return study_index


def _build_index_by_scan(data_root: Path) -> StudyIndex:
    """Fallback: scan directory for DICOM files without DICOMDIR."""
    logger.info("Scanning for DICOM files in %s", data_root)

    study_index = StudyIndex(study_uid="scanned", data_root=data_root)
    series_map: dict[str, list[Path]] = {}

    for file_path in sorted(data_root.rglob("*")):
        if not file_path.is_file():
            continue
        try:
            ds = pydicom.dcmread(str(file_path), stop_before_pixels=True, force=True)
            series_uid = _ds_str(ds, "SeriesInstanceUID", f"series_{hash(file_path.parent)}")
            if series_uid not in series_map:
                series_map[series_uid] = []
                study_index.series[series_uid] = SeriesBucket(series_uid=series_uid)
            series_map[series_uid].append(file_path)
        except Exception:
            pass

    for series_uid, paths in series_map.items():
        with ThreadPoolExecutor(max_workers=8) as executor:
            results = list(executor.map(lambda p: _load_single_header((p, data_root)), paths))
        study_index.series[series_uid].instances = spatial_sort_instances(
            [r for r in results if r is not None]
        )

    return study_index


def find_instance_by_uid(sop_uid: str) -> tuple[InstanceRecord, str] | None:
    """Returns (instance, series_uid) or None."""
    idx = get_index()
    for series_uid, bucket in idx.series.items():
        for inst in bucket.instances:
            if inst.sop_uid == sop_uid:
                return inst, series_uid
    return None
