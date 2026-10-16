# Solar Seeker (v2.0) — AI Rooftop Solar Assessment & Energy Management Platform

**Version:** `2.0.0`  
**Calibration:** Beylikdüzü, Istanbul (GSD = 0.15 m/px, EPDK Tariffs)

Solar Seeker is an AI-driven rooftop photovoltaic (PV) assessment platform built for urban satellite environments. It extracts rooftop geometry using deep learning segmentation (U-Net with ResNet-34 backbone), queries the European Commission PVGIS API (v5.3) for solar radiation yield, generates 25-year financial cash flow projections, and features **Phoebe HEMS** (an AI Home Energy Management System with Model Predictive Control battery dispatch).

---

## 📁 Project Architecture & Directory Layout

```text
solar-seeker/
├── frontend/                     # React 19 + Vite + Tailwind CSS Single-Page Application
│   ├── src/
│   │   ├── components/           # Header, Stepper, Step1Upload, Step2PolygonSelector, Step3Results, Phoebe
│   │   ├── constants/            # Global physics, EPDK tariffs & theme configurations
│   │   ├── App.jsx               # Wizard & Studio state coordinator
│   │   └── main.jsx
│   ├── public/sample_satellite.png # Default aerial sample image
│   └── package.json
│
├── backend/                      # FastAPI REST API & Physics/Financial Engines
│   ├── main.py                   # API routes (/api/detect_roofs, /api/calculate_solar, /api/phoebe/*)
│   ├── solar_engine.py           # EU PVGIS API (5.3) & 25-Year Financial Math Engine
│   ├── phoebe_engine.py          # 120-min rolling forecast & MPC battery dispatch simulator
│   ├── geometry.py               # OpenCV contour extraction & RDP polygon regularization
│   └── requirements.txt          # Python backend dependencies
│
├── models/
│   ├── unet-latest/              # Latest production model weights & evaluation artifacts
│   │   ├── unet_roof_obstacle.pth # Trained U-Net checkpoint (Inria + Istanbul aerial tiles)
│   │   ├── sample_predictions.png
│   │   └── training_history.png
│   ├── unet/                     # PyTorch U-Net training pipeline & test suite
│   │   └── unet_training.py
│   ├── phoebe/                   # Phoebe HEMS load forecasting model (RandomForest/Joblib)
│   └── yolo/                     # YOLO segmentation training pipelines
│
├── sample_images/                # Standalone sample satellite images
│   └── sample_satellite.jpeg     # Calibrated Beylikdüzü sample aerial snapshot
│
├── requirements.txt              # Root Python dependency specifications
└── README.md
```

---

## 🚀 Quickstart Guide: Running on Your Laptop

### 1. Prerequisites
- **Python 3.10+** (tested on Python 3.11 / 3.12)
- **Node.js 18+** & **npm**
- **Git** & **Git LFS** (for downloading model weights)

---

### 2. Frontend Setup & Launch
Navigate to `frontend/`, install dependencies, and start the Vite development server:

```bash
# In Terminal 1:
cd frontend
npm install
npm run dev
```

The web application will open at: **`http://localhost:5173`**  
*(Click **"Use Sample Image"** on the upload screen to immediately test rooftop detection without needing to take a custom screenshot).*

---

### 3. Backend Setup & Launch
Create and activate a Python virtual environment, install requirements, and start the FastAPI server:

```bash
# In Terminal 2:
# Windows (PowerShell):
python -m venv solarseeker
.\solarseeker\Scripts\Activate.ps1

# Linux / macOS:
# python -m venv solarseeker
# source solarseeker/bin/activate

# Install dependencies:
pip install -r backend/requirements.txt

# Start the server:
cd backend
uvicorn main:app --reload --port 8000
```

- Interactive Swagger documentation & API sandbox: **`http://127.0.0.1:8000/docs`**

---

### 4. Key Endpoints

- `POST /api/detect_roofs`: Accepts a satellite image file, executes U-Net inference, regularizes polygons via RDP, and returns pixel coordinates and real-world $m^2$ metrics.
- `POST /api/calculate_solar`: Sizes the system ($kWp$, 65% packing factor, 0.20 $kWp/m^2$), queries EU PVGIS, and computes 25-year financial ROI and environmental metrics.
- `GET /api/phoebe/presets`: Returns standard household load profiles (evening peak, high summer load, weekend).
- `POST /api/phoebe/simulate`: Runs a 120-minute rolling horizon forecast and MPC battery charge/discharge optimization.

---

### 5. Customization & Adjustments

- **Physical & Economic Assumptions:** Modify [`frontend/src/constants/config.js`](frontend/src/constants/config.js) to adjust electricity tariffs, install cost per kWp, packing factor, or location coordinates.
- **Model Inference & Polygons:** Adjust segmentation threshold or polygon smoothing in [`backend/main.py`](backend/main.py).
