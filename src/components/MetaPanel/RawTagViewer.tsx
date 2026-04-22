import { useState } from "react";
import { useMriStore } from "../../store/useMriStore";
import { selectActiveInstance } from "../../store/useMriStore";
import { fetchInstanceMeta } from "../../api/client";

export function RawTagViewer() {
  const activeInstance = useMriStore(selectActiveInstance);
  const [search, setSearch] = useState("");
  const [rawTags, setRawTags] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadedUid, setLoadedUid] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    if (!activeInstance || activeInstance.sop_uid === loadedUid) return;
    setLoading(true);
    try {
      const data = await fetchInstanceMeta(activeInstance.sop_uid, false);
      setRawTags(data.raw_tags);
      setLoadedUid(activeInstance.sop_uid);
    } catch {
      setRawTags(null);
    } finally {
      setLoading(false);
    }
  }

  const handleCopy = (value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(value);
    setTimeout(() => setCopied(null), 1500);
  };

  if (!activeInstance) {
    return <div className="p-3 text-xs text-gray-500">Select a slice to view raw tags</div>;
  }

  if (!rawTags && !loading) {
    return (
      <div className="p-3 text-xs text-gray-500 flex flex-col gap-2">
        <span>Tags not loaded</span>
        <button
          onClick={load}
          className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700"
        >
          Load Tags
        </button>
      </div>
    );
  }

  if (loading) {
    return <div className="p-3 text-xs text-gray-500">Loading tags…</div>;
  }

  const entries = Object.entries(rawTags!);
  const filtered = entries.filter(([k, v]) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return k.toLowerCase().includes(q) || v.toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-gray-800 shrink-0">
        <input
          type="text"
          placeholder="Search tags..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-500 outline-none focus:border-blue-600"
        />
        <div className="text-[10px] text-gray-600 mt-1">{filtered.length} tags</div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.map(([key, value]) => (
          <div
            key={key}
            className="flex flex-col px-2 py-1.5 border-b border-gray-800/50 hover:bg-gray-800/30 group"
          >
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-mono text-gray-500 shrink-0">{key.slice(0, 13)}</span>
              <button
                onClick={() => handleCopy(value)}
                className="ml-auto opacity-0 group-hover:opacity-100 text-[9px] text-gray-600 hover:text-blue-400"
                title="Copy value"
              >
                {copied === value ? "✓" : "⎘"}
              </button>
            </div>
            <span className="text-[11px] text-gray-300 break-all font-mono mt-0.5">
              {value.length > 120 ? value.slice(0, 120) + "…" : value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
