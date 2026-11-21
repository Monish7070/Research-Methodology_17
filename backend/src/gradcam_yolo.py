"""Member 3 - LayerCAM explainability for detection-specific YOLO predictions.

This module preserves the working LayerCAM implementation: rectangular letterbox
preprocessing, class-aware anchor matching, dynamic P3/P4/P5 feature-level
selection from the actual Detect-head inputs, and letterbox padding removal
before the heatmap is restored to original image coordinates.

LayerCAM (not Grad-CAM) is used because gradients keep their spatial variation
instead of being averaged into one weight per channel.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn.functional as F
from ultralytics import YOLO
from ultralytics.data.augment import LetterBox

DETECTION_FEATURE_LAYERS = (0, 1, 2)  # Actual Detect-head input scales, captured dynamically

CLASS_COLORS = {
    "crack": (0, 0, 255),
    "garbage": (0, 255, 0),
    "pothole": (255, 100, 0),
}

CAM_METHODS = {"gradcam", "layercam"}


def prepare_image(image, imgsz):
    """Match Ultralytics rectangular letterbox preprocessing."""
    h, w = image.shape[:2]

    letterbox = LetterBox(new_shape=(imgsz, imgsz), auto=True, stride=32)

    padded = letterbox(image=image)

    ratio = min(imgsz / h, imgsz / w)

    new_w = round(w * ratio)
    new_h = round(h * ratio)

    left = round((padded.shape[1] - new_w) / 2 - 0.1)
    top = round((padded.shape[0] - new_h) / 2 - 0.1)

    rgb = cv2.cvtColor(padded, cv2.COLOR_BGR2RGB)

    tensor = torch.from_numpy(rgb).permute(2, 0, 1)
    tensor = tensor.float().unsqueeze(0) / 255.0

    return tensor, {
        "ratio": ratio,
        "left": left,
        "top": top,
        "new_w": new_w,
        "new_h": new_h,
        "input_w": padded.shape[1],
        "input_h": padded.shape[0],
        "original_w": w,
        "original_h": h,
    }


def original_box_to_model(box, meta):
    """Convert original-image xyxy box to letterboxed coordinates."""
    x1, y1, x2, y2 = box
    r = meta["ratio"]

    return np.array(
        [
            x1 * r + meta["left"],
            y1 * r + meta["top"],
            x2 * r + meta["left"],
            y2 * r + meta["top"],
        ],
        dtype=np.float32,
    )


def xywh_to_xyxy(boxes):
    """Convert N x 4 xywh boxes to xyxy."""
    result = boxes.copy()

    result[:, 0] = boxes[:, 0] - boxes[:, 2] / 2
    result[:, 1] = boxes[:, 1] - boxes[:, 3] / 2
    result[:, 2] = boxes[:, 0] + boxes[:, 2] / 2
    result[:, 3] = boxes[:, 1] + boxes[:, 3] / 2

    return result


def calculate_ious(box, boxes):
    """Calculate IoU between one box and multiple boxes."""
    x1 = np.maximum(box[0], boxes[:, 0])
    y1 = np.maximum(box[1], boxes[:, 1])
    x2 = np.minimum(box[2], boxes[:, 2])
    y2 = np.minimum(box[3], boxes[:, 3])

    intersection = np.maximum(0, x2 - x1) * np.maximum(0, y2 - y1)

    area_a = max(0, box[2] - box[0]) * max(0, box[3] - box[1])

    area_b = np.maximum(0, boxes[:, 2] - boxes[:, 0]) * np.maximum(0, boxes[:, 3] - boxes[:, 1])

    union = area_a + area_b - intersection

    return intersection / np.maximum(union, 1e-9)


def get_detection_feature_level(anchor_index, captured):
    """Map a flattened YOLO anchor index using actual feature-map sizes."""
    start = 0
    for layer_index in DETECTION_FEATURE_LAYERS:
        if layer_index not in captured:
            raise RuntimeError(f"Missing captured activation for layer {layer_index}")

        activation = captured[layer_index]
        height, width = activation.shape[-2:]
        count = height * width
        end = start + count

        if start <= anchor_index < end:
            local_index = anchor_index - start
            grid_y, grid_x = divmod(local_index, width)
            return layer_index, start, end, grid_y, grid_x

        start = end

    raise IndexError(
        f"Anchor {anchor_index} is outside captured feature range (total anchors: {start})"
    )


def make_gradcam(activation, gradient, output_size, method="layercam"):
    """Generate standard Grad-CAM or LayerCAM from one target detection."""
    activation = activation.detach()
    gradient = gradient.detach()

    if method == "gradcam":
        # Standard Grad-CAM: one importance weight per feature channel.
        channel_weights = gradient.mean(dim=(2, 3), keepdim=True)
        cam = torch.relu((channel_weights * activation).sum(dim=1, keepdim=True))
    elif method == "layercam":
        # LayerCAM: preserve spatial variation in positive gradients.
        cam = torch.relu((torch.relu(gradient) * activation).sum(dim=1, keepdim=True))
    else:
        raise ValueError(f"Unsupported CAM method: {method}")

    cam = F.interpolate(cam, size=output_size, mode="bilinear", align_corners=False)
    cam = cam[0, 0].float().cpu().numpy()
    cam = np.nan_to_num(cam, nan=0.0, posinf=0.0, neginf=0.0)
    cam = np.maximum(cam, 0.0)

    # Normalize without allowing a single extreme pixel to dominate.
    positive = cam[cam > 0]
    if positive.size == 0:
        return np.zeros_like(cam, dtype=np.float32)

    scale = float(np.percentile(positive, 99.5))
    if not np.isfinite(scale) or scale < 1e-12:
        scale = float(positive.max())
    if scale < 1e-12:
        return np.zeros_like(cam, dtype=np.float32)

    cam = np.clip(cam / scale, 0.0, 1.0)
    return cam.astype(np.float32)


def restore_cam(cam, meta):
    """Remove letterbox padding and restore original dimensions."""
    left = meta["left"]
    top = meta["top"]

    new_w = meta["new_w"]
    new_h = meta["new_h"]

    cropped = cam[top : top + new_h, left : left + new_w]

    return cv2.resize(cropped, (meta["original_w"], meta["original_h"]))


def blend_cam(
    image,
    cam,
    opacity=0.45,
    threshold=0.12,
    blur_sigma=2.0,
    style="classic",
    gamma=1.0,
):
    """Render a CAM overlay (classic full-frame JET blend, or masked)."""
    cam = np.asarray(cam, dtype=np.float32)
    cam = np.nan_to_num(cam, nan=0.0, posinf=0.0, neginf=0.0)
    cam = np.clip(cam, 0.0, 1.0)

    # Smooth only the display copy. The saved raw CAM remains unchanged.
    if blur_sigma > 0:
        cam_display = cv2.GaussianBlur(cam, (0, 0), sigmaX=blur_sigma, sigmaY=blur_sigma)
    else:
        cam_display = cam.copy()

    cam_display = np.clip(cam_display, 0.0, 1.0)

    if gamma > 0 and abs(gamma - 1.0) > 1e-6:
        cam_display = np.power(cam_display, gamma)

    heatmap = cv2.applyColorMap(np.uint8(np.clip(cam_display, 0.0, 1.0) * 255), cv2.COLORMAP_JET)

    if style == "classic":
        blended = cv2.addWeighted(image, 1.0 - opacity, heatmap, opacity, 0)
    elif style == "masked":
        strength = np.clip((cam_display - threshold) / max(1.0 - threshold, 1e-6), 0.0, 1.0)
        alpha = (strength * opacity)[..., None]
        blended = image.astype(np.float32) * (1.0 - alpha) + heatmap.astype(np.float32) * alpha
        blended = np.clip(blended, 0, 255).astype(np.uint8)
    else:
        raise ValueError(f"Unknown CAM display style: {style}")

    return blended


def create_overlay(
    image,
    cam,
    box,
    class_name,
    confidence,
    opacity=0.45,
    threshold=0.12,
    blur_sigma=2.0,
    style="classic",
    gamma=1.0,
    method="layercam",
):
    """Create the heatmap overlay and detection annotation."""
    overlay = blend_cam(
        image,
        cam,
        opacity=opacity,
        threshold=threshold,
        blur_sigma=blur_sigma,
        style=style,
        gamma=gamma,
    )

    x1, y1, x2, y2 = map(int, box)
    h, w = image.shape[:2]
    x1, x2 = np.clip([x1, x2], 0, w - 1)
    y1, y2 = np.clip([y1, y2], 0, h - 1)
    color = CLASS_COLORS.get(class_name, (0, 255, 0))

    cv2.putText(
        overlay,
        f"{method.upper().replace('CAM', '-CAM')}: {class_name}",
        (12, 36),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.85,
        (210, 210, 210),
        2,
        cv2.LINE_AA,
    )

    cv2.rectangle(overlay, (x1, y1), (x2, y2), color, 3)
    label = f"{class_name} {confidence:.2f}"
    cv2.putText(
        overlay,
        label,
        (x1, max(24, y1 - 10)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        color,
        2,
        cv2.LINE_AA,
    )
    return overlay


def safe_filename(value):
    return re.sub(r"[^a-zA-Z0-9_-]", "_", value)


def _heatmap_stats(cam):
    cam = np.asarray(cam, dtype=np.float32)
    percentiles = np.percentile(cam, [25, 50, 75, 90, 95, 99]) if cam.size else [0] * 6
    return {
        "min": float(cam.min()) if cam.size else 0.0,
        "max": float(cam.max()) if cam.size else 0.0,
        "mean": float(cam.mean()) if cam.size else 0.0,
        "std": float(cam.std()) if cam.size else 0.0,
        "percentiles": {
            "p25": float(percentiles[0]),
            "p50": float(percentiles[1]),
            "p75": float(percentiles[2]),
            "p90": float(percentiles[3]),
            "p95": float(percentiles[4]),
            "p99": float(percentiles[5]),
        },
    }


def process_frame(
    image_path,
    frame_record,
    model,
    net,
    head,
    class_to_id,
    output_dir,
    imgsz=640,
    iou_threshold=0.10,
    cam_method="layercam",
    cam_opacity=0.45,
    cam_threshold=0.12,
    cam_blur=2.0,
    cam_style="classic",
    cam_gamma=1.0,
    max_detections=None,
    detection_offset=0,
):
    """Generate LayerCAM for YOLO detections in one frame.

    `detection_offset` continues the detection numbering across frames so saved
    file names stay unique when a pipeline explains several frames.
    """
    if cam_method not in CAM_METHODS:
        raise ValueError(f"Unsupported CAM method: {cam_method}")

    image = cv2.imread(str(image_path))

    if image is None:
        raise RuntimeError(f"Unreadable image: {image_path}")

    tensor, meta = prepare_image(image, imgsz)

    device = next(net.parameters()).device
    tensor = tensor.to(device)
    tensor.requires_grad_(True)

    captured = {}
    hooks = []

    def capture_detect_inputs(module, inputs):
        """Capture the exact feature maps consumed by the Detect head."""
        if len(inputs) == 1 and isinstance(inputs[0], (list, tuple)):
            feature_maps = inputs[0]
        else:
            feature_maps = inputs

        for scale_index, feature in enumerate(feature_maps):
            if torch.is_tensor(feature) and feature.ndim == 4:
                captured[scale_index] = feature

    hooks.append(head.register_forward_pre_hook(capture_detect_inputs))

    old_head_training = head.training
    results = []

    class_to_id = {str(k).lower(): int(v) for k, v in class_to_id.items()}

    try:
        head.training = True

        with torch.enable_grad():
            raw = net(tensor)

            if not isinstance(raw, dict):
                raise RuntimeError(f"Expected raw prediction dictionary, got {type(raw)}")

            scores = raw["scores"]

            decoded_xywh = head._get_decode_boxes(raw)

            predicted_boxes = decoded_xywh[0].detach().cpu().numpy().T

            predicted_boxes = xywh_to_xyxy(predicted_boxes)

            detections = frame_record.get("detections", [])

            if max_detections is not None:
                detections = detections[:max_detections]

            valid_detections = []

            for detection in detections:
                class_name = str(detection.get("class_name", "")).lower()
                bbox = detection.get("bbox")

                if class_name not in class_to_id or bbox is None:
                    continue

                class_id = class_to_id[class_name]

                model_box = original_box_to_model(bbox, meta)

                ious = calculate_ious(model_box, predicted_boxes)

                predicted_class_ids = scores[0].detach().argmax(dim=0).cpu().numpy()
                class_candidate_indices = np.flatnonzero(predicted_class_ids == class_id)

                if class_candidate_indices.size:
                    candidate_ious = ious[class_candidate_indices]
                    best_position = int(np.argmax(candidate_ious))
                    anchor_index = int(class_candidate_indices[best_position])
                    best_iou = float(ious[anchor_index])
                    class_match_fallback = False
                else:
                    anchor_index = int(np.argmax(ious))
                    best_iou = float(ious[anchor_index])
                    class_match_fallback = True

                valid_detections.append(
                    {
                        "detection": detection,
                        "class_name": class_name,
                        "class_id": class_id,
                        "anchor_index": anchor_index,
                        "iou": best_iou,
                        "class_match_fallback": class_match_fallback,
                        "model_box": model_box.tolist(),
                    }
                )

            combined_cam = np.zeros((image.shape[0], image.shape[1]), dtype=np.float32)

            frame_name = Path(image_path).stem

            frame_output = output_dir / safe_filename(frame_name)
            frame_output.mkdir(parents=True, exist_ok=True)

            original_path = frame_output / "original.jpg"
            cv2.imwrite(str(original_path), image)

            for detection_number, item in enumerate(valid_detections):
                class_name = item["class_name"]
                class_id = item["class_id"]
                anchor_index = item["anchor_index"]

                target = scores[0, class_id, anchor_index]

                (selected_layer, level_start, level_end, anchor_y, anchor_x) = (
                    get_detection_feature_level(anchor_index, captured)
                )

                activation = captured[selected_layer]
                feature_height, feature_width = activation.shape[-2:]

                box = item["model_box"]
                box_center_x = float((box[0] + box[2]) / 2)
                box_center_y = float((box[1] + box[3]) / 2)
                cell_center_x = (anchor_x + 0.5) * meta["input_w"] / feature_width
                cell_center_y = (anchor_y + 0.5) * meta["input_h"] / feature_height

                print(
                    f"Detection anchor: {anchor_index}, feature range: [{level_start}, {level_end}), "
                    f"CAM layer: {selected_layer}, activation shape: {tuple(activation.shape)}"
                )
                print(
                    f"Spatial check -> anchor grid: ({anchor_y}, {anchor_x}), "
                    f"box center: ({box_center_x:.1f}, {box_center_y:.1f}), "
                    f"cell center: ({cell_center_x:.1f}, {cell_center_y:.1f})"
                )

                gradient = torch.autograd.grad(
                    outputs=target,
                    inputs=activation,
                    retain_graph=(detection_number < len(valid_detections) - 1),
                    allow_unused=False,
                )[0]

                gradient_stats = {
                    "absolute_mean": float(gradient.abs().mean().item()),
                    "mean": float(gradient.mean().item()),
                    "max": float(gradient.max().item()),
                    "min": float(gradient.min().item()),
                    "positive_elements": int((gradient > 0).sum().item()),
                    "total_elements": int(gradient.numel()),
                }

                cam_640 = make_gradcam(
                    activation,
                    gradient,
                    output_size=(meta["input_h"], meta["input_w"]),
                    method=cam_method,
                )

                cam_original = restore_cam(cam_640, meta)

                # Diagnostic only: measure explanation/box overlap. The CAM is
                # never masked to the box, which would fake localization.
                bx1, by1, bx2, by2 = map(int, item["detection"]["bbox"])
                image_h, image_w = cam_original.shape[:2]
                bx1, bx2 = np.clip([bx1, bx2], 0, image_w)
                by1, by2 = np.clip([by1, by2], 0, image_h)
                roi_cam = cam_original[by1:by2, bx1:bx2]
                outside_mask = np.ones(cam_original.shape, dtype=bool)
                outside_mask[by1:by2, bx1:bx2] = False
                outside_cam = cam_original[outside_mask]

                bbox_stats = {
                    "box_cam_max": float(roi_cam.max()) if roi_cam.size else 0.0,
                    "box_cam_mean": float(roi_cam.mean()) if roi_cam.size else 0.0,
                    "box_percent_above_0_10": float((roi_cam > 0.10).mean() * 100)
                    if roi_cam.size
                    else 0.0,
                    "outside_cam_max": float(outside_cam.max()) if outside_cam.size else 0.0,
                    "outside_cam_mean": float(outside_cam.mean()) if outside_cam.size else 0.0,
                }

                heatmap_stats = _heatmap_stats(cam_original)

                combined_cam = np.maximum(combined_cam, cam_original)

                detection = item["detection"]
                confidence = float(detection["confidence"])
                bbox = detection["bbox"]

                overlay = create_overlay(
                    image,
                    cam_original,
                    bbox,
                    class_name,
                    confidence,
                    opacity=cam_opacity,
                    threshold=cam_threshold,
                    blur_sigma=cam_blur,
                    style=cam_style,
                    gamma=cam_gamma,
                    method=cam_method,
                )

                number = detection_offset + detection_number + 1
                suffix = f"{safe_filename(class_name)}_{number}"

                raw_cam_path = frame_output / f"{cam_method}_raw_{suffix}.png"
                cv2.imwrite(str(raw_cam_path), np.uint8(np.clip(cam_original, 0, 1) * 255))

                overlay_path = frame_output / f"{cam_method}_{suffix}.png"
                cv2.imwrite(str(overlay_path), overlay)

                warning = None
                if item["iou"] < iou_threshold:
                    warning = "Low IoU: inspect prediction-to-detection match"
                if item["class_match_fallback"]:
                    warning = (
                        "No anchor predicted this class as its top class; "
                        "the highest-IoU anchor across all classes was used."
                    )

                results.append(
                    {
                        "image": Path(image_path).name,
                        "class_name": class_name,
                        "confidence": confidence,
                        "bbox": bbox,
                        "prediction_index": anchor_index,
                        "matching_iou": item["iou"],
                        "target_score": float(target.detach().item()),
                        "cam_method": cam_method,
                        "cam_display_style": cam_style,
                        "feature_layer": selected_layer,
                        "activation_shape": list(activation.shape),
                        "gradient_stats": gradient_stats,
                        "heatmap_stats": heatmap_stats,
                        "bbox_stats": bbox_stats,
                        "class_match_fallback": item["class_match_fallback"],
                        "warning": warning,
                        "raw_cam_path": str(raw_cam_path),
                        "overlay_path": str(overlay_path),
                        "cam_path": str(overlay_path),
                        # Retained for downstream compatibility.
                        "gradcam_path": str(overlay_path),
                        "original_path": str(original_path),
                    }
                )

                print(f"LayerCAM saved: {overlay_path} ({cam_method})")

            combined_path = None
            if valid_detections:
                combined_overlay = blend_cam(
                    image,
                    combined_cam,
                    opacity=cam_opacity,
                    threshold=cam_threshold,
                    blur_sigma=cam_blur,
                    style=cam_style,
                    gamma=cam_gamma,
                )

                for item in valid_detections:
                    detection = item["detection"]
                    x1, y1, x2, y2 = map(int, detection["bbox"])
                    class_name = item["class_name"]
                    color = CLASS_COLORS.get(class_name, (255, 255, 255))

                    cv2.rectangle(combined_overlay, (x1, y1), (x2, y2), color, 2)
                    cv2.putText(
                        combined_overlay,
                        class_name,
                        (x1, max(20, y1 - 8)),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.6,
                        color,
                        2,
                    )

                combined_path = frame_output / f"{cam_method}_combined_overlay.jpg"
                cv2.imwrite(str(combined_path), combined_overlay)

            for result in results:
                result["combined_path"] = str(combined_path) if combined_path else None

    finally:
        for hook in hooks:
            hook.remove()

        head.training = old_head_training

    return results


def load_explainability_model(weights):
    """Load the YOLO model plus the raw network/Detect head once per worker."""
    model = YOLO(str(weights))
    net = model.model
    net.eval()
    head = net.model[-1]
    class_to_id = {str(name).lower(): int(class_id) for class_id, name in model.names.items()}
    return model, net, head, class_to_id


def main():
    parser = argparse.ArgumentParser(description="Detection-specific YOLO LayerCAM visualization")

    parser.add_argument("--images", default="data/RVI1_clean")
    parser.add_argument("--detections", default="data/RV1.json")
    parser.add_argument("--weights", required=True)
    parser.add_argument("--out", default="data/gradcam")
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--max-images", type=int, default=0, help="0 means process all images")
    parser.add_argument("--iou-threshold", type=float, default=0.10)
    parser.add_argument(
        "--cam-method",
        choices=("gradcam", "layercam"),
        default="layercam",
        help="layercam preserves spatial gradients; gradcam is standard Grad-CAM.",
    )
    parser.add_argument("--cam-opacity", type=float, default=0.45)
    parser.add_argument("--cam-threshold", type=float, default=0.12)
    parser.add_argument("--cam-blur", type=float, default=2.0)
    parser.add_argument("--cam-style", choices=("classic", "masked"), default="classic")
    parser.add_argument("--cam-gamma", type=float, default=1.0)

    args = parser.parse_args()

    images_dir = Path(args.images)
    detections_path = Path(args.detections)
    output_dir = Path(args.out)

    output_dir.mkdir(parents=True, exist_ok=True)

    if not images_dir.exists():
        raise FileNotFoundError(images_dir)
    if not detections_path.exists():
        raise FileNotFoundError(detections_path)

    frame_records = json.loads(detections_path.read_text(encoding="utf-8"))

    print("Loading YOLO model...")
    model, net, head, class_to_id = load_explainability_model(args.weights)

    print("Classes:", class_to_id)
    print("CAM method:", args.cam_method)

    all_results = []
    records = frame_records
    if args.max_images > 0:
        records = records[: args.max_images]

    offset = 0
    for frame_number, record in enumerate(records, start=1):
        image_path = images_dir / record["image"]

        if not image_path.exists():
            print("Missing image:", image_path)
            continue

        print(f"\nProcessing {frame_number}/{len(records)}: {record['image']}")

        frame_results = process_frame(
            image_path=image_path,
            frame_record=record,
            model=model,
            net=net,
            head=head,
            class_to_id=class_to_id,
            output_dir=output_dir,
            imgsz=args.imgsz,
            iou_threshold=args.iou_threshold,
            cam_method=args.cam_method,
            cam_opacity=args.cam_opacity,
            cam_threshold=args.cam_threshold,
            cam_blur=args.cam_blur,
            cam_style=args.cam_style,
            cam_gamma=args.cam_gamma,
            detection_offset=offset,
        )
        offset += len(frame_results)
        all_results.extend(frame_results)

    results_path = output_dir / "gradcam_results.json"
    results_path.write_text(json.dumps(all_results, indent=2), encoding="utf-8")

    print("Total processed detections:", len(all_results))
    print("Results:", results_path)


if __name__ == "__main__":
    main()
