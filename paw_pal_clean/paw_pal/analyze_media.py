import json
import os
import sys

EXPECTED_CLASSES = {"keratosis", "nasal_discharge", "skin_lesions"}


def read_conf_threshold():
    raw = os.environ.get("PAW_AI_CONF_THRESHOLD", "0.10")
    try:
        value = float(raw)
    except ValueError:
        return 0.10
    if value < 0:
        return 0.0
    if value > 1:
        return 1.0
    return value


def extract_best_detection(results):
    best_conf = 0.0
    best_cls = None
    for r in results or []:
        if r.boxes is None or len(r.boxes) == 0:
            continue
        confs = r.boxes.conf.tolist()
        classes = r.boxes.cls.tolist()
        frame_best_idx = max(range(len(confs)), key=lambda i: confs[i])
        frame_best_conf = float(confs[frame_best_idx])
        if frame_best_conf > best_conf:
            best_conf = frame_best_conf
            best_cls = int(classes[frame_best_idx])
    return best_cls, best_conf


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "Missing source path"}))
        return 1

    source = sys.argv[1]
    custom_model_path = sys.argv[2] if len(sys.argv) > 2 else None
    if not os.path.exists(source):
        print(json.dumps({"ok": False, "error": "Source file not found"}))
        return 1

    try:
        from ultralytics import YOLO
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"Ultralytics unavailable: {e}"}))
        return 1

    project_dir = os.path.dirname(os.path.abspath(__file__))
    model_candidates = []
    if custom_model_path:
        model_candidates.append(custom_model_path)
    model_candidates.extend(
        [
            os.path.join(project_dir, "runs", "detect", "train", "weights", "best.pt"),
            os.path.join(project_dir, "runs", "detect", "train2", "weights", "best.pt"),
        ]
    )

    model_path = None
    for candidate in model_candidates:
        if os.path.exists(candidate):
            model_path = candidate
            break

    if not model_path:
        print(json.dumps({"ok": False, "error": "No model weights found"}))
        return 1

    try:
        model = YOLO(model_path)
        model_names = set(model.names.values()) if isinstance(model.names, dict) else set()
        if not EXPECTED_CLASSES.issubset(model_names):
            print(
                json.dumps(
                    {
                        "ok": False,
                        "error": f"Model classes mismatch. Expected {sorted(EXPECTED_CLASSES)}, got {sorted(model_names)}",
                    }
                )
            )
            return 1

        conf_threshold = read_conf_threshold()
        results = model.predict(source=source, conf=conf_threshold, imgsz=640, verbose=False, save=False)
        best_cls, best_conf = extract_best_detection(results)

        if best_cls is None:
            # Fallback pass: maximize sensitivity for hard/low-quality close-ups.
            fallback_results = model.predict(source=source, conf=0.001, imgsz=960, verbose=False, save=False)
            best_cls, best_conf = extract_best_detection(fallback_results)

        if best_cls is None:
            print(json.dumps({"ok": True, "diagnosis": "undetected", "confidence": 0.0}))
            return 0

        diagnosis = model.names.get(best_cls, str(best_cls))
        if diagnosis not in EXPECTED_CLASSES:
            print(json.dumps({"ok": False, "error": f"Predicted unexpected class: {diagnosis}"}))
            return 1

        print(json.dumps({"ok": True, "diagnosis": diagnosis, "confidence": best_conf}))
        return 0
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"Inference failed: {e}"}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
