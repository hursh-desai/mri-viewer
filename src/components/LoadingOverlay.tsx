import { useMriStore } from "../store/useMriStore";

export function LoadingOverlay() {
  const uploadState = useMriStore((s) => s.uploadState);
  const error = useMriStore((s) => s.error);

  if (uploadState !== "uploading" && !error) return null;

  return (
    <div className="fixed inset-0 z-50 bg-gray-950/90 flex items-center justify-center">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 max-w-sm text-center shadow-2xl">
        {uploadState === "uploading" ? (
          <>
            <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <div className="text-sm text-gray-300 font-medium">Processing study…</div>
          </>
        ) : (
          <>
            <div className="text-red-400 text-2xl mb-3">⚠</div>
            <div className="text-sm text-red-400 font-medium">Load Error</div>
            <div className="text-xs text-gray-400 mt-2 font-mono">{error}</div>
          </>
        )}
      </div>
    </div>
  );
}
