from ultralytics import YOLO
model = YOLO("yolov8n.pt")
results = model.train (data = "dog.yaml", epochs = 100, imgsz = 640, batch = -1)