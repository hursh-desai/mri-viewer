from __future__ import annotations
from backend.config import PHI_TAG_KEYWORDS, PHI_TAG_ADDRESSES

_REDACTED = "[REDACTED]"


def redact_meta_dict(tags: dict[str, str]) -> dict[str, str]:
    result = {}
    for key, value in tags.items():
        if _is_phi(key):
            result[key] = _REDACTED
        else:
            result[key] = value
    return result


def _is_phi(key: str) -> bool:
    if key in PHI_TAG_ADDRESSES:
        return True
    for kw in PHI_TAG_KEYWORDS:
        if kw.lower() in key.lower():
            return True
    return False
