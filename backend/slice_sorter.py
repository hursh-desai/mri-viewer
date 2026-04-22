from __future__ import annotations
import logging
import math
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class InstanceRecord:
    sop_uid: str
    file_path: Path
    meta: dict[str, str] = field(default_factory=dict)
    slice_position: float = 0.0


def _cross(a: list[float], b: list[float]) -> list[float]:
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]


def _dot(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def _parse_floats(s: str | None) -> list[float] | None:
    if not s:
        return None
    try:
        clean = s.strip().lstrip("[").rstrip("]")
        parts = [p.strip() for p in clean.replace("\\", ",").split(",") if p.strip()]
        return [float(p) for p in parts]
    except (ValueError, AttributeError):
        return None


def compute_slice_normal(iop: list[float]) -> list[float]:
    return _cross(iop[0:3], iop[3:6])


def spatial_sort_instances(instances: list[InstanceRecord]) -> list[InstanceRecord]:
    """Sort instances by spatial position along acquisition axis."""
    with_ipp = [
        i for i in instances
        if _parse_floats(i.meta.get("ImagePositionPatient"))
        and _parse_floats(i.meta.get("ImageOrientationPatient"))
    ]

    if len(with_ipp) >= 2:
        iop = _parse_floats(with_ipp[0].meta["ImageOrientationPatient"])
        normal = compute_slice_normal(iop)

        positions: dict[str, float] = {}
        for inst in with_ipp:
            ipp = _parse_floats(inst.meta["ImagePositionPatient"])
            positions[inst.sop_uid] = _dot(ipp, normal)

        # Detect duplicates
        seen: dict[float, str] = {}
        for uid, pos in positions.items():
            rounded = round(pos, 2)
            if rounded in seen:
                logger.warning("Duplicate slice position %.2f: %s and %s", pos, seen[rounded], uid)
            seen[rounded] = uid

        for inst in with_ipp:
            inst.slice_position = positions[inst.sop_uid]

        without_ipp = [i for i in instances if i.sop_uid not in positions]
        sorted_spatial = sorted(with_ipp, key=lambda x: x.slice_position)

        # Fallback: sort remainder by InstanceNumber then filename
        def fallback_key(inst: InstanceRecord):
            try:
                return int(inst.meta.get("InstanceNumber", "999999"))
            except ValueError:
                return 999999

        sorted_fallback = sorted(without_ipp, key=fallback_key)
        return sorted_spatial + sorted_fallback

    # No IPP available — fall back to InstanceNumber sort
    def instance_key(inst: InstanceRecord):
        try:
            return int(inst.meta.get("InstanceNumber", "999999"))
        except ValueError:
            return int("".join(filter(str.isdigit, inst.file_path.name)) or "999999")

    return sorted(instances, key=instance_key)
