from __future__ import annotations
import asyncio
import base64
import json
import logging
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from backend.dicom_index import get_index
from backend.pixel_decoder import decode_instance_to_png

router = APIRouter()
logger = logging.getLogger(__name__)


async def _generate_stream(
    series_uid: str,
    wc: float | None,
    ww: float | None,
) -> AsyncGenerator[str, None]:
    try:
        idx = get_index()
    except RuntimeError as e:
        yield f"data: {json.dumps({'error': str(e)})}\n\n"
        return

    bucket = idx.series.get(series_uid)
    if not bucket or not bucket.instances:
        yield f"data: {json.dumps({'done': True, 'total': 0})}\n\n"
        return

    loop = asyncio.get_event_loop()

    # Resolve W/L: prefer caller-supplied, fall back to DICOM tags on first instance
    stream_wc = wc
    stream_ww = ww
    if stream_wc is None or stream_ww is None:
        first = bucket.instances[0]
        try:
            wc_str = first.meta.get("WindowCenter")
            ww_str = first.meta.get("WindowWidth")
            if wc_str:
                stream_wc = float(wc_str.split("\\")[0])
            if ww_str:
                stream_ww = float(ww_str.split("\\")[0])
        except (ValueError, AttributeError):
            pass  # decoder will auto-compute

    for index, inst in enumerate(bucket.instances):
        try:
            png_bytes, actual_wc, actual_ww = await loop.run_in_executor(
                None,
                decode_instance_to_png,
                inst.file_path,
                stream_wc,
                stream_ww,
                False,  # invert
            )
            image_b64 = base64.b64encode(png_bytes).decode("ascii")
            payload = {
                "index": index,
                "sop_uid": inst.sop_uid,
                "slice_position": inst.slice_position,
                "wc": round(actual_wc, 1),
                "ww": round(actual_ww, 1),
                "image_b64": image_b64,
            }
            yield f"data: {json.dumps(payload)}\n\n"
        except Exception as e:
            logger.error("Stream decode failed for %s[%d]: %s", series_uid, index, e)
            yield f"data: {json.dumps({'index': index, 'error': str(e)})}\n\n"

    yield f"data: {json.dumps({'done': True, 'total': len(bucket.instances)})}\n\n"


@router.get("/series/{series_uid}/stream")
async def stream_series(
    series_uid: str,
    wc: float | None = None,
    ww: float | None = None,
):
    try:
        idx = get_index()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    if series_uid not in idx.series:
        raise HTTPException(status_code=404, detail="Series not found")

    return StreamingResponse(
        _generate_stream(series_uid, wc, ww),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
