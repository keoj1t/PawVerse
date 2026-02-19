import argparse
from ultralytics import YOLO


def main():
    parser = argparse.ArgumentParser(description="Fine-tune Paw disease detection model.")
    parser.add_argument("--data", default="dog.yaml", help="Path to dataset yaml")
    parser.add_argument("--weights", default="yolov8n.pt", help="Base weights")
    parser.add_argument("--epochs", type=int, default=80, help="Training epochs")
    parser.add_argument("--imgsz", type=int, default=640, help="Image size")
    parser.add_argument("--batch", type=int, default=16, help="Batch size")
    args = parser.parse_args()

    model = YOLO(args.weights)
    model.train(
        data=args.data,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        project="runs",
        name="detect",
        exist_ok=True,
    )


if __name__ == "__main__":
    main()
