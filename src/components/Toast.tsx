import { useMriStore } from "../store/useMriStore";

export function Toast() {
  const toast = useMriStore((s) => s.toast);
  const clearToast = useMriStore((s) => s.clearToast);

  if (!toast) return null;

  const isError = toast.type === "error";

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-xl text-sm font-medium flex items-center gap-2 ${
        isError
          ? "bg-red-950 border border-red-700 text-red-300"
          : "bg-gray-800 border border-gray-600 text-gray-200"
      }`}
    >
      <span>{toast.message}</span>
      <button onClick={clearToast} className="ml-2 opacity-60 hover:opacity-100 text-xs">
        ✕
      </button>
    </div>
  );
}
