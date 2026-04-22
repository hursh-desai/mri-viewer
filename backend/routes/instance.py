from __future__ import annotations
import logging
from fastapi import APIRouter, HTTPException, Response
from backend.dicom_index import find_instance_by_uid, get_index
from backend.pixel_decoder import decode_instance_to_png
from backend.phi_redactor import redact_meta_dict

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/instance/{sop_uid}/image")
async def get_instance_image(
    sop_uid: str,
    wc: float | None = None,
    ww: float | None = None,
    invert: bool = False,
) -> Response:
    result = find_instance_by_uid(sop_uid)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Instance {sop_uid} not found")
    inst, _ = result

    try:
        png_bytes, actual_wc, actual_ww = decode_instance_to_png(inst.file_path, wc, ww, invert)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception("Failed to decode %s", sop_uid)
        raise HTTPException(status_code=500, detail=f"Decode error: {e}")

    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={
            "X-Rows": str(inst.meta.get("Rows", "")),
            "X-Cols": str(inst.meta.get("Columns", "")),
            "X-WC": str(actual_wc),
            "X-WW": str(actual_ww),
            "Cache-Control": "private, max-age=60",
            "Access-Control-Expose-Headers": "X-Rows,X-Cols,X-WC,X-WW",
        },
    )


@router.get("/instance/{sop_uid}/meta")
async def get_instance_meta(sop_uid: str, redact_phi: bool = False) -> dict:
    result = find_instance_by_uid(sop_uid)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Instance {sop_uid} not found")
    inst, series_uid = result

    import pydicom
    try:
        ds = pydicom.dcmread(str(inst.file_path), stop_before_pixels=True, force=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {e}")

    raw_tags: dict[str, str] = {}
    for elem in ds:
        try:
            if elem.VR in ("SQ", "OB", "OW", "OD", "OF", "UN"):
                continue
            tag_str = f"({elem.tag.group:04X},{elem.tag.element:04X})"
            keyword = elem.keyword or ""
            raw_tags[f"{tag_str} {keyword}".strip()] = str(elem.value).strip()
        except Exception:
            pass

    if redact_phi:
        raw_tags = redact_meta_dict(raw_tags)

    return {
        "sop_uid": inst.sop_uid,
        "series_uid": series_uid,
        "file_path": str(inst.file_path.name),
        "slice_position": inst.slice_position,
        "raw_tags": raw_tags,
    }
