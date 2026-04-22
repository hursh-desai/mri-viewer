from __future__ import annotations
from fastapi import APIRouter, HTTPException
from backend.dicom_index import get_index
from backend.models import StudyResponse, SeriesResponse, InstanceMeta, InferredSeriesInfo
from backend.series_intelligence import infer_series
from backend.phi_redactor import redact_meta_dict

router = APIRouter()


def _safe_float(s: str | None) -> float | None:
    if not s:
        return None
    try:
        return float(s.split("\\")[0])
    except (ValueError, AttributeError):
        return None


def _safe_int(s: str | None) -> int | None:
    if not s:
        return None
    try:
        return int(float(s))
    except (ValueError, AttributeError):
        return None


def _parse_floats_list(s: str | None) -> list[float] | None:
    if not s:
        return None
    try:
        clean = s.strip().lstrip("[").rstrip("]")
        parts = [p.strip() for p in clean.replace("\\", ",").split(",") if p.strip()]
        return [float(p) for p in parts]
    except (ValueError, AttributeError):
        return None


def _parse_pixel_spacing(s: str | None) -> list[float] | None:
    return _parse_floats_list(s)


def _parse_image_position(s: str | None) -> list[float] | None:
    return _parse_floats_list(s)


@router.get("/study", response_model=StudyResponse)
async def get_study(redact_phi: bool = False) -> StudyResponse:
    try:
        idx = get_index()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    series_list: list[SeriesResponse] = []

    for series_uid, bucket in idx.series.items():
        if not bucket.instances:
            continue

        # Get representative metadata from first instance with the most info
        rep = bucket.instances[0]
        meta = rep.meta

        # Series-level metadata (same across all instances)
        series_description = meta.get("SeriesDescription") or bucket.dicomdir_meta.get("SeriesDescription")
        modality = meta.get("Modality") or bucket.dicomdir_meta.get("Modality", "MR")
        tr = _safe_float(meta.get("RepetitionTime"))
        te = _safe_float(meta.get("EchoTime"))
        flip_angle = _safe_float(meta.get("FlipAngle"))
        inversion_time = _safe_float(meta.get("InversionTime"))
        iop_str = meta.get("ImageOrientationPatient")
        scanning_sequence = meta.get("ScanningSequence")
        sequence_name = meta.get("SequenceName")
        scan_options = meta.get("ScanOptions")
        series_number = _safe_int(meta.get("SeriesNumber") or bucket.dicomdir_meta.get("SeriesNumber"))

        inferred = infer_series(
            series_description=series_description,
            iop_str=iop_str,
            tr=tr,
            te=te,
            flip_angle=flip_angle,
            scanning_sequence=scanning_sequence,
            sequence_name=sequence_name,
            scan_options=scan_options,
            inversion_time=inversion_time,
            slice_count=len(bucket.instances),
        )

        instances: list[InstanceMeta] = []
        for inst in bucket.instances:
            m = inst.meta
            wc_raw = m.get("WindowCenter")
            ww_raw = m.get("WindowWidth")
            # Handle multi-value
            wc = _safe_float(wc_raw.split("\\")[0] if wc_raw and "\\" in wc_raw else wc_raw)
            ww = _safe_float(ww_raw.split("\\")[0] if ww_raw and "\\" in ww_raw else ww_raw)

            instances.append(InstanceMeta(
                sop_uid=inst.sop_uid,
                instance_number=_safe_int(m.get("InstanceNumber")),
                slice_position=inst.slice_position,
                image_position=_parse_image_position(m.get("ImagePositionPatient")),
                slice_thickness=_safe_float(m.get("SliceThickness")),
                pixel_spacing=_parse_pixel_spacing(m.get("PixelSpacing")),
                rows=_safe_int(m.get("Rows")) or 0,
                cols=_safe_int(m.get("Columns")) or 0,
                window_center=wc,
                window_width=ww,
                file_path=str(inst.file_path.relative_to(idx.data_root)),
            ))

        mid = len(instances) // 2
        thumbnail_uid = instances[mid].sop_uid if instances else None

        series_list.append(SeriesResponse(
            series_uid=series_uid,
            series_number=series_number,
            series_description=series_description,
            modality=modality,
            tr=tr,
            te=te,
            flip_angle=flip_angle,
            inversion_time=inversion_time,
            instances=instances,
            inferred=inferred,
            thumbnail_uid=thumbnail_uid,
        ))

    # Sort series by series number
    series_list.sort(key=lambda s: (s.series_number or 999, s.series_uid))

    patient_name = idx.patient_meta.get("PatientName", "")
    patient_id = idx.patient_meta.get("PatientID", "")

    # Get institution and referring physician from first instance of first series
    ref_phys = ""
    institution = ""
    if series_list and series_list[0].instances:
        first_uid = series_list[0].instances[0].sop_uid
        for bucket in idx.series.values():
            for inst in bucket.instances:
                if inst.sop_uid == first_uid:
                    ref_phys = inst.meta.get("ReferringPhysicianName", "")
                    institution = inst.meta.get("InstitutionName", "")
                    break

    if redact_phi:
        patient_name = None
        patient_id = None
        ref_phys = None
        institution = None

    return StudyResponse(
        study_uid=idx.study_uid,
        study_date=idx.study_meta.get("StudyDate"),
        study_description=idx.study_meta.get("StudyDescription"),
        accession_number=idx.study_meta.get("AccessionNumber"),
        patient_name=patient_name or None,
        patient_id=patient_id or None,
        referring_physician=ref_phys or None,
        institution=institution or None,
        series=series_list,
        phi_present=True,
    )
