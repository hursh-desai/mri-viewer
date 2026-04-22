from __future__ import annotations
from fastapi import APIRouter, HTTPException
from backend.dicom_index import get_index
from backend.routes.study import get_study

router = APIRouter()


@router.get("/series/{series_uid}")
async def get_series(series_uid: str, redact_phi: bool = False):
    study = await get_study(redact_phi=redact_phi)
    for s in study.series:
        if s.series_uid == series_uid:
            return s
    raise HTTPException(status_code=404, detail=f"Series {series_uid} not found")
