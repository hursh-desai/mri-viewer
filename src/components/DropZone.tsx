interface Props {
  isDragging: boolean;
}

export function DropZone({ isDragging }: Props) {
  if (!isDragging) return null;

  return (
    <div className="fixed inset-0 z-50 bg-blue-950/80 border-4 border-dashed border-blue-400 flex items-center justify-center pointer-events-none">
      <div className="text-center">
        <div className="text-5xl mb-4">📁</div>
        <div className="text-xl font-bold text-blue-300">Drop DICOM ZIP to load</div>
        <div className="text-sm text-blue-400 mt-1">Replaces current study</div>
      </div>
    </div>
  );
}
