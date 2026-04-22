import { useState } from "react";
import { useMriStore, selectActiveSeries, selectActiveInstance } from "../store/useMriStore";
import { exportSlicePng, exportSeriesStack, exportMetadata } from "../api/client";

export function ExportMenu() {
  const [open, setOpen] = useState(false);
  const activeInstance = useMriStore(selectActiveInstance);
  const activeSeries = useMriStore(selectActiveSeries);
  const viewport = useMriStore((s) => s.viewport);
  const showToast = useMriStore((s) => s.showToast);

  const redactPhi = false;

  const handle = async (action: () => Promise<void>) => {
    setOpen(false);
    try {
      await action();
      showToast("Export complete", "info");
    } catch (e) {
      showToast(`Export failed: ${e}`, "error");
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="px-3 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700"
      >
        Export ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-gray-900 border border-gray-700 rounded shadow-xl min-w-48">
            <div className="py-1">
              <button
                disabled={!activeInstance}
                onClick={() =>
                  handle(() =>
                    exportSlicePng(
                      activeInstance!.sop_uid,
                      viewport.windowCenter,
                      viewport.windowWidth,
                      viewport.invert,
                      redactPhi
                    )
                  )
                }
                className="w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-40"
              >
                Current Slice as PNG
              </button>
              <button
                disabled={!activeSeries}
                onClick={() =>
                  handle(() => exportSeriesStack(activeSeries!.series_uid, redactPhi))
                }
                className="w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-40"
              >
                Series as PNG Stack (.zip)
              </button>
              <div className="border-t border-gray-800 my-1" />
              <button
                disabled={!activeInstance}
                onClick={() =>
                  handle(() =>
                    exportMetadata({ sopUid: activeInstance!.sop_uid, redactPhi })
                  )
                }
                className="w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-40"
              >
                Slice Metadata as JSON
              </button>
              <button
                disabled={!activeSeries}
                onClick={() =>
                  handle(() =>
                    exportMetadata({ seriesUid: activeSeries!.series_uid, redactPhi })
                  )
                }
                className="w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-40"
              >
                Series Metadata as JSON
              </button>
              <button
                onClick={() => handle(() => exportMetadata({ redactPhi }))}
                className="w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-gray-800"
              >
                Full Study as JSON
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
