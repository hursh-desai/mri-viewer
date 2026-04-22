import { useEffect, useRef, useCallback } from "react";
import { useMriStore, selectActiveSeries, selectActiveInstance } from "../../store/useMriStore";
import { cssFilterFromWL, clampWL } from "../../utils/windowLevel";

export function ViewportCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(new Image());
  const imgLoadedRef = useRef(false);
  // Always points to the latest drawFrame so img.onload never uses a stale closure
  const drawFrameRef = useRef<() => void>(() => {});

  const currentImageUrl = useMriStore((s) => s.currentImageUrl);
  const imageLoading = useMriStore((s) => s.imageLoading);
  const viewport = useMriStore((s) => s.viewport);
  const baseWC = useMriStore((s) => s.baseWC);
  const baseWW = useMriStore((s) => s.baseWW);
  const activeInstance = useMriStore(selectActiveInstance);
  const activeSeries = useMriStore(selectActiveSeries);
  const activeSliceIndex = useMriStore((s) => s.activeSliceIndex);

  const setWindowLevel = useMriStore((s) => s.setWindowLevel);
  const setZoom = useMriStore((s) => s.setZoom);
  const setPan = useMriStore((s) => s.setPan);
  const resetViewport = useMriStore((s) => s.resetViewport);
  const setSliceIndex = useMriStore((s) => s.setSliceIndex);

  const dragStateRef = useRef<{
    type: "pan" | "wl";
    startX: number;
    startY: number;
    startWC: number;
    startWW: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);

  function drawFrame() {
    const canvas = canvasRef.current;
    if (!canvas || !imgLoadedRef.current) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { zoom, panX, panY } = viewport;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2 + panX, canvas.height / 2 + panY);
    ctx.scale(zoom, zoom);
    const img = imgRef.current;
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();

    // Slice info overlay
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(8, 8, 180, 50);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "11px monospace";
    if (activeSeries) ctx.fillText(activeSeries.inferred.display_label, 14, 24);
    if (activeInstance) {
      const total = activeSeries?.instances.length ?? 0;
      ctx.fillText(`Slice ${activeSliceIndex + 1} / ${total}`, 14, 40);
    }

    // W/L overlay
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(8, canvas.height - 36, 200, 28);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px monospace";
    ctx.fillText(
      `WC: ${viewport.windowCenter.toFixed(0)}  WW: ${viewport.windowWidth.toFixed(0)}`,
      14,
      canvas.height - 18
    );
  }

  // Keep drawFrameRef current so img.onload always draws with latest state
  drawFrameRef.current = drawFrame;

  // Resize canvas to fill container
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const observer = new ResizeObserver(() => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      drawFrameRef.current();
    });
    observer.observe(container);
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    return () => observer.disconnect();
  }, []);

  // Load new image when URL changes
  useEffect(() => {
    const img = imgRef.current;
    if (!currentImageUrl) {
      imgLoadedRef.current = false;
      img.src = "";
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }
    imgLoadedRef.current = false;
    img.onload = () => {
      imgLoadedRef.current = true;
      // Reset CSS filter — only used during W/L drag preview
      if (canvasRef.current) canvasRef.current.style.filter = "none";
      drawFrameRef.current(); // Always uses latest state via ref
    };
    img.src = currentImageUrl;
  }, [currentImageUrl]);

  // Redraw when viewport state changes (if image is already loaded)
  useEffect(() => {
    if (imgLoadedRef.current) drawFrame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport, activeSliceIndex, activeSeries, activeInstance]);

  // Mouse wheel: zoom (Ctrl) or scroll slices
  const onWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        setZoom(viewport.zoom * (e.deltaY > 0 ? 0.9 : 1.1));
      } else {
        setSliceIndex(activeSliceIndex + (e.deltaY > 0 ? 1 : -1));
      }
    },
    [viewport.zoom, activeSliceIndex, setZoom, setSliceIndex]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (e.button === 0) {
        dragStateRef.current = {
          type: "pan",
          startX: e.clientX,
          startY: e.clientY,
          startWC: viewport.windowCenter,
          startWW: viewport.windowWidth,
          startPanX: viewport.panX,
          startPanY: viewport.panY,
        };
      } else if (e.button === 2) {
        dragStateRef.current = {
          type: "wl",
          startX: e.clientX,
          startY: e.clientY,
          startWC: viewport.windowCenter,
          startWW: viewport.windowWidth,
          startPanX: viewport.panX,
          startPanY: viewport.panY,
        };
      }
    },
    [viewport]
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const drag = dragStateRef.current;
      if (!drag) return;

      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;

      if (drag.type === "pan") {
        const canvas = canvasRef.current;
        if (!canvas || !imgLoadedRef.current) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const panX = drag.startPanX + dx;
        const panY = drag.startPanY + dy;
        ctx.save();
        ctx.translate(canvas.width / 2 + panX, canvas.height / 2 + panY);
        ctx.scale(viewport.zoom, viewport.zoom);
        const img = imgRef.current;
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        ctx.restore();
      } else if (drag.type === "wl") {
        const newWW = Math.max(1, drag.startWW + dx * 4);
        const newWC = drag.startWC - dy * 2;
        const clamped = clampWL(newWC, newWW);
        // Instant CSS filter preview
        const filterStr = cssFilterFromWL(clamped.wc, clamped.ww, baseWC, baseWW);
        if (canvasRef.current) canvasRef.current.style.filter = filterStr;
        setWindowLevel(clamped.wc, clamped.ww);
      }
    },
    [viewport, baseWC, baseWW, setWindowLevel]
  );

  const onMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      if (drag.type === "pan") {
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        setPan(dx, dy);
      }
      dragStateRef.current = null;
    },
    [setPan]
  );

  const onMouseLeave = useCallback(() => {
    dragStateRef.current = null;
  }, []);

  const onDoubleClick = useCallback(() => {
    resetViewport();
  }, [resetViewport]);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div ref={containerRef} className="relative flex-1 bg-black overflow-hidden cursor-crosshair">
      <canvas
        ref={canvasRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        className="absolute inset-0 w-full h-full"
        style={{ cursor: "crosshair" }}
      />
      {imageLoading && (
        <div className="absolute top-2 right-2 bg-black/60 text-blue-400 text-xs px-2 py-1 rounded">
          Loading…
        </div>
      )}
      {!currentImageUrl && !imageLoading && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-sm">
          Select a series to view
        </div>
      )}
    </div>
  );
}
