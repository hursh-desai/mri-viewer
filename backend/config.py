from pathlib import Path
import tempfile

# Source data: sibling directory to the app
_APP_DIR = Path(__file__).parent.parent
DATA_ROOT = _APP_DIR.parent / "MR Knee WO -LEFT"

TEMP_DIR = Path(tempfile.gettempdir()) / "mri-viewer"
TEMP_DIR.mkdir(exist_ok=True)

MR_IMAGE_STORAGE_UID = "1.2.840.10008.5.1.4.1.1.4"

PHI_TAG_KEYWORDS = [
    "PatientName",
    "PatientID",
    "PatientBirthDate",
    "PatientAddress",
    "PatientTelephoneNumbers",
    "InstitutionName",
    "InstitutionAddress",
    "ReferringPhysicianName",
    "PhysiciansOfRecord",
    "RequestingPhysician",
    "ScheduledPerformingPhysicianName",
    "OtherPatientIDs",
    "PatientAge",
]

PHI_TAG_ADDRESSES = [
    "(0010,0010)", "(0010,0020)", "(0010,0030)", "(0010,1040)",
    "(0010,2154)", "(0008,0080)", "(0008,0081)", "(0008,0090)",
    "(0008,1048)", "(0010,1000)", "(0010,1010)", "(0032,1032)",
    "(0040,0006)",
]
