# MRI DICOM Viewer

Local-first DICOM viewer for knee MRI studies. Upload a ZIP of DICOM files, stream all slices instantly, and scrub offline.

## Local Development

```bash
# Install dependencies (once)
uv sync
npm install

# Start backend + frontend together
npm run dev
# Frontend: http://localhost:5173
# Backend:  http://localhost:8000
```

Upload a ZIP file containing DICOM series through the in-app picker. The backend streams decoded PNG slices over SSE as they're decoded; scrubbing is instant once a series is cached.

## Deploy to Fly.io

```bash
# Install flyctl: https://fly.io/docs/hands-on/install-flyctl/

# Log in (one-time)
fly auth login

# Create the app (change "mri-viewer" in fly.toml if the name is taken)
fly apps create mri-viewer

# Build and deploy
fly deploy
```

The app will be live at `https://mri-viewer.fly.dev`. The VM auto-stops when idle and wakes on the next request — no charges for idle time on the free tier.

## Architecture

```
Backend:  Python FastAPI
          - pydicom parses DICOM metadata
          - pylibjpeg decodes JPEG Lossless pixels
          - Numpy + Pillow converts to windowed PNG
          - SSE stream: one event per slice, base64-encoded PNG

Frontend: Vite + React + TypeScript + Tailwind CSS
          - Canvas-based viewport (zoom, pan, W/L)
          - Zustand state — seriesImages blob URL cache
          - Streams all series concurrently via EventSource
          - Scrubbing is zero-latency array lookup after caching
```

## Controls

| Action | How |
|---|---|
| Scroll slices | Mouse wheel |
| Pan | Left drag |
| Window/Level | Right drag (horizontal = width, vertical = center) |
| Zoom | Ctrl+wheel or `+`/`-` keys |
| Reset view | Double-click or `R` |
| Invert | `I` key |
| Cine play | `Space` |
| Next/prev slice | Arrow keys |
| Export all series | Export button in header |

## Features

- Upload any DICOM ZIP — no fixed study path
- SSE streaming: first series viewable before others finish loading
- Per-series progress bars during streaming
- Series picker with plane and sequence inference (Sagittal PD FS, etc.)
- Spatial slice sorting via ImagePositionPatient
- Export: all series as a ZIP, one folder per series, one PNG per slice
- W/L adjustment with CSS filter preview during drag

## Notes

- Supports JPEG Lossless transfer syntax (`1.2.840.10008.1.2.4.90`). Other transfer syntaxes may require additional pylibjpeg plugins.
- Series labels are heuristic — not for clinical use.
