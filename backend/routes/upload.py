from __future__ import annotations
import logging
import shutil
import zipfile
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File
from backend.config import TEMP_DIR
from backend.dicom_index import build_index_from_dicomdir, set_index, _build_index_by_scan
from backend.routes.study import get_study

logger = logging.getLogger(__name__)
router = APIRouter()


def _safe_extract(zf: zipfile.ZipFile, extract_root: Path) -> None:
    for name in zf.namelist():
        target = (extract_root / name).resolve()
        if not str(target).startswith(str(extract_root.resolve())):
            raise ValueError(f"Zip-slip detected: {name}")
    zf.extractall(extract_root)


@router.post("/upload")
async def upload_zip(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only ZIP files are accepted")

    extract_root = TEMP_DIR / "uploaded_study"
    if extract_root.exists():
        shutil.rmtree(extract_root)
    extract_root.mkdir(parents=True)

    zip_path = TEMP_DIR / "upload.zip"
    try:
        content = await file.read()
        zip_path.write_bytes(content)

        with zipfile.ZipFile(zip_path, "r") as zf:
            _safe_extract(zf, extract_root)

    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid ZIP file")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        if zip_path.exists():
            zip_path.unlink()

    # Find DICOMDIR
    dicomdir = extract_root / "DICOMDIR"
    if not dicomdir.exists():
        candidates = list(extract_root.rglob("DICOMDIR"))
        dicomdir = candidates[0] if candidates else None

    if dicomdir and dicomdir.exists():
        new_index = build_index_from_dicomdir(dicomdir, dicomdir.parent)
    else:
        logger.info("No DICOMDIR found, scanning directory")
        new_index = _build_index_by_scan(extract_root)

    set_index(new_index)
    return await get_study(redact_phi=False)
