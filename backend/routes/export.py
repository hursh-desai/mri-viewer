from __future__ import annotations
import io
import json
import logging
import zipfile
from fastapi import APIRouter, HTTPException, Response
from backend.dicom_index import get_index, find_instance_by_uid
from backend.pixel_decoder import decode_instance_to_png
from backend.models import ExportPngRequest, ExportStackRequest, ExportMetadataRequest
from backend.routes.study import get_study

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/export/png")
async def export_png(req: ExportPngRequest) -> Response:
    result = find_instance_by_uid(req.sop_uid)
    if result is None:
        raise HTTPException(status_code=404, detail="Instance not found")
    inst, _ = result

    try:
        png_bytes, _, _ = decode_instance_to_png(inst.file_path, req.wc, req.ww, req.invert)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    filename = f"mri_slice_{inst.file_path.stem}.png"
    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/export/stack")
async def export_stack(req: ExportStackRequest) -> Response:
    idx = get_index()
    bucket = idx.series.get(req.series_uid)
    if not bucket:
        raise HTTPException(status_code=404, detail="Series not found")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for i, inst in enumerate(bucket.instances):
            try:
                png_bytes, _, _ = decode_instance_to_png(inst.file_path, None, None, False)
                zf.writestr(f"slice_{i+1:04d}.png", png_bytes)
            except Exception as e:
                logger.warning("Skipping %s: %s", inst.file_path.name, e)

    filename = "mri_series_export.zip"
    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/export/metadata")
async def export_metadata(req: ExportMetadataRequest) -> Response:
    study = await get_study(redact_phi=req.redact_phi)

    if req.sop_uid:
        result = find_instance_by_uid(req.sop_uid)
        if result is None:
            raise HTTPException(status_code=404, detail="Instance not found")
        import pydicom
        inst, _ = result
        ds = pydicom.dcmread(str(inst.file_path), stop_before_pixels=True, force=True)
        tags: dict[str, str] = {}
        for elem in ds:
            try:
                if elem.VR in ("SQ", "OB", "OW", "OD", "OF", "UN"):
                    continue
                tags[elem.keyword or str(elem.tag)] = str(elem.value)
            except Exception:
                pass
        data = {"instance_metadata": tags}
    elif req.series_uid:
        series = next((s for s in study.series if s.series_uid == req.series_uid), None)
        if not series:
            raise HTTPException(status_code=404, detail="Series not found")
        data = series.model_dump()
    else:
        data = study.model_dump()

    json_str = json.dumps(data, indent=2, default=str)
    return Response(
        content=json_str,
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="mri_metadata.json"'},
    )
