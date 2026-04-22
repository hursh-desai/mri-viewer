import { useEffect, useRef, useState } from "react";
import { useMriStore } from "../store/useMriStore";

export function useDragDrop() {
  const uploadStudy = useMriStore((s) => s.uploadStudy);
  const [isDragging, setIsDragging] = useState(false);
  const dragCountRef = useRef(0);

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCountRef.current++;
      if (dragCountRef.current === 1) setIsDragging(true);
    };

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const onDragLeave = () => {
      dragCountRef.current--;
      if (dragCountRef.current === 0) setIsDragging(false);
    };

    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      dragCountRef.current = 0;
      setIsDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (file && file.name.toLowerCase().endsWith(".zip")) {
        await uploadStudy(file);
      }
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);

    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [uploadStudy]);

  return { isDragging };
}
