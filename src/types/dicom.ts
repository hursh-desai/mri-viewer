export interface InstanceMeta {
  sop_uid: string;
  instance_number: number | null;
  slice_position: number;
  image_position: [number, number, number] | null;
  slice_thickness: number | null;
  pixel_spacing: [number, number] | null;
  rows: number;
  cols: number;
  window_center: number | null;
  window_width: number | null;
  file_path: string;
}

export interface InferredSeriesInfo {
  plane: "axial" | "sagittal" | "coronal" | "oblique" | "unknown";
  sequence_type: "T1" | "T2" | "PD" | "STIR" | "unknown";
  fat_saturated: boolean;
  is_localizer: boolean;
  display_label: string;
}

export interface SeriesResponse {
  series_uid: string;
  series_number: number | null;
  series_description: string | null;
  modality: string;
  tr: number | null;
  te: number | null;
  flip_angle: number | null;
  inversion_time: number | null;
  instances: InstanceMeta[];
  inferred: InferredSeriesInfo;
  thumbnail_uid: string | null;
}

export interface StudyResponse {
  study_uid: string;
  study_date: string | null;
  study_description: string | null;
  accession_number: string | null;
  patient_name: string | null;
  patient_id: string | null;
  referring_physician: string | null;
  institution: string | null;
  series: SeriesResponse[];
  phi_present: boolean;
}
