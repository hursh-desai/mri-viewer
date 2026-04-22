import type { SeriesResponse } from "../../types/dicom";
import { formatTrTe } from "../../utils/formatters";
import { planeBadgeColor, seqTypeBadgeColor } from "../../utils/formatters";

interface Props {
  series: SeriesResponse;
  isActive: boolean;
  onSelect: () => void;
  thumbnailUrl: string | null;
}

export function SeriesCard({ series, isActive, onSelect, thumbnailUrl }: Props) {
  const { inferred, instances, tr, te } = series;

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-2 rounded-lg border transition-all duration-150 mb-1 ${
        isActive
          ? "border-blue-500 bg-blue-950/40"
          : "border-gray-700 bg-gray-900/40 hover:border-gray-500 hover:bg-gray-800/40"
      }`}
    >
      {/* Thumbnail */}
      <div className="w-full aspect-square bg-black rounded mb-2 overflow-hidden">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt="series thumbnail"
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">
            No image
          </div>
        )}
      </div>

      {/* Label */}
      <div className="text-xs font-semibold text-gray-200 truncate mb-1">
        {inferred.display_label}
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1 mb-1">
        {inferred.plane !== "unknown" && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${planeBadgeColor(inferred.plane)}`}>
            {inferred.plane}
          </span>
        )}
        {inferred.sequence_type !== "unknown" && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${seqTypeBadgeColor(inferred.sequence_type)}`}>
            {inferred.sequence_type}
          </span>
        )}
        {inferred.fat_saturated && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-900 text-yellow-300">FS</span>
        )}
      </div>

      {/* Stats */}
      <div className="text-[10px] text-gray-400 space-y-0.5">
        <div>{instances.length} slices</div>
        <div>{formatTrTe(tr, te)}</div>
        {instances[0] && (
          <div>
            {instances[0].rows}×{instances[0].cols}
          </div>
        )}
      </div>
    </button>
  );
}
