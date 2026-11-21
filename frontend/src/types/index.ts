export type RoleName = "admin" | "officer" | "inspector";

export type MaintenanceStatus =
  | "newly_detected"
  | "pending_review"
  | "approved"
  | "assigned"
  | "in_progress"
  | "resolved"
  | "rejected";

export interface User {
  id: number;
  name: string;
  email: string;
  role: RoleName;
  role_label: string | null;
  permissions: string[];
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface Video {
  id: number;
  original_filename: string;
  stored_filename: string;
  media_type: "video" | "image";
  mime_type: string;
  size_bytes: number;
  duration_seconds: number | null;
  frame_count: number | null;
  status: string;
  location_label: string;
  latitude: number | null;
  longitude: number | null;
  uploaded_at: string;
  uploaded_by: string | null;
  url: string | null;
  latest_job_id: number | null;
  latest_job_status: string | null;
  jobs_count: number;
}

export interface Stage {
  key: string;
  label: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  message: string;
  updated_at: string | null;
}

export interface Job {
  id: number;
  video_id: number;
  status: string;
  current_stage: string;
  progress: number;
  stages: Stage[];
  frames_read: number;
  keyframes_saved: number;
  reduction_percent: number;
  threshold: number | null;
  temporal_gap: number | null;
  detections_count: number;
  high_priority_count: number;
  layercam_count: number;
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  error_message: string | null;
  created_at: string;
  created_by: string | null;
  is_running?: boolean;
  video?: {
    id: number;
    original_filename: string;
    media_type: string;
    duration_seconds: number | null;
    size_bytes: number;
    url: string | null;
  };
}

export interface Keyframe {
  id: number;
  job_id: number;
  frame_index: number;
  filename: string;
  timestamp_seconds: number;
  width: number | null;
  height: number | null;
  url: string | null;
  detection_count: number;
}

export interface Priority {
  detection_id: number;
  total_score: number;
  category: "low" | "medium" | "high";
  severity: number;
  confidence_component: number;
  risk: number;
  location_component: number;
  severity_contribution: number;
  confidence_contribution: number;
  risk_contribution: number;
  location_contribution: number;
  weights: Record<string, number>;
  created_at: string;
}

export interface DetectionLocation {
  id: number;
  latitude: number;
  longitude: number;
  label: string;
  road_name: string;
  source: string;
  verified: boolean;
  created_at: string;
  created_by: string | null;
}

export interface Explanation {
  id: number;
  detection_id: number;
  method: string;
  prediction_index: number | null;
  feature_layer: number | null;
  target_score: number | null;
  matching_iou: number | null;
  class_match_fallback: boolean;
  warning: string | null;
  gradient_stats: Record<string, number>;
  heatmap_stats: {
    min?: number;
    max?: number;
    mean?: number;
    std?: number;
    percentiles?: Record<string, number>;
  };
  bbox_stats: Record<string, number>;
  activation_shape: number[];
  original_url: string | null;
  raw_cam_url: string | null;
  overlay_url: string | null;
  combined_url: string | null;
  created_at: string;
}

export interface Detection {
  id: number;
  defect_code: string;
  job_id: number;
  keyframe_id: number | null;
  frame_name: string;
  class_name: "crack" | "garbage" | "pothole";
  confidence: number;
  bbox: number[] | null;
  source: string;
  maintenance_status: MaintenanceStatus;
  maintenance_status_label: string;
  detected_at: string;
  priority: Priority | null;
  location: DetectionLocation | null;
  has_explanation: boolean;
  explanation_id: number | null;
  open_tasks: number;
  image_url?: string | null;
  annotated_url?: string | null;
  explanation?: Explanation | null;
}

export interface HistoryEntry {
  id: number;
  detection_id: number;
  task_id: number | null;
  from_status: string | null;
  to_status: string;
  to_status_label: string;
  comment: string;
  changed_by: string;
  created_at: string;
}

export interface MaintenanceTask {
  id: number;
  detection_id: number;
  title: string;
  status: MaintenanceStatus;
  status_label: string;
  assigned_to_id: number | null;
  assigned_to: string | null;
  notes: string;
  resolution_notes: string;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  detection?: Detection;
}

export interface Report {
  id: number;
  report_type: string;
  title: string;
  job_id: number | null;
  detection_id: number | null;
  period_start: string | null;
  period_end: string | null;
  summary: Record<string, unknown>;
  created_at: string;
  created_by: string | null;
  pdf_url: string | null;
  csv_url: string | null;
  download_url: string;
  download_csv_url: string;
}

export interface DashboardSummary {
  cards: {
    total_videos: number;
    videos_processed: number;
    processing_jobs: number;
    total_keyframes: number;
    total_defects: number;
    cracks: number;
    garbage: number;
    potholes: number;
    high_priority: number;
    medium_priority: number;
    low_priority: number;
    pending_maintenance: number;
    completed_maintenance: number;
    rejected: number;
    open_tasks: number;
    explained_detections: number;
  };
  model: {
    weights: string;
    available: boolean;
    classes: string[];
    cam_method: string;
  };
}

export interface Analytics {
  window_days: number;
  defects_by_category: { name: string; key: string; value: number }[];
  defects_over_time: {
    date: string;
    crack: number;
    garbage: number;
    pothole: number;
    total: number;
  }[];
  priority_distribution: { name: string; key: string; value: number }[];
  road_condition_trend: { date: string; average_priority: number; defects: number }[];
  confidence_distribution: { range: string; value: number }[];
  monthly_stats: {
    month: string;
    total: number;
    high?: number;
    medium?: number;
    low?: number;
  }[];
  maintenance_status: { key: string; name: string; value: number }[];
  average_priority: number;
}

export interface RecentActivity {
  recent_videos: Video[];
  recent_detections: Detection[];
  high_priority: Detection[];
  recent_jobs: Job[];
  recent_updates: HistoryEntry[];
}

export interface PriorityConfig {
  weights: Record<string, number>;
  class_severity: Record<string, number>;
  class_risk: Record<string, number>;
  location: Record<string, number>;
  categories: { low_max: number; medium_max: number };
  notes?: string;
}

export interface SystemStatus {
  app: { name: string; version: string; api_prefix: string; database: string };
  model: {
    weights_path: string;
    exists: boolean;
    loaded: boolean;
    classes: string[];
    device: string;
    size_mb: number | null;
    torch_version?: string;
  };
  pipeline: Record<string, string | number>;
  storage: Record<string, string | boolean>;
  counts: Record<string, number>;
}
