# MRI DICOM Viewer

Local-first DICOM viewer for knee MRI studies. Fully offline — no data ever leaves your machine.

## Quick Start

```bash
cd /Users/hursh/Pictures/MRI/mri-viewer

# Install (once)
uv sync
npm install

# Run
npm run dev
# Opens http://localhost:5173
```

The app automatically discovers the DICOM study at `../MR Knee WO -LEFT/` on startup.

## Architecture

```
Backend:  Python FastAPI (127.0.0.1:8000)
          - pydicom parses DICOM metadata
          - pylibjpeg-libjpeg decodes JPEG Lossless pixels
          - Numpy + Pillow converts to PNG with W/L applied
          - DICOMDIR index for fast (~0.5s) cold start

Frontend: Vite + React + TypeScript + Tailwind CSS
          - Canvas-based viewport (zoom, pan, W/L)
          - Zustand state management
          - Debounced W/L with CSS filter preview
```

## Controls

| Action | How |
|---|---|
| Scroll slices | Mouse wheel |
| Pan | Left drag |
| Window/Level | Right drag (horizontal = width, vertical = center) |
| Zoom | Ctrl+wheel or `+`/`-` keys |
| Reset view | Double-click or `R` |
| Invert | `I` key or Invert button |
| Cine play | `Space` or Cine button |
| Next/prev slice | Arrow keys |

## Study Info

- **5 series**: AX PD FS, AX T1, SAG PD FS, SAG PD, COR PD FS, COR PD, COR T2 ACL
- **Transfer syntax**: JPEG Lossless (`1.2.840.10008.1.2.4.90`) — handled by pylibjpeg
- **199 instances** across 7 series
- PHI present — use the toggle in the header to hide patient details

## Features

- Series picker with thumbnails and inferred labels (e.g. "Sagittal PD FS")
- Plane inference from ImageOrientationPatient direction cosines
- Sequence type inference from TR/TE and SeriesDescription
- Spatial slice sorting via ImagePositionPatient dot-product
- 4-tab metadata panel: Study / Series / Slice / Raw Tags
- PHI toggle (hides patient name, ID, institution, physician)
- Export: slice PNG, series stack ZIP, study/series/slice JSON
- Drag-and-drop a new DICOM ZIP to switch studies

## Limitations

- JPEG Lossless only (transfer syntax 4.90). For other transfer syntaxes (JPEG 2000, RLE, etc.), additional pylibjpeg plugins may be needed.
- Series inference labels are heuristic approximations — NOT medical classification.
- No 3D MPR or volume rendering (future feature hook exists).

## Notes on Metadata

Tags particularly useful in this study:
- `ImageOrientationPatient` — enables accurate plane detection
- `ImagePositionPatient` — enables spatial slice ordering
- `RepetitionTime` / `EchoTime` — enables T1/T2/PD inference
- `WindowCenter` / `WindowWidth` — per-slice W/L recommendations
- `PixelSpacing` + `SliceThickness` — voxel size display
