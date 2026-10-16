# Solar Seeker — Master Project Handout & Status Documentation

## 1. Project Objective & Vision
Solar Seeker is an automated, AI-driven rooftop photovoltaic (PV) assessment platform calibrated for urban environments (initially calibrated for Beylikdüzü, Istanbul: Lat 41.0026, Lon 28.6417).

The platform allows users to submit or select satellite imagery of a building, extracts the rooftop geometry using deep learning, and estimates:
1. **Gross and Net Usable Solar Area ($m^2$)**
2. **System Peak Capacity ($kWp$)**
3. **Annual Energy Yield ($kWh/\text{year}$)** via official EU PVGIS API
4. **Financial Feasibility & ROI** (CapEx, payback period, 25-year cash flow)

---

## 2. 4-Tier Architecture Pipeline

```
[Satellite Image (Google Maps)]
              │
              ▼
   [Tier 1: Vision Engine]
   • U-Net (ResNet-34 backbone, ImageNet pre-trained)
   • Predicts binary Roof mask
   • RDP regularization (cv2.approxPolyDP) for sharp geometric polygons
   • Ground Sample Distance (GSD = 0.15 m/px)
              │
              ▼
   [Tier 2: Geometric & Physical Packing]
   • 65% Utilization / Packing Factor (accounts for setbacks, pathways)
   • Panel density: 0.20 kWp / m²
              │
              ▼
   [Tier 3: Solar Radiation Engine]
   • EU PVGIS 5.3 Non-Interactive API (/PVcalc)
   • Inputs: Latitude, Longitude, Peak Power (kWp)
   • Optimal tilt angle calculation
   • Outputs: Monthly & Annual Energy Yield (kWh)
              │
              ▼
   [Tier 4: Financial Math Engine]
   • Installation Cost: $1,000 / kWp
   • Annual Savings = Yield (kWh) × Electricity Tariff ($/kWh)
   • Payback Period (years) & 25-year Net Profit
              │
              ▼
   [FastAPI REST API -> React Frontend]
```

---

## 3. Core Architectural Decisions

1. **Dropping 2D Obstacle Segmentation**: Research shows extracting tiny obstacles (chimneys, HVAC units, vents) from single-angle RGB satellite images without LiDAR/DSM leads to severe false positives. Solar Seeker segments the Gross Roof Footprint and applies an empirical **$65\%$ Utilization Factor** ($k = 0.65$).
2. **Ignoring Transient Shadows**: Satellite imagery represents a single instant in time (e.g. morning). Shadow subtraction would permanently delete rooftop area that receives full sunlight midday and afternoon. Shadow losses are modeled inside the PVGIS system loss parameter ($14\%$).
3. **512x512 Standardized Dimensioning**: U-Net encoders require image dimensions divisible by 32 ($2^5$). Training and inference standardize on 512x512, with outputs resized back to original resolution.

---

## 4. Codebase Inventory

| File | Role & Contents |
| :--- | :--- |
| `unet_training.py` | PyTorch training pipeline: auto-extracts `solar-seeker-anno.zip`, CVAT dataset loader, Albumentations, U-Net (ResNet-34), Combined BCE + Dice loss, IoU/Dice tracking, and checkpoint saving. |
| `solar_engine.py` | Physics & Math module: queries EU PVGIS API (`get_pvgis_yield`) and calculates 25-year financial metrics (`calculate_roi`). |
| `main.py` | FastAPI application: exposes `POST /analyze_roof` orchestrating image inference, polygon simplification, PVGIS query, and financial reporting. |
| `test_model.py` | Standalone end-to-end verification script: loads `unet_roof_obstacle.pth`, runs inference on sample satellite images, calls PVGIS, and generates `test_result.png`. |
| `requirements.txt` | Python dependency specifications for local and Colab environments. |
| `solar-seeker-anno.zip` | Annotated Pascal VOC dataset (10 image-mask pairs at 1498x763 resolution). |

---

## 5. How to Test the Model

### Option A: Standalone Test Script (CLI)
```bash
python test_model.py --image "cropped_images/WhatsApp Image 2026-10-05 at 15.46.41.jpeg"
```
Produces `test_result.png` showing:
- Original satellite image
- U-Net predicted rooftop mask
- Regularized polygons overlaid with detected kWp and kWh/year estimates

### Option B: FastAPI Interactive Swagger UI
```bash
uvicorn main:app --reload
```
Open [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) in your browser and upload any satellite image to `POST /analyze_roof`.
