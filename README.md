<<<<<<< HEAD
# URBAN VISION AI

**AI-Driven Multi-Task Urban Infrastructure Monitoring and Maintenance Prioritization Using Municipal Vehicle Cameras**

A full-stack municipal monitoring platform that turns routine vehicle-camera footage into a prioritised,
explainable maintenance programme. React + TypeScript dashboard, FastAPI backend, SQLite/SQLAlchemy
database, and the project's trained three-class YOLO11n model (`crack`, `garbage`, `pothole`) with
SSIM keyframe extraction, LayerCAM explanations and weighted maintenance priority scoring.

---

## 1. What is implemented

| Stage | Implementation |
| --- | --- |
| Keyframe extraction | `backend/src/member1_keyframes.py` — SSIM (0.92) + temporal gap (10) |
| Object detection | `backend/src/member2_detection.py` — custom YOLO11n, model loaded once per worker |
| Explainability | `backend/src/gradcam_yolo.py` — detection-specific **LayerCAM**, dynamic P3/P4/P5 selection |
| Priority scoring | `backend/src/priority_scoring.py` — `P = 100 × (0.40S + 0.20C + 0.25R + 0.15L)` |
| Orchestration | `backend/app/services/pipeline.py` — background worker, per-stage status, report generation |
| API | FastAPI, JWT auth, role-based permissions, Pydantic validation, Swagger docs |
| Database | 13 tables (users, roles, videos, jobs, keyframes, detections, explanations, priorities, locations, tasks, history, reports, settings) |
| Frontend | React 19 + TS + Tailwind + Framer Motion + Recharts + Leaflet, 13 functional pages |

No detection, confidence value, coordinate or heatmap is simulated. Every number shown in the UI is read
from the database/API, and every heatmap is computed from the trained model.

---

## 2. Requirements

- **Python 3.11 – 3.14** with a C++-capable PyTorch install (CPU is sufficient)
- **Node.js 20+** (for the React frontend)
- The trained weights at `models/best.pt` (already copied from
  `.../URIM V11/runs/detect/train-2/weights/best.pt`; override with `YOLO_WEIGHTS`)

The project was verified on Windows 11 with Python 3.14, PyTorch 2.15 (CPU) and Ultralytics 8.4.

---

## 3. Installation (Windows, PowerShell or Git Bash)

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
# edit .env if your weights live elsewhere
```

`.env` keys of note:

```
SECRET_KEY=...                 # generate a long random value
DATABASE_URL=sqlite:///...     # absolute path recommended on Windows
YOLO_WEIGHTS=C:/path/to/best.pt
KEYFRAME_THRESHOLD=0.92
KEYFRAME_GAP=10
CONF_THRESHOLD=0.25
CAM_METHOD=layercam
MAX_LAYERCAM_PER_JOB=6
```

Run the API:

```bash
cd backend
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Interactive API docs: <http://127.0.0.1:8000/api/docs>

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open <http://127.0.0.1:5173>. Vite proxies `/api` and `/media` to `http://127.0.0.1:8000`.

For a single-server demo, run `npm run build` — the backend then serves `frontend/dist` at `/`.

Convenience scripts: `start_backend.bat` and `start_frontend.bat` in the project root.

---

## 4. Real municipal-vehicle camera footage

The pipeline is camera-source agnostic: it decodes any MP4/AVI/MOV/MKV/M4V/TS clip with OpenCV/FFmpeg,
so bus, lorry, garbage-truck and inspection-vehicle recordings need no conversion. Practical guidance for
fleet footage:

- **File size / length.** Uploads default to a 2 GB limit (`MAX_UPLOAD_MB`). For a full shift, export
  segments rather than one multi-hour file. `frame_stride` (job parameter, also `KEYFRAME_STRIDE`) compares
  every Nth frame, which bounds keyframe-extraction time on long, high-fps recordings.
- **Small defects in wide-angle HD footage.** A 1080p/4K frame reduced to 640 px can shrink a distant
  pothole below what the model can see. Set **Inference resolution** to 960 or 1280 for wide-angle roof or
  windscreen cameras (`IMAGE_SIZE` is the default).
- **Mounting and motion.** Fixed forward-facing or side-facing mounts work; the keyframe score drops when the
  vehicle moves, so a moving camera yields close to one keyframe per temporal gap rather than a large SSIM
  reduction. That is expected, not a failure.
- **Vibration, rain, night and glare.** These degrade detection confidence. Tune `conf_threshold` down for
  low-light footage and validate accuracy on a labelled sample of your own recordings — the bundled sample
  clip is only a pipeline test.
- **Location.** One upload-time coordinate applies to the whole clip; GPS is never inferred from imagery. For
  route footage, record the verified location per defect from the Defect Management page (or upload shorter
  segments that share one coordinate). A GPS-track (.gpx/.csv) import matched by timestamp is not implemented.

The trained model covers `crack`, `garbage` and `pothole`. If your fleet footage shows other municipal
problems, they need their own labelled training data and classes.

### 4.1 Live vehicle camera (bus / lorry / garbage-truck feed)

`backend/scripts/fleet_camera_ingest.py` runs on the vehicle PC (or any machine that can reach both the
camera and the API). It records fixed-length clips from the camera and pushes each one through the normal
upload → processing pipeline, so the dashboard shows them like any manual upload.

```bash
cd backend
# activate the venv first
.venv\Scripts\python scripts\fleet_camera_ingest.py ^
    --source "rtsp://admin:password@10.0.0.42:554/Streaming/Channels/101" ^
    --email officer@urbanvision.ai --password "Urban@123" ^
    --location-label "Bus AR-01 - front camera" ^
    --clip-seconds 30 --fps 10 --image-size 1280 --frame-stride 3 --wait
```

| Option | Purpose |
| --- | --- |
| `--source` | `0` for a USB camera, an RTSP/HTTP URL for an IP camera, or a recorded dashcam file |
| `--clip-seconds` / `--fps` | clip length and stored frame rate (10 fps is plenty for road defects) |
| `--image-size` | YOLO inference resolution; 960–1280 for wide-angle HD/4K vehicle cameras |
| `--frame-stride` | compare every Nth decoded frame; 2–5 keeps long shifts cheap |
| `--gps-port COM4` | read NMEA `$GPRMC`/`$GPGGA` from a serial GPS (`pip install pyserial`) and tag each clip |
| `--lat` / `--lon` | fixed coordinate when there is no GPS receiver |
| `--no-process` | upload only, start processing later from the UI |
| `--wait` | block per clip and print detection/high-priority totals |
| `--dry-run` | record clips locally without touching the API |
| `--max-clips N`, `--keep-clips` | stop after N clips, keep recorded files |

Camera behaviour that matters in practice:

- The client samples frames on a wall clock, so a slow or stuttering stream never produces a corrupt clip;
  a clip with fewer than two frames is dropped and the camera is reopened.
- One clip carries one coordinate (the GPS fix at its end, or the fixed `--lat/--lon`). Shorter clips give
  finer location resolution per defect; 20–30 s at 30–50 km/h is roughly 150–400 m.
- Uploads retry on the next clip instead of stopping the recording, so a dropped network does not end the
  shift — but clips that failed are not queued. Use `--keep-clips` plus a later batch upload if every clip
  must be retained.
- Point the camera at the road surface ahead of the vehicle (bonnet/roof mount, slightly downward) and avoid
  filming through dirty glass or directly into sun/headlight glare.
- The pipeline starts automatically only when `--wait`/processing is enabled; otherwise finish each job from
  **Processing History**.

### 4.2 Using a phone as the vehicle camera

No code or backend change is needed: a phone becomes an ordinary `--source` URL, exactly like an IP camera,
because the client reads any MJPEG/RTSP stream through OpenCV.

1. **Publish the phone camera.** Install an IP-camera app that shows a stream URL on screen (Android: *IP
   Webcam* — MJPEG at `http://<phone-ip>:8080/video`; iOS: any app that offers an MJPEG or RTSP address).
   Start the server in the app.
2. **Join the same network.** In a vehicle, turn on the phone's **hotspot** and connect the laptop running the
   backend to it; the phone address is then usually `192.168.43.x` (shown in the app or in phone Wi-Fi
   settings). Confirm the stream opens in VLC or a browser before starting the client.
3. **Run the ingest client** (same script as §4.1, only `--source` changes):

```bash
cd backend
.venv\Scripts\python scripts/fleet_camera_ingest.py ^
    --source "http://192.168.43.10:8080/video" ^
    --email officer@urbanvision.ai --password "Urban@123" ^
    --location-label "Bus AR-01 - phone camera" ^
    --clip-seconds 30 --fps 10 --image-size 1280 --frame-stride 3 --wait
```

If the app offers RTSP, prefer it (`--source "rtsp://192.168.43.10:8080/h264"`): lower latency and fewer
corrupt frames than MJPEG over a weak hotspot.

Phone-specific practicalities:

- A phone MJPEG stream delivers frames unevenly. `--fps 10` samples it on a wall clock, so clips stay small
  and correctly timed regardless of the stream rate. Do not set `--fps` above ~15 from a phone.
- Keep the app in the foreground and the screen awake (disable auto-lock for the shift). If the app stops
  streaming, the client logs `No frames captured; reopening the source` and retries every
  `--reconnect-delay` seconds — recording resumes without restarting the run.
- Mount rigidly on the windscreen (suction mount behind the wiper area, aimed slightly down at the road) and
  charge the phone: streaming plus screen-on drains a battery in a couple of hours.
- Closed-cab glass, rain drops and screen glare cost detections. Wipe the lens/windscreen at the start of the
  shift and tune `CONF_THRESHOLD` down for night or rainy footage.
- The phone does not give the PC a GPS position. Use `--lat`/`--lon` for a fixed route point, `--gps-port`
  with a USB/serial GPS receiver, or record the verified coordinate per defect later from Defect Management.
- **No network needed at all:** record with the phone's camera app, copy the MP4 to the laptop and run the
  client against the file (`--source D:\clips\route1.mp4`), or upload it from the Video Upload page.

### 4.3 Field capture app (phone browser)

The web app has a built-in capture screen at **`/capture`** (sidebar: *AI Processing → Phone Capture*). It opens
the rear camera with `getUserMedia`, records clips with `MediaRecorder`, uploads each one to
`/api/videos/upload` with the optional GPS fix and location label, and starts the AI pipeline automatically. It
is a normal React route in `frontend/src/pages/CapturePage.tsx` — nothing else is installed on the phone.

**It must be served over HTTPS** (browsers only expose the camera to HTTPS pages or `localhost`). For a LAN
demo on the inspector's laptop:

```bash
cd backend
openssl req -x509 -newkey rsa:2048 -nodes -days 365 -subj "/CN=urban-vision" ^
    -keyout certs\key.pem -out certs\cert.pem
.venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8443 ^
    --ssl-keyfile certs\key.pem --ssl-certfile certs\cert.pem
```

Build the frontend first (`cd frontend && npm run build`) so the backend serves it, then open
`https://<laptop-ip>:8443/capture` on the phone, accept the self-signed certificate once, sign in and tap
**Start camera**. The phone must be on the same network as the laptop (hotspot is fine).

Behaviour worth knowing:

- Clips are recorded as **MP4** where the browser supports it (Chrome/Android, Safari/iOS) and WebM otherwise.
  Both are accepted by the backend; WebM has no frame index, so its frame count/duration are reported as
  unknown until processing fills them in.
- Each clip uploads, then processing starts with 960 px inference and a frame stride of 2 (better for small
  defects in phone footage). Results appear in Keyframes, Detection and Defect Management like any upload.
- **Continuous recording** records back-to-back clips until you press *Stop & upload*. Keep the screen on and
  the page in the foreground — mobile browsers suspend camera capture in a backgrounded tab.
- **Use my location** attaches the current GPS fix to clips from this phone. Without it, clips upload with no
  coordinate and the defect keeps the “no location” priority weight.
- A failed clip is shown in the queue with its error; it is **not** retried automatically. Record again or use
  *Video Upload* for the same file.

**Installable app (PWA).** `frontend/public/manifest.webmanifest` makes the capture screen installable: on the
phone use the browser's *Add to Home screen* and it opens standalone at `/capture`. This is the least-effort
“app” and needs no store, signing or build toolchain. A store-style Android APK would wrap the same URL with
Bubblewrap (Trusted Web Activity) or Capacitor; that needs Node plus the Android SDK and was not built here —
the page itself is already the app, so no code changes are required for that wrapping.

---

## 5. Demo accounts

Created automatically on first startup when `SEED_DEMO_DATA=true`. Password for all three: **`Urban@123`**

| Role | Email | Capabilities |
| --- | --- | --- |
| Administrator | `admin@urbanvision.ai` | everything: users, settings, delete, priority configuration |
| Municipal Officer | `officer@urbanvision.ai` | upload, process, review/approve, assign work, reports |
| Field Inspector | `inspector@urbanvision.ai` | view, run pipeline, update work status, record verified locations |

Change these credentials before any real deployment (`DEMO_PASSWORD`, or edit users in the UI).

**Self-registration is limited to Field Inspector and Municipal Officer.** The register page offers only those
two roles and `POST /api/auth/register` rejects `role: "admin"` with 403. Administrator accounts are created
only by an existing administrator from **User Management**.

---

## 6. Using the platform

1. **Video Upload** — drag an MP4/AVI/MOV (or JPG/PNG), optionally record a verified location, upload.
2. **Start AI processing** — chooses parameters (SSIM threshold, temporal gap, confidence, number of
   LayerCAM explanations) and tracks the seven stages live. Stage state is written by the backend worker;
   the interface polls it and never reports a stage as complete early.
3. **Keyframe Extraction** — read/kept/removed frames, reduction %, threshold, temporal gap, original video
   and a full-size keyframe gallery.
4. **Object Detection** — annotated frames, class filters, confidence filter, filename search, sorting and a
   detail view with bounding box, priority and explanation summary.
5. **LayerCAM Explainability** — before/after comparison slider, raw heatmap, overlay, annotation, prediction
   anchor, feature layer, gradient and heatmap statistics. Generate explanations for any other detection.
6. **Priority Analysis** — weighted score with the four contributions (S, C, R, L) per defect; administrators
   can edit weights, per-class severity/risk, location component and category thresholds (recalculates all).
7. **Defect Management** — review cases, approve/reject, assign, comment, add verified GPS, view history.
8. **Geographic Monitoring** — Leaflet map coloured by priority, filterable by class/priority/verification.
9. **Maintenance Tracking** — status board, assignments, resolution notes, full audit trail.
10. **Reports** — PDF + CSV for processing sessions, individual defects and daily/weekly/monthly periods.
11. **Processing History** — all jobs with keyframes, detections, high-priority counts, duration and actions.
12. **User Management / Settings** — accounts, roles, model status, pipeline defaults, storage paths.

---

## 7. Priority model

```
P = 100 × (0.40·S + 0.20·C + 0.25·R + 0.15·L)
```

| Component | Default rule (configurable) |
| --- | --- |
| `S` severity | per-class value: pothole 0.90, crack 0.70, garbage 0.45 |
| `C` confidence | YOLO detection confidence |
| `R` risk | per-class safety risk: pothole 0.90, crack 0.65, garbage 0.40 |
| `L` location | verified location 1.0, unverified 0.35, none 0.20 |

Initial categories: **Low 0–39, Medium 40–69, High 70–100**. These are provisional project settings, not
universal standards. All values live in the `system_settings` table (`priority_config`) and are editable in
**Priority Analysis → Edit scoring rules**; saving recalculates every stored score.

---

## 8. Database schema

`roles`, `users`, `videos`, `processing_jobs`, `keyframes`, `detections`, `explainability_results`,
`priority_scores`, `locations`, `maintenance_tasks`, `status_history`, `reports`, `system_settings`.

Binary media is never stored in the database: only paths under `backend/uploads`, `backend/outputs` and
`reports/`, exposed read-only through `/media/...`. The schema uses portable SQLAlchemy types, so switching
`DATABASE_URL` to PostgreSQL requires no model changes.

---

## 9. API overview

Auth: `POST /api/auth/login`, `POST /api/auth/register` (inspector/officer only), `GET /api/auth/me`,
`POST /api/auth/forgot-password`

Videos: `POST /api/videos/upload`, `GET /api/videos`, `GET/DELETE /api/videos/{id}`

Processing: `POST /api/processing/start/{video_id}`, `GET /api/processing/jobs`,
`GET /api/processing/{job_id}/status`, `GET /api/processing/{job_id}/results`, `DELETE /api/processing/{job_id}`

Keyframes: `GET /api/keyframes/{job_id}`, `GET /api/keyframes/single/{keyframe_id}`

Detections: `GET /api/detections` (class, job, min/max confidence, search, priority, status, sort, paging),
`GET /api/detections/{id}`

Explainability: `POST /api/explainability/generate/{detection_id}`, `GET /api/explainability/{detection_id}`,
`GET /api/explainability`

Priority: `GET /api/priority`, `GET /api/priority/{detection_id}`, `GET/PUT /api/priority/settings`,
`POST /api/priority/recalculate`

Defects & maintenance: `GET /api/defects`, `PUT /api/defects/{id}/status`, `GET/POST /api/maintenance`,
`PUT /api/maintenance/{task_id}`, `GET /api/maintenance/history/{task_id}`,
`POST /api/maintenance/comment/{detection_id}`

Locations: `GET /api/locations`, `PUT /api/locations/{detection_id}`

Reports: `GET /api/reports`, `POST /api/reports/generate`, `GET /api/reports/download/{id}?format=pdf|csv`

Dashboard: `GET /api/dashboard/summary`, `/analytics`, `/recent`

Admin: `GET/POST/PUT/DELETE /api/users`, `GET/PUT /api/settings`, `GET /api/system/status`

---

## 10. Tests

```bash
cd backend
.venv\Scripts\python -m pytest tests -q          # 24 tests
.venv\Scripts\python tests/smoke_workflow.py     # end-to-end workflow (API must be running)

cd frontend
npm test                                          # component + utility tests
npm run build                                     # typecheck + production build
```

The end-to-end smoke workflow uploads `tests/assets/sample_road.mp4`, runs SSIM extraction, YOLO detection,
LayerCAM, priority scoring, approves a defect, assigns and resolves a maintenance task, and downloads the
generated PDF and CSV. It prints every stage result.

> The bundled sample assets (`sample_road.jpg`, `sample_road.mp4`) are a generated road scene used only to
> exercise the pipeline. Replace them with real municipal footage for any accuracy evaluation.

---

## 11. Known limitations

- **LayerCAM is generated for the top-N highest-confidence detections per job** (`MAX_LAYERCAM_PER_JOB`,
  default 6) because each explanation needs a backward pass. Any other detection can be explained on demand.
  The job stage message states exactly how many were generated.
- **No email provider** is configured, so "forgot password" records the request and asks an administrator to
  reset the password in User Management.
- **GPS is never inferred from imagery.** Upload-time coordinates or a manually entered, field-verified
  location are the only sources; unverified locations lower the location component.
- **Processing is single-process/threaded**, not a distributed queue. Suitable for a workstation/demo
  deployment; a production deployment should move jobs to Celery/RQ or a managed queue.
- CPU inference is used when CUDA is unavailable; per-detection LayerCAM on CPU takes roughly 1–3 seconds.
- The Vite production bundle is a single ~1.2 MB chunk (Recharts + Leaflet + Framer Motion). Code-splitting
  is a straightforward optimisation if needed.
=======
AI-Driven Multi-Task Urban Infrastructure Monitoring and Maintenance Prioritization Using Municipal Vehicle Cameras

About the Project:

This project is being developed as part of an M.Tech Research Methodology course. The objective is to develop an AI-powered urban infrastructure monitoring system that automatically detects multiple public infrastructure issues using computer vision and cameras mounted on municipal vehicles.

Traditional municipal inspections are often manual, time-consuming, and dependent on periodic surveys or citizen complaints. These limitations can result in delayed maintenance, inconsistent reporting, and inefficient allocation of municipal resources.

The proposed system transforms municipal service vehicles, such as garbage collection trucks, into **mobile urban infrastructure monitoring units**. As vehicles travel through city roads, their cameras capture road-side scenes. Deep learning models analyze the captured frames to identify infrastructure issues, assess their severity, calculate infrastructure condition scores, and prioritize maintenance activities.

The results are presented through a GIS-enabled dashboard to help municipal authorities monitor infrastructure conditions and make informed maintenance decisions.

The project aims to improve public safety, accessibility, cleanliness, and municipal operational efficiency while supporting Smart City initiatives.

Problem Statement:

Urban infrastructure management continues to rely heavily on manual inspections and public complaints. As cities expand, monitoring every road, footpath, and public space becomes increasingly challenging.

Common Urban Infrastructure Issues:

- Illegal garbage dumping
- Garbage accumulated outside dustbins
- Potholes and damaged roads
- Broken footpaths
- Missing wheelchair ramps
- Vehicles blocking sidewalks
- Construction debris
- Waterlogging
- Open manholes
- Damaged or missing road signs
- Fallen tree branches
- Sidewalk obstructions

Limitations of Existing Approaches:

- Manual inspections require significant time and manpower.
- Citizen complaint systems depend on public participation.
- CCTV systems cover only selected locations.
- Many existing AI solutions focus on a single type of infrastructure defect.
- Maintenance prioritization often depends on manual assessment.
- Historical infrastructure conditions may not be tracked consistently.

This project proposes a unified AI-based monitoring framework that uses cameras mounted on municipal vehicles to identify multiple infrastructure issues and support data-driven maintenance planning.

Proposed Solution:

The proposed system captures road-side video using cameras installed on municipal vehicles. Selected video frames are processed using deep learning-based computer vision models to detect multiple infrastructure issues.

The system combines detection results with GPS coordinates and timestamps to maintain a location-based record of infrastructure conditions.

Key Outputs:

- Infrastructure Health Score
- Cleanliness Score
- Accessibility Score
- Safety Score
- Maintenance Priority Score
- GPS-based issue localization
- Detection confidence
- Historical condition tracking

The processed information is visualized on an interactive GIS-enabled dashboard, allowing municipal authorities to identify critical locations and prioritize maintenance activities.

Note: The scoring methods, detection categories, and prioritization rules will be defined and validated during implementation.*

Project Objectives:

1. Automatically detect multiple urban infrastructure issues using computer vision.
2. Reduce dependence on manual infrastructure inspections.
3. Utilize municipal vehicle cameras for continuous city-wide monitoring.
4. Develop a multi-task infrastructure detection framework.
5. Generate infrastructure condition and assessment scores.
6. Prioritize maintenance activities based on issue severity and location.
7. Develop an interactive GIS-based dashboard for municipal authorities.
8. Maintain historical records to monitor infrastructure deterioration and improvements.
9. Improve public safety, accessibility, and cleanliness.
10. Support data-driven decision-making for Smart City management.

Research Novelty:

Unlike solutions focused on detecting a single road defect, this project aims to integrate multiple urban infrastructure assessments into a unified monitoring and maintenance prioritization framework.

Proposed Contributions:

- Multi-task infrastructure detection:** Identify different types of urban infrastructure issues within one framework.
- Municipal vehicle-based monitoring:** Reuse existing vehicle journeys for repeated infrastructure observations.
- Infrastructure Health Index:** Combine detected conditions into interpretable infrastructure assessment scores.
- Automated maintenance prioritization:** Rank reported issues according to defined severity and priority criteria.
- GIS-based visualization:** Display detected issues and their locations on an interactive map.
- Historical monitoring:** Track changes in infrastructure conditions over time.
- Municipal decision support:** Provide structured information to support maintenance planning.

The primary goal is to move beyond defect detection and support the complete process of infrastructure monitoring, condition assessment, and maintenance decision-making.

Proposed Workflow:


Municipal Vehicle Cameras
          |
          v
Video Collection
          |
          v
Frame Extraction and Preprocessing
          |
          v
AI-Based Infrastructure Detection
          |
          v
Issue Classification and Localization
          |
          v
GPS and Timestamp Association
          |
          v
Infrastructure Condition Assessment
          |
          v
Health, Cleanliness, Accessibility
and Safety Score Generation
          |
          v
Maintenance Priority Calculation
          |
          v
GIS-Enabled Dashboard
          |
          v
Municipal Maintenance Decision Support


Infrastructure Issues to Be Detected:

The proposed system will investigate the detection of the following categories:

| Category | Examples |

| Road conditions | Potholes and damaged road surfaces |
| Waste management | Illegal dumping and garbage outside dustbins |
| Footpath conditions | Broken or damaged footpaths |
| Accessibility | Missing wheelchair ramps and inaccessible pathways |
| Sidewalk safety | Vehicles blocking footpaths and other obstructions |
| Construction-related issues | Construction debris and materials obstructing public spaces |
| Water-related issues | Waterlogging on roads and footpaths |
| Public safety | Open manholes and damaged road signs |
| Environmental obstructions | Fallen tree branches and blocked walkways |

The final categories will depend on dataset availability, annotation quality, and model performance.

Expected Input:

Primary Inputs:

- Municipal vehicle video footage
- Dashboard camera footage
- Side-mounted camera footage
- Extracted video frames
- GPS coordinates, when available
- Timestamp information

Potential Future Inputs:

- Drone imagery
- CCTV footage
- Citizen-uploaded images
- IoT sensor data
- Municipal complaint records

Expected Output:

The system is designed to generate:

- Detected infrastructure issues
- Issue categories and bounding boxes
- Detection confidence scores
- GPS-based issue locations
- Infrastructure Health Score
- Cleanliness Score
- Accessibility Score
- Safety Score
- Maintenance Priority Score
- Historical infrastructure condition records
- Interactive GIS visualizations
- Maintenance planning insights

Technologies Planned:

| Component | Technologies |

| Programming Language | Python |
| Computer Vision | OpenCV |
| Object Detection | YOLOv8 |
| Deep Learning | PyTorch |
| Data Annotation | Roboflow, LabelImg |
| Backend API | FastAPI |
| Database | PostgreSQL, SQLite |
| Frontend | React.js |
| GIS Visualization | Leaflet, OpenStreetMap |
| Data Processing | NumPy, Pandas |
| Evaluation and Analysis | Matplotlib, Scikit-learn |
| Version Control | Git, GitHub |

These are planned technologies and may be updated as the research progresses.

Dataset and Research Resources:

The initial research phase will investigate publicly available road damage datasets and additional datasets relevant to urban infrastructure.

| Dataset | Potential Use | Source |

| RDD2022 | Road damage and pothole detection | [Download RDD2022](https://figshare.com/articles/dataset/RDD2022_-_The_multi-national_Road_Damage_Dataset_released_through_CRDDC_2022/21431547) |
| RDD2020 | Road damage detection and baseline experiments | [Download RDD2020](https://data.mendeley.com/datasets/5ty2wb6gvg/1) |
| UAV-PDD2023 | Pavement distress detection | [Dataset paper](https://www.sciencedirect.com/science/article/pii/S2352340923007710) |

These datasets primarily support road damage and pavement distress research. Additional datasets and custom annotations will be investigated for categories such as garbage dumping, sidewalk obstructions, broken footpaths, and accessibility issues.

Important: Dataset suitability, licensing, annotation formats, and class compatibility must be verified before combining datasets or training a unified model.

Proposed Repository Structure:


urban-infrastructure-monitoring/
│
├── datasets/
│   ├── raw/
│   ├── processed/
│   └── annotations/
│
├── preprocessing/
│   ├── frame_extraction.py
│   └── data_preprocessing.py
│
├── models/
│   ├── detection/
│   └── checkpoints/
│
├── inference/
│   ├── detect.py
│   └── video_inference.py
│
├── scoring/
│   ├── infrastructure_health.py
│   └── maintenance_priority.py
│
├── backend/
│   ├── main.py
│   └── api/
│
├── frontend/
│
├── dashboard/
│
├── notebooks/
│
├── outputs/
│   ├── detections/
│   └── evaluation/
│
├── docs/
│   ├── literature_survey.md
│   └── methodology.md
│
├── tests/
│
├── requirements.txt
├── .gitignore
└── README.md


This is the planned repository structure. Directories and files will be added as the implementation develops.

Implementation Plan:

Phase 1 — Research and Problem Definition
- Conduct a literature survey.
- Identify research gaps.
- Define the problem statement and objectives.
- Finalize system requirements.

Phase 2 — Dataset Collection
- Identify relevant public datasets.
- Collect suitable municipal or road-side imagery, where permitted.
- Define infrastructure issue categories.
- Plan annotation guidelines.

Phase 3 — Data Preprocessing
- Extract frames from video.
- Remove unsuitable or duplicate images where appropriate.
- Resize and normalize images.
- Prepare training, validation, and test sets.

Phase 4 — Model Development
- Establish a baseline using YOLOv8.
- Configure model classes and training parameters.
- Train and validate the detection model.
- Evaluate generalization across different conditions.

Phase 5 — Infrastructure Detection
- Run inference on images and video.
- Identify multiple infrastructure issue categories.
- Record bounding boxes, classes, and confidence scores.

Phase 6 — Infrastructure Condition Assessment
- Define a transparent scoring methodology.
- Estimate condition scores from validated detection outputs.
- Investigate severity estimation where suitable labels are available.

Phase 7 — Maintenance Prioritization
- Develop a priority calculation method.
- Consider issue severity, safety impact, accessibility impact, and location.
- Generate a ranked list of issues for maintenance review.

Phase 8 — GIS Dashboard Development
- Develop backend APIs using FastAPI.
- Build a React-based dashboard.
- Display detected issues on an interactive map.
- Add filters, score summaries, and historical records.

Phase 9 — Testing and Evaluation
- Evaluate detection accuracy and system performance.
- Validate scoring and maintenance priority outputs.
- Test the end-to-end pipeline.
- Document findings and prepare the research report.

Evaluation Metrics:

Object Detection Performance:

- Precision: Proportion of predicted detections that are correct.
- Recall: Proportion of actual annotated objects that are detected.
- F1 Score: Harmonic mean of precision and recall.
- mAP: Mean Average Precision at specified IoU thresholds.

System Performance:

- Frames per second (FPS)
- Average inference time
- End-to-end processing latency
- Resource utilization

Infrastructure Assessment:

- Agreement with expert-assigned condition scores
- Agreement with expert maintenance priority rankings
- GPS localization error
- Consistency of repeated observations
- Performance across different lighting and weather conditions

The specific evaluation protocols and target values will be finalized during experimentation.

Potential Use Cases:

- Municipal infrastructure monitoring
- Smart City management
- Urban road maintenance
- Garbage dumping detection
- Footpath condition assessment
- Sidewalk accessibility monitoring
- Road damage monitoring
- Public infrastructure inspection
- Municipal maintenance planning
- Location-based infrastructure reporting

Current Project Status:

- [x] Project idea defined
- [ ] Literature survey completed
- [ ] Research gap finalized
- [ ] Dataset collection completed
- [ ] Data annotation completed
- [ ] Baseline model developed
- [ ] Multi-task detection implemented
- [ ] Infrastructure scoring implemented
- [ ] Maintenance prioritization implemented
- [ ] GIS dashboard implemented
- [ ] System evaluation completed
- [ ] Research paper prepared

Update these checkboxes as each milestone is completed.

Future Improvements:

- Road crack and pothole severity estimation
- Infrastructure Digital Twin integration
- AI-assisted maintenance prediction
- Smart City IoT integration
- Real-time municipal alerts
- Drone-assisted infrastructure monitoring
- Mobile application for field inspectors
- Automated maintenance work-order generation
- Integration with municipal complaint management systems
- Infrastructure deterioration trend analysis

Sustainable Development Goals (SDGs):

Primary Goal

SDG 11 — Sustainable Cities and Communities

The proposed system aims to support cleaner, safer, more accessible, and sustainable cities through intelligent infrastructure monitoring and data-driven maintenance planning.

Supporting Goals

- SDG 3 — Good Health and Well-being: Support safer public spaces and roads.
- SDG 9 — Industry, Innovation and Infrastructure: Encourage technology-assisted infrastructure management.
- SDG 10 — Reduced Inequalities: Help identify accessibility barriers affecting people with disabilities.
- SDG 12 — Responsible Consumption and Production: Support more efficient waste monitoring and municipal resource allocation.

Author

Monish Kumar T K 
M.Tech CSE  
Amrita School of Computing, Coimbatore

Note

This repository is under active development as part of an M.Tech Research Methodology project. The implementation, datasets, experimental results, and documentation will be updated throughout the research process.

The proposed system is intended as a research and decision-support tool. Detection outputs and maintenance recommendations should be validated before being used for operational decisions.

>>>>>>> 0fdcc247f35bd3580d7aac45eb2175bd0717d6fc
