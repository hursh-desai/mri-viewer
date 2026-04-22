from __future__ import annotations
from typing import Literal
from pydantic import BaseModel


class InstanceMeta(BaseModel):
    sop_uid: str
    instance_number: int | None = None
    slice_position: float = 0.0
    image_position: list[float] | None = None
    slice_thickness: float | None = None
    pixel_spacing: list[float] | None = None
    rows: int = 0
    cols: int = 0
    window_center: float | None = None
    window_width: float | None = None
    file_path: str


class InferredSeriesInfo(BaseModel):
    plane: Literal["axial", "sagittal", "coronal", "oblique", "unknown"] = "unknown"
    sequence_type: Literal["T1", "T2", "PD", "STIR", "unknown"] = "unknown"
    fat_saturated: bool = False
    is_localizer: bool = False
    display_label: str = "Unknown Series"


class SeriesResponse(BaseModel):
    series_uid: str
    series_number: int | None = None
    series_description: str | None = None
    modality: str = "MR"
    tr: float | None = None
    te: float | None = None
    flip_angle: float | None = None
    inversion_time: float | None = None
    instances: list[InstanceMeta] = []
    inferred: InferredSeriesInfo = InferredSeriesInfo()
    thumbnail_uid: str | None = None


class StudyResponse(BaseModel):
    study_uid: str
    study_date: str | None = None
    study_description: str | None = None
    accession_number: str | None = None
    patient_name: str | None = None
    patient_id: str | None = None
    referring_physician: str | None = None
    institution: str | None = None
    series: list[SeriesResponse] = []
    phi_present: bool = True


class ExportPngRequest(BaseModel):
    sop_uid: str
    wc: float | None = None
    ww: float | None = None
    invert: bool = False
    redact_phi: bool = True


class ExportStackRequest(BaseModel):
    series_uid: str
    redact_phi: bool = True


class ExportMetadataRequest(BaseModel):
    series_uid: str | None = None
    sop_uid: str | None = None
    redact_phi: bool = True
