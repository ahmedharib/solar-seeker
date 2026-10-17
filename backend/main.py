import os
import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
import torch
import albumentations as A
from albumentations.pytorch import ToTensorV2
import segmentation_models_pytorch as smp

# Import the solar physics, financial, and geometry engines
from solar_engine import (
    get_pvgis_yield,
    get_solar_yield,
    calculate_roi,
    calculate_system_size,
    calculate_environmental_impact,
    format_monthly_chart,
    PACKING_FACTOR,
    PANEL_DENSITY_KWP_PER_M2,
    SYSTEM_LOSS_PERCENT,
)
from geometry import post_process_and_calculate_area, extract_polygon_list

app = FastAPI(title="Solar Seeker API", version="1.0.0")

# Allow React frontend to access the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, replace with the React app URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# 1. Model Initialization (U-Net only)
# ==========================================
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = None
weights_loaded = False

MODEL_INPUT_SIZE = 512                  # U-Net trained at 512x512 (divisible by 32)
MAX_UPLOAD_BYTES = 15 * 1024 * 1024     # 15 MB screenshot limit
DEFAULT_GSD = 0.15                      # m/px — Google Maps satellite ~zoom 19-20

def get_weights_path():
    candidates = [
        os.path.join(os.path.dirname(__file__), "../models/unet-latest/unet_roof_obstacle.pth"),
        os.path.join(os.path.dirname(__file__), "../models/unet/unet_roof_obstacle.pth"),
        os.path.join(os.path.dirname(__file__), "unet_roof_obstacle.pth"),
        "models/unet-latest/unet_roof_obstacle.pth",
        "models/unet/unet_roof_obstacle.pth",
        "unet_roof_obstacle.pth",
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None

def load_model():
    global model, weights_loaded
    if model is None:
        try:
            print("Loading U-Net model...")
            model = smp.Unet(
                encoder_name="resnet34", 
                encoder_weights=None, 
                in_channels=3, 
                classes=1
            ).to(device)
            
            weights_path = get_weights_path()
            if weights_path:
                print(f"Loading weights from: {weights_path}")
                model.load_state_dict(torch.load(weights_path, map_location=device))
                weights_loaded = True
            else:
                print("WARNING: Model weights not found. Predictions will be uncalibrated.")
            model.eval()
        except Exception as e:
            print(f"Error loading model: {e}")
            model = None

load_model()

# Image augmentation for inference
transform = A.Compose([
    A.Normalize(mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225)),
    ToTensorV2(),
])


# ==========================================
# 2. Shared Helpers
# ==========================================
async def read_uploaded_image(file: UploadFile):
    """
    Reads and decodes an uploaded screenshot.
    Returns (image_rgb, error_response). Exactly one of them is None.
    """
    if file.content_type and not file.content_type.startswith("image/"):
        return None, JSONResponse(
            {"success": False, "error": f"Unsupported file type '{file.content_type}'. Please upload a PNG or JPEG screenshot."},
            status_code=400,
        )

    contents = await file.read()
    if not contents:
        return None, JSONResponse({"success": False, "error": "Uploaded file is empty."}, status_code=400)
    if len(contents) > MAX_UPLOAD_BYTES:
        return None, JSONResponse(
            {"success": False, "error": f"File too large. Maximum size is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB."},
            status_code=413,
        )

    nparr = np.frombuffer(contents, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None:
        return None, JSONResponse({"success": False, "error": "Could not decode image. Please upload a valid PNG or JPEG."}, status_code=400)

    return cv2.cvtColor(image, cv2.COLOR_BGR2RGB), None


def run_unet_inference(image_rgb, threshold=0.5):
    """
    Runs U-Net on an RGB image of any size and returns a binary float32 mask
    at the original resolution (H, W).
    """
    h, w = image_rgb.shape[:2]
    if model is None:
        return np.zeros((h, w), dtype=np.float32)

    img_resized = cv2.resize(image_rgb, (MODEL_INPUT_SIZE, MODEL_INPUT_SIZE), interpolation=cv2.INTER_LINEAR)
    augmented = transform(image=img_resized)
    input_tensor = augmented['image'].unsqueeze(0).to(device)

    with torch.no_grad():
        output = model(input_tensor)
        preds = torch.sigmoid(output).squeeze(0).squeeze(0).cpu().numpy()

    roof_mask_512 = (preds > threshold).astype(np.uint8)
    return cv2.resize(roof_mask_512, (w, h), interpolation=cv2.INTER_NEAREST).astype(np.float32)


# ==========================================
# 3. Pydantic Request Models
# ==========================================
class SolarCalculationRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90, description="Latitude of the building")
    lon: float = Field(..., ge=-180, le=180, description="Longitude of the building")
    selected_area_m2: float = Field(..., gt=0, description="Sum of gross areas of the user-selected roof polygons")
    electricity_rate: Optional[float] = Field(3.50, gt=0, description="Electricity tariff per kWh in TL (EPDK benchmark)")
    install_cost_per_kwp: Optional[float] = Field(40000.0, gt=0, description="Turnkey installation cost per kWp in TL ($800 * 50 TL/$)")
    monthly_bill: Optional[float] = Field(1500.0, ge=0, description="Average monthly electricity bill in TL")


# ==========================================
# 4. API Endpoints
# ==========================================
@app.get("/")
@app.get("/api")
@app.get("/api/")
@app.get("/api/health")
def read_root():
    return {
        "status": "online",
        "service": "Solar Seeker API",
        "model_loaded": model is not None,
        "weights_loaded": weights_loaded,
        "device": str(device)
    }


@app.post("/api/detect_roofs")
async def detect_roofs(
    file: UploadFile = File(...),
    gsd: float = Form(DEFAULT_GSD)
):
    """
    Tier 1 Vision Engine (v1: screenshot upload only):
    Accepts a user-uploaded satellite screenshot, predicts the rooftop mask with U-Net,
    and returns regularized polygons for the interactive frontend selector.

    Polygon coordinates are given in image pixels and normalized [0, 1] so the frontend
    can overlay them directly on the uploaded screenshot.
    """
    try:
        if not (0.01 <= gsd <= 5.0):
            return JSONResponse({"success": False, "error": "gsd must be between 0.01 and 5.0 m/px."}, status_code=400)

        image_rgb, error = await read_uploaded_image(file)
        if error:
            return error
        h, w = image_rgb.shape[:2]

        roof_mask_pred = run_unet_inference(image_rgb)

        clean_roof_mask, _, _ = post_process_and_calculate_area(roof_mask_pred, gsd=gsd)
        polygons = extract_polygon_list(
            clean_roof_mask,
            gsd=gsd,
            packing_factor=PACKING_FACTOR,
            panel_density_kwp_per_m2=PANEL_DENSITY_KWP_PER_M2,
        )

        # Sum of polygon areas so "select all" in the UI matches this total exactly
        total_area_m2 = sum(p["gross_area_m2"] for p in polygons)

        return {
            "success": True,
            "image_width": w,
            "image_height": h,
            "gsd": gsd,
            "total_detected_area_m2": round(total_area_m2, 2),
            "roof_count": len(polygons),
            "polygons": polygons,
            "assumptions": {
                "packing_factor": PACKING_FACTOR,
                "panel_density_kwp_per_m2": PANEL_DENSITY_KWP_PER_M2,
            },
            "message": None if polygons else "No rooftops detected. Try a closer zoom level or a clearer screenshot.",
        }

    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)


@app.post("/api/calculate_solar")
async def calculate_solar(req: SolarCalculationRequest):
    """
    Tiers 2, 3 & 4 Physics, Financial and Environmental Engine:
    Accepts the user-confirmed rooftop area, sizes the PV system (65% packing factor,
    0.20 kWp/m²), queries EU PVGIS (with latitude-based fallback), and generates
    financial ROI, bill offset, 25-year cashflow schedule, and environmental impact.
    """
    try:
        system = calculate_system_size(req.selected_area_m2)
        peakpower_kwp = system["peakpower_kwp"]

        if peakpower_kwp <= 0:
            return JSONResponse({"success": False, "error": "Selected rooftop area is too small for a PV system."}, status_code=400)

        # PVGIS first, physics-based fallback if unreachable / out of coverage
        yield_result = get_solar_yield(req.lat, req.lon, peakpower_kwp)
        annual_yield_kwh = float(yield_result["annual_yield_kwh"])

        financials = calculate_roi(
            annual_yield_kwh=annual_yield_kwh,
            peakpower_kwp=peakpower_kwp,
            electricity_rate=req.electricity_rate,
            install_cost_per_kwp=req.install_cost_per_kwp,
            monthly_bill=req.monthly_bill,
        )

        environmental = calculate_environmental_impact(annual_yield_kwh)

        return {
            "success": True,
            "location": {"lat": req.lat, "lon": req.lon},
            "system": system,
            "gross_area_m2": system["gross_area_m2"],
            "net_usable_area_m2": system["net_usable_area_m2"],
            "peakpower_kwp": peakpower_kwp,
            "annual_yield_kwh": round(annual_yield_kwh, 1),
            "specific_yield_kwh_per_kwp": round(annual_yield_kwh / peakpower_kwp, 1),
            "yield_source": yield_result["source"],
            "optimal_tilt_deg": yield_result.get("optimal_tilt_deg"),
            "monthly_chart": format_monthly_chart(yield_result.get("monthly_data")),
            "yield_data": yield_result,
            "financials": financials,
            "environmental": environmental,
            "assumptions": {
                "packing_factor": system["packing_factor"],
                "panel_density_kwp_per_m2": system["panel_density_kwp_per_m2"],
                "system_loss_percent": SYSTEM_LOSS_PERCENT,
                "electricity_rate": req.electricity_rate,
                "install_cost_per_kwp": req.install_cost_per_kwp,
                "degradation_rate_percent": financials.get("financial_model", {}).get("degradation_rate_percent", 0.5),
                "tariff_escalation_rate_percent": financials.get("financial_model", {}).get("tariff_escalation_rate_percent", 4.0),
                "inverter_replacement_year": financials.get("financial_model", {}).get("inverter_replacement_year", 11),
            },
        }

    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)


@app.post("/analyze_roof")
async def analyze_roof(
    lat: float = Form(...),
    lon: float = Form(...),
    electricity_rate: float = Form(0.12),
    file: UploadFile = File(...)
):
    """
    Legacy End-to-End Endpoint:
    Kept for backward-compatibility with existing tests and scripts.
    """
    try:
        image_rgb, error = await read_uploaded_image(file)
        if error:
            return error
        h, w = image_rgb.shape[:2]

        roof_mask_pred = run_unet_inference(image_rgb)
        obstacle_mask_pred = np.zeros((h, w), dtype=np.float32)

        clean_roof_mask, usable_area_mask, usable_area_m2 = post_process_and_calculate_area(
            roof_mask_pred, obstacle_mask_pred, gsd=DEFAULT_GSD
        )

        net_usable_area_m2 = usable_area_m2 * PACKING_FACTOR
        peakpower_kwp = net_usable_area_m2 * PANEL_DENSITY_KWP_PER_M2
        
        if peakpower_kwp <= 0:
            return JSONResponse({"success": False, "message": "No usable roof area detected."})

        pvgis_result = get_pvgis_yield(lat, lon, peakpower_kwp)
        if not pvgis_result["success"]:
            return JSONResponse({
                "success": False,
                "message": "Failed to fetch solar yield from PVGIS.",
                "error": pvgis_result.get("error")
            })

        annual_yield_kwh = pvgis_result["annual_yield_kwh"]
        financials = calculate_roi(annual_yield_kwh, peakpower_kwp, electricity_rate=electricity_rate)

        return {
            "success": True,
            "usable_area_m2": round(usable_area_m2, 2),
            "peakpower_kwp": round(peakpower_kwp, 2),
            "yield_data": pvgis_result,
            "financials": financials,
            "message": "Successfully analyzed roof and calculated solar potential."
        }
        
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)


# ==========================================
# 5. Phoebe HEMS API Endpoints (Isolated)
# ==========================================
from phoebe_engine import (
    PRESET_WINDOWS,
    DEFAULT_BATTERY_CAPACITY_KWH,
    DEFAULT_INITIAL_SOC_PERCENT,
    DEFAULT_MAX_OUTPUT_KW,
    load_series_from_test_csv,
    load_series_from_uploaded_bytes,
    run_phoebe_simulation,
)


@app.get("/api/phoebe/presets")
def get_phoebe_presets():
    return {
        "success": True,
        "presets": [
            {"id": k, "label": v["label"], "description": v["description"]}
            for k, v in PRESET_WINDOWS.items()
        ],
    }


@app.post("/api/phoebe/simulate")
async def simulate_phoebe(
    use_sample: bool = Form(False),
    preset_key: str = Form("evening_peak"),
    battery_capacity_kwh: float = Form(DEFAULT_BATTERY_CAPACITY_KWH),
    initial_soc_percent: float = Form(DEFAULT_INITIAL_SOC_PERCENT),
    max_output_kw: float = Form(DEFAULT_MAX_OUTPUT_KW),
    csv_file: Optional[UploadFile] = File(None),
):
    """
    Phoebe HEMS 120-Minute Rolling Horizon Forecast & MPC Battery Dispatch Simulation.
    Supports either the built-in data/phoebe-test-data.csv or a custom uploaded CSV file.
    """
    try:
        if csv_file is not None and not use_sample:
            raw_bytes = await csv_file.read()
            past_180_kw, source_label = load_series_from_uploaded_bytes(
                raw_bytes, filename=csv_file.filename or "uploaded.csv"
            )
        else:
            past_180_kw, source_label = load_series_from_test_csv(preset_key=preset_key)

        result = run_phoebe_simulation(
            past_180_kw=past_180_kw,
            source_label=source_label,
            battery_capacity_kwh=battery_capacity_kwh,
            initial_soc_percent=initial_soc_percent,
            max_output_kw=max_output_kw,
        )
        return result

    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=400)


# ==========================================
# 6. Free Geocoding & Satellite Tile Capture
# ==========================================
import math
import requests as http_requests
from concurrent.futures import ThreadPoolExecutor
from fastapi.responses import Response

TILE_SIZE = 256
ANALYSIS_ZOOM_DEFAULT = 19
CAPTURE_SIZE_DEFAULT = 512

TILE_URLS = {
    "google": "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    "esri": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
}


def latlon_to_global_pixels(lat: float, lon: float, zoom: int):
    lat_rad = math.radians(max(-85.0511, min(85.0511, lat)))
    n = 2.0 ** zoom
    x = (lon + 180.0) / 360.0 * n * TILE_SIZE
    y = (
        (1.0 - math.log(math.tan(lat_rad) + (1.0 / math.cos(lat_rad))) / math.pi)
        / 2.0
        * n
        * TILE_SIZE
    )
    return x, y


def fetch_single_tile(provider: str, z: int, x: int, y: int):
    max_idx = (2 ** z) - 1
    x_wrapped = x % (2 ** z)
    y_clamped = max(0, min(max_idx, y))

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SolarSeeker/1.0"
    }

    primary_tpl = TILE_URLS.get(provider, TILE_URLS["google"])
    fallback_tpl = TILE_URLS["esri"] if provider == "google" else TILE_URLS["google"]

    for tpl in (primary_tpl, fallback_tpl):
        url = tpl.format(x=x_wrapped, y=y_clamped, z=z)
        try:
            resp = http_requests.get(url, headers=headers, timeout=5)
            if resp.status_code == 200 and len(resp.content) > 400:
                arr = np.frombuffer(resp.content, np.uint8)
                img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                if img is not None:
                    return img
        except Exception:
            continue

    return np.zeros((TILE_SIZE, TILE_SIZE, 3), dtype=np.uint8)


@app.get("/api/geocode")
def geocode_address(q: str):
    """
    Free address geocoding using OpenStreetMap Nominatim.
    """
    query = (q or "").strip()
    if not query:
        return JSONResponse({"success": False, "error": "Empty search query."}, status_code=400)

    try:
        resp = http_requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": query, "format": "json", "limit": 5, "addressdetails": 1},
            headers={"User-Agent": "SolarSeeker-RooftopAI/1.0 (https://github.com/solar-seeker)"},
            timeout=6,
        )
        results = resp.json() if resp.status_code == 200 else []
        formatted = [
            {
                "display_name": item.get("display_name"),
                "lat": float(item["lat"]),
                "lon": float(item["lon"]),
            }
            for item in results
            if "lat" in item and "lon" in item
        ]
        return {"success": True, "results": formatted}
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)


@app.get("/api/capture_satellite")
def capture_satellite_tile(
    lat: float,
    lon: float,
    zoom: int = ANALYSIS_ZOOM_DEFAULT,
    size: int = CAPTURE_SIZE_DEFAULT,
    provider: str = "google",
):
    """
    Stitches a high-resolution 512x512 satellite image centered at (lat, lon)
    at the penultimate zoom level (Zoom 19) for U-Net rooftop segmentation.
    """
    try:
        clamped_zoom = max(15, min(20, int(zoom)))
        crop_size = max(256, min(1024, int(size)))
        center_px, center_py = latlon_to_global_pixels(lat, lon, clamped_zoom)

        half = crop_size // 2
        min_px = int(math.floor(center_px - half))
        min_py = int(math.floor(center_py - half))
        max_px = min_px + crop_size
        max_py = min_py + crop_size

        min_tx = min_px // TILE_SIZE
        max_tx = (max_px - 1) // TILE_SIZE
        min_ty = min_py // TILE_SIZE
        max_ty = (max_py - 1) // TILE_SIZE

        grid_w = (max_tx - min_tx + 1) * TILE_SIZE
        grid_h = (max_ty - min_ty + 1) * TILE_SIZE
        canvas = np.zeros((grid_h, grid_w, 3), dtype=np.uint8)

        coords = [
            (tx, ty)
            for ty in range(min_ty, max_ty + 1)
            for tx in range(min_tx, max_tx + 1)
        ]

        with ThreadPoolExecutor(max_workers=min(9, len(coords))) as pool:
            tiles = list(
                pool.map(lambda c: fetch_single_tile(provider, clamped_zoom, c[0], c[1]), coords)
            )

        for (tx, ty), tile_img in zip(coords, tiles):
            ox = (tx - min_tx) * TILE_SIZE
            oy = (ty - min_ty) * TILE_SIZE
            if tile_img.shape[:2] != (TILE_SIZE, TILE_SIZE):
                tile_img = cv2.resize(tile_img, (TILE_SIZE, TILE_SIZE))
            canvas[oy : oy + TILE_SIZE, ox : ox + TILE_SIZE] = tile_img

        start_x = min_px - (min_tx * TILE_SIZE)
        start_y = min_py - (min_ty * TILE_SIZE)
        cropped = canvas[start_y : start_y + crop_size, start_x : start_x + crop_size]

        ok, buf = cv2.imencode(".png", cropped)
        if not ok:
            raise RuntimeError("Failed to encode stitched satellite image.")

        return Response(content=buf.tobytes(), media_type="image/png")
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)

