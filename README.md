# Solar Seeker — AI Rooftop Solar Assessment Platform

Solar Seeker is an AI-driven rooftop photovoltaic (PV) assessment platform calibrated for urban satellite environments (initially calibrated for Beylikdüzü, Istanbul). It extracts building rooftop geometry using deep learning segmentation, queries the European Commission PVGIS API for real-world solar radiation, and generates 25-year financial ROI projections.

---

## 📁 Project Architecture & Directory Layout

The project is organized into clear, decoupled modules:

```text
solar-seeker/
├── frontend/                 # React + Vite + Tailwind CSS Single-Page Application
│   ├── src/
│   │   ├── components/       # Header, Stepper, Step1Upload, Step2PolygonSelector, Step3Results
│   │   ├── App.jsx           # 3-Step Wizard state coordinator
│   │   └── main.jsx
│   ├── public/sample_satellite.png # Built-in sample screenshot for instant testing
│   └── package.json
│
├── backend/                  # FastAPI REST API & Physics/Financial Engines
│   ├── main.py               # Application endpoints (/api/detect_roofs, /api/calculate_solar)
│   ├── solar_engine.py       # EU PVGIS API (5.3) & 25-Year Financial Math Engine
│   ├── geometry.py           # OpenCV contour extraction & RDP polygon regularization
│   └── requirements.txt      # Python backend dependency specifications
│
├── models/
│   ├── unet/                 # PyTorch U-Net Architecture
│   │   ├── unet_training.py  # U-Net (ResNet-34) training pipeline with Dice+BCE loss
│   │   ├── test_model.py     # End-to-end model verification script
│   │   ├── unet_roof_obstacle.pth # Trained model weights (ImageNet backbone)
│   │   └── training_history.png, sample_predictions.png, test_result.png
│   │
│   └── yolo/                 # YOLO26 Instance/Semantic Segmentation Pipeline
│       ├── train_yolo26.py   # Standalone YOLO26 training script with auto-split
│       └── train_yolo26_colab.ipynb # Google Colab GPU training notebook
│
├── data/
│   ├── datasets/             # Packaged annotation archives
│   ├── images/               # Satellite & Aerial Imagery
│   └── scripts/              # Batch aerial image cropping utility
│
├── docs/                     # Project Specifications & Reference
└── requirements.txt          # Root Python environment specification
```

---

## 🚀 Quickstart Guides

### 1. Running the FastAPI Backend Server
```bash
# Terminal 1 (Backend):
cd backend
uvicorn main:app --reload --port 8000
```
Open interactive Swagger docs at: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

### 2. Running the React Frontend
```bash
# Terminal 2 (Frontend):
cd frontend
npm run dev
```
Open the web app in your browser at: [http://localhost:5173](http://localhost:5173)

#### Key Endpoints:
- `POST /api/detect_roofs`: Accepts satellite image crop, returns list of regularized polygons with pixel coordinates and $m^2$ area for interactive frontend selection.
- `POST /api/calculate_solar`: Accepts user-verified rooftop area ($m^2$), queries EU PVGIS, and calculates system size ($kWp$), annual yield ($kWh$), and 25-year ROI.
- `POST /analyze_roof`: Legacy end-to-end endpoint.

---

### 2. Testing the U-Net Model (CLI)
```bash
python models/unet/test_model.py
```
Automatically loads `models/unet/unet_roof_obstacle.pth`, runs inference on `data/images/test_images_cropped/image.png`, calls the PVGIS API, and saves visual results to `test_result.png`.

---

### 3. Training YOLO26 Segmentation

#### On Google Colab (Recommended for GPU):
1. Open Google Colab and upload `models/yolo/train_yolo26_colab.ipynb`.
2. Enable GPU: **Runtime** ➔ **Change runtime type** ➔ **T4 GPU**.
3. Upload `data/datasets/solar_seeker_yolo_dataset.zip` and run all cells.

#### Locally or on Linux Server:
```bash
python models/yolo/train_yolo26.py --data data/datasets/solar_seeker_yolo_dataset.zip --epochs 60 --batch 4 --imgsz 640
```

---

### 4. Cropping Raw Satellite Images
```bash
python data/scripts/crop_images.py
```
Processes images from `data/images/test_images_uncropped` into `data/images/test_images_cropped`.
