import { useMriStore } from "../../store/useMriStore";
import { formatTrTe, formatVoxelSize, planeBadgeColor, seqTypeBadgeColor } from "../../utils/formatters";

export function SeriesTable() {
  const study = useMriStore((s) => s.study);
  const activeSeriesUid = useMriStore((s) => s.activeSeriesUid);
  const selectSeries = useMriStore((s) => s.selectSeries);

  if (!study) return null;

  return (
    <div className="p-2 overflow-x-hidden">
      <div className="text-[10px] text-gray-500 mb-2 px-1">Click a row to select</div>
      {study.series.map((s) => {
        const inst = s.instances[0];
        const isActive = s.series_uid === activeSeriesUid;
        return (
          <button
            key={s.series_uid}
            onClick={() => selectSeries(s.series_uid)}
            className={`w-full text-left p-2 rounded mb-1 border transition-colors ${
              isActive
                ? "border-blue-600 bg-blue-950/40"
                : "border-gray-800 bg-gray-900/20 hover:border-gray-600"
            }`}
          >
            <div className="flex items-center gap-1 mb-1 flex-wrap">
              <span className="text-xs font-medium text-gray-200">{s.inferred.display_label}</span>
              <span className={`text-[9px] px-1 rounded ${planeBadgeColor(s.inferred.plane)}`}>
                {s.inferred.plane}
              </span>
              <span className={`text-[9px] px-1 rounded ${seqTypeBadgeColor(s.inferred.sequence_type)}`}>
                {s.inferred.sequence_type}
              </span>
              {s.inferred.fat_saturated && (
                <span className="text-[9px] px-1 rounded bg-yellow-900 text-yellow-300">FS</span>
              )}
            </div>
            <div className="text-[10px] text-gray-500 space-y-0.5">
              <div>{s.instances.length} slices · {inst?.rows ?? 0}×{inst?.cols ?? 0}</div>
              <div>{formatTrTe(s.tr, s.te)}</div>
              {inst && <div>{formatVoxelSize(inst.pixel_spacing, inst.slice_thickness)}</div>}
            </div>
            <div className="text-[9px] text-gray-600 mt-1 italic">
              ⚠ Inferred labels — not medical classification
            </div>
          </button>
        );
      })}
    </div>
  );
}
