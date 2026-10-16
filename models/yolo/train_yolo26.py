"""
Solar Seeker — YOLO26 Rooftop Segmentation Pipeline
===================================================
Optimized for Google Colab and Local Workstations.

Quickstart on Google Colab:
---------------------------
1. Enable GPU:
   Runtime -> Change runtime type -> Hardware accelerator -> T4 GPU

2. Install dependencies:
   !pip install -q --upgrade ultralytics opencv-python-headless matplotlib pyyaml pillow

3. Upload 'solar_seeker_yolo_dataset.zip' (or 'solar-seeker-anno-yolo.zip' + 'cropped_images')

4. Run training:
   !python train_yolo26.py --data solar_seeker_yolo_dataset.zip --epochs 60 --batch 4 --imgsz 640

This script will:
- Auto-extract and match aerial satellite images with YOLO polygon segmentation labels.
- Automatically construct standard train/val splits and configure data.yaml.
- Initialize and fine-tune YOLO26 Instance/Semantic Segmentation (yolo26n-seg.pt).
- Compute Mask mAP50, Mask mAP50-95, Box mAP, and generate training curves.
- Run visual inference on test images and extract usable rooftop area (m²), kWp capacity, and annual solar yield.
- Export trained weights to PyTorch (best.pt) and ONNX, bundled into a downloadable zip file.
"""

import os
import sys
import glob
import shutil
import zipfile
import argparse
from pathlib import Path
import yaml
import cv2
import numpy as np

# Ensure UTF-8 output on Windows / multi-platform environments
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass


def find_or_extract_dataset(data_path=None, extract_dir="dataset_yolo"):
    """
    Locates or extracts the dataset.
    Supports:
      - .zip archive containing standard YOLO structure or labels + images
      - Existing directory containing 'images' and 'labels'
      - Automatic matching of images in 'cropped_images' with labels in zip
    """
    extract_path = Path(extract_dir)

    # 1. Locate zip or directory if not explicitly provided
    if data_path is None or not os.path.exists(data_path):
        candidates = [
            os.path.join(os.path.dirname(__file__), "../../data/datasets/solar_seeker_yolo_dataset.zip"),
            os.path.join(os.path.dirname(__file__), "../../data/datasets/solar-seeker-anno-yolo.zip"),
            "data/datasets/solar_seeker_yolo_dataset.zip",
            "data/datasets/solar-seeker-anno-yolo.zip",
            "solar_seeker_yolo_dataset.zip",
            "solar-seeker-anno-yolo.zip",
            "solar-seeker-anno.zip",
            "dataset.zip",
            extract_dir,
            "dataset",
        ]
        for c in candidates:
            if os.path.exists(c):
                data_path = c
                break

    if data_path is None or not os.path.exists(data_path):
        raise FileNotFoundError(
            f"Dataset not found at '{data_path}'. Please specify --data <path_to_zip_or_folder>."
        )

    # 2. Extract if zip
    if str(data_path).lower().endswith(".zip") and os.path.isfile(data_path):
        print(f"📦 Extracting '{data_path}' to '{extract_path}'...")
        if extract_path.exists():
            shutil.rmtree(extract_path)
        extract_path.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(data_path, "r") as z:
            z.extractall(extract_path)
        search_root = extract_path
    else:
        search_root = Path(data_path)

    # 3. Check for standard structure (images/train, labels/train)
    train_img_dir = search_root / "images" / "train"
    train_lbl_dir = search_root / "labels" / "train"
    val_img_dir = search_root / "images" / "val"
    val_lbl_dir = search_root / "labels" / "val"

    valid_exts = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"}

    # If images are missing inside the extracted zip, check cropped_images/
    existing_imgs = list(search_root.rglob("*.*"))
    existing_imgs = [p for p in existing_imgs if p.suffix.lower() in valid_exts]

    if len(existing_imgs) == 0:
        print("⚠️ No images found inside dataset zip. Checking local image directories ('cropped_images')...")
        for local_cand in [
            os.path.join(os.path.dirname(__file__), "../../data/images/cropped_images"),
            "data/images/cropped_images",
            "cropped_images",
            "uncropped_images",
            "JPEGImages",
        ]:
            if os.path.isdir(local_cand):
                cand_imgs = [Path(local_cand) / f for f in os.listdir(local_cand) if Path(f).suffix.lower() in valid_exts]
                if cand_imgs:
                    print(f" Found {len(cand_imgs)} images in '{local_cand}/'. Copying into dataset...")
                    img_dest = search_root / "images" / "train"
                    img_dest.mkdir(parents=True, exist_ok=True)
                    for ci in cand_imgs:
                        shutil.copy2(ci, img_dest / ci.name)
                    break

    # Re-scan after potential copy
    all_imgs = [p for p in search_root.rglob("*.*") if p.suffix.lower() in valid_exts]
    all_txts = [p for p in search_root.rglob("*.txt") if p.name not in ("train.txt", "val.txt", "classes.txt")]

    if not train_img_dir.exists() or len(list(train_img_dir.glob("*.*"))) == 0:
        print("🔍 Structuring image and label directories into standard YOLO format...")
        train_img_dir.mkdir(parents=True, exist_ok=True)
        train_lbl_dir.mkdir(parents=True, exist_ok=True)
        val_img_dir.mkdir(parents=True, exist_ok=True)
        val_lbl_dir.mkdir(parents=True, exist_ok=True)

        matched_pairs = []
        for img in all_imgs:
            matching_lbl = next((l for l in all_txts if l.stem == img.stem), None)
            if matching_lbl:
                matched_pairs.append((img, matching_lbl))

        if not matched_pairs:
            raise RuntimeError(
                f"No matching image-label pairs found in '{search_root}'. Please ensure image stems match label stems."
            )

        print(f" Matched {len(matched_pairs)} image-label pairs.")
        # 80% train, 20% validation (8 train, 2 val)
        val_count = max(1, int(len(matched_pairs) * 0.2)) if len(matched_pairs) > 3 else 1
        train_pairs = matched_pairs[:-val_count]
        val_pairs = matched_pairs[-val_count:]

        for img, lbl in train_pairs:
            shutil.copy2(img, train_img_dir / img.name)
            shutil.copy2(lbl, train_lbl_dir / lbl.name)

        for img, lbl in val_pairs:
            shutil.copy2(img, val_img_dir / img.name)
            shutil.copy2(lbl, val_lbl_dir / lbl.name)

    # Ensure validation set has at least 1 image
    train_images = list(train_img_dir.glob("*.*"))
    val_images = list(val_img_dir.glob("*.*")) if val_img_dir.exists() else []

    if train_images and not val_images:
        val_img_dir.mkdir(parents=True, exist_ok=True)
        val_lbl_dir.mkdir(parents=True, exist_ok=True)
        for img in train_images[-2:]:
            shutil.copy2(img, val_img_dir / img.name)
            lbl = train_lbl_dir / f"{img.stem}.txt"
            if lbl.exists():
                shutil.copy2(lbl, val_lbl_dir / lbl.name)
        val_images = list(val_img_dir.glob("*.*"))

    # Write / update data.yaml
    data_yaml_path = search_root / "data.yaml"
    data_config = {
        "path": str(search_root.resolve()),
        "train": "images/train",
        "val": "images/val",
        "names": {0: "roof"},
    }
    with open(data_yaml_path, "w", encoding="utf-8") as f:
        yaml.dump(data_config, f, sort_keys=False)

    print(f"✅ data.yaml configured at: {data_yaml_path}")
    print(f"📊 Dataset ready: {len(train_images)} train images, {len(val_images)} val images.")
    return data_yaml_path, search_root


def train_yolo(args, data_yaml_path):
    """
    Initializes and trains the YOLO26 segmentation model via Ultralytics.
    """
    from ultralytics import YOLO

    model_weights = args.model
    print(f"\n{'='*60}")
    print(f"🚀 Initializing model: {model_weights}")
    print(f"{'='*60}")

    try:
        model = YOLO(model_weights)
    except Exception as e:
        print(f"⚠️ Model load exception with '{model_weights}': {e}")
        fallback = "yolo11n-seg.pt" if "26" in model_weights else "yolov8n-seg.pt"
        print(f"Falling back to '{fallback}'...")
        model = YOLO(fallback)

    # Determine hardware acceleration
    device = args.device
    if device is None:
        import torch
        device = 0 if torch.cuda.is_available() else "cpu"

    print(f"Target device: {device}")
    print(f"Hyperparameters: epochs={args.epochs}, imgsz={args.imgsz}, batch={args.batch}")

    train_results = model.train(
        data=str(data_yaml_path),
        task="segment",
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=device,
        workers=args.workers,
        patience=args.patience,
        optimizer="AdamW",
        lr0=0.001,
        augment=True,
        degrees=15.0,
        flipud=0.5,
        fliplr=0.5,
        mosaic=1.0,
        save=True,
        plots=True,
        name=args.name,
    )

    print("\n🎉 Training run completed!")
    return model, train_results


def evaluate_and_test_solar(model, data_yaml_path, search_root, run_name):
    """
    Runs model validation, computes Solar Seeker solar area & kWp estimations,
    and produces visual prediction comparisons.
    """
    from ultralytics import YOLO
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    print(f"\n{'='*60}")
    print("📊 Evaluating Validation Metrics...")
    print(f"{'='*60}")

    # Find the best weights
    weights_candidates = glob.glob(f"runs/segment/{run_name}*/weights/best.pt")
    if weights_candidates:
        best_pt = weights_candidates[-1]
        print(f"Loading best weights: {best_pt}")
        eval_model = YOLO(best_pt)
    else:
        eval_model = model
        best_pt = None

    metrics = eval_model.val()

    print("\n" + "=" * 50)
    print("🏆 FINAL VALIDATION METRICS:")
    print("=" * 50)
    print(f"  • Mask mAP@50:      {metrics.seg.map50:.4f}")
    print(f"  • Mask mAP@50-95:   {metrics.seg.map:.4f}")
    print(f"  • Box mAP@50:       {metrics.box.map50:.4f}")
    print(f"  • Box mAP@50-95:    {metrics.box.map:.4f}")
    print("=" * 50)

    # Run inference on validation images
    val_dir = search_root / "images" / "val"
    val_imgs = list(val_dir.glob("*.*"))[:4] if val_dir.exists() else []

    if not val_imgs:
        val_imgs = list((search_root / "images" / "train").glob("*.*"))[:4]

    if val_imgs:
        print(f"\n🛰️ Running inference on {len(val_imgs)} test images...")
        predictions = eval_model.predict(
            source=[str(p) for p in val_imgs],
            conf=0.25,
            iou=0.5,
            save=False,
        )

        # Solar Seeker Physics Calculations
        GSD = 0.15                     # Ground Sample Distance: meters per pixel
        UTILIZATION_FACTOR = 0.65      # 65% usable solar area
        PANEL_DENSITY_KWP = 0.20       # 0.20 kWp per m2
        ANNUAL_YIELD_KWH_PER_KWP = 1350.0 # kWh/year per kWp

        print(f"\n☀️ Solar Seeker Physics Assessment:")
        print(f"{'Image / Roof #':<25} | {'Gross Area (m²)':<16} | {'Net Usable (m²)':<16} | {'Capacity (kWp)':<16} | {'Est. Yield (kWh/y)':<18}")
        print("-" * 100)

        for img_idx, (pred, img_p) in enumerate(zip(predictions, val_imgs), 1):
            if pred.masks is not None:
                polys = pred.masks.xy
                img_gross, img_net, img_kwp = 0.0, 0.0, 0.0
                for r_idx, poly in enumerate(polys, 1):
                    if len(poly) < 3:
                        continue
                    px_area = cv2.contourArea(poly.astype(np.float32))
                    gross_m2 = px_area * (GSD ** 2)
                    net_m2 = gross_m2 * UTILIZATION_FACTOR
                    kwp = net_m2 * PANEL_DENSITY_KWP
                    kwh = kwp * ANNUAL_YIELD_KWH_PER_KWP

                    img_gross += gross_m2
                    img_net += net_m2
                    img_kwp += kwp

                    print(f"{f'{img_p.name[:16]} [R{r_idx}]':<25} | {gross_m2:<16.2f} | {net_m2:<16.2f} | {kwp:<16.2f} | {kwh:<18.1f}")
                print(f"  -> Total for {img_p.name[:20]}: {img_gross:.1f} m² gross | {img_kwp:.1f} kWp capacity")
                print("-" * 100)

        # Save Visual Inference Comparison Plot
        fig, axes = plt.subplots(len(predictions), 2, figsize=(14, 5 * len(predictions)))
        if len(predictions) == 1:
            axes = np.expand_dims(axes, 0)

        for i, (pred, img_p) in enumerate(zip(predictions, val_imgs)):
            orig_bgr = cv2.imread(str(img_p))
            orig_rgb = cv2.cvtColor(orig_bgr, cv2.COLOR_BGR2RGB)

            axes[i, 0].imshow(orig_rgb)
            axes[i, 0].set_title(f"Original: {img_p.name}", fontsize=11)
            axes[i, 0].axis("off")

            pred_plot = pred.plot(boxes=True, masks=True)
            pred_plot_rgb = cv2.cvtColor(pred_plot, cv2.COLOR_BGR2RGB)
            count = len(pred.masks) if pred.masks is not None else 0

            axes[i, 1].imshow(pred_plot_rgb)
            axes[i, 1].set_title(f"YOLO26 Segmentation ({count} roofs detected)", fontsize=11)
            axes[i, 1].axis("off")

        plt.tight_layout()
        test_result_plot = "yolo26_test_predictions.png"
        plt.savefig(test_result_plot, dpi=150, bbox_inches="tight")
        plt.close()
        print(f"📸 Inference visualization saved to '{test_result_plot}'.")

    return best_pt


def package_and_export(best_pt, run_name, search_root):
    """
    Exports best weights to ONNX format and bundles artifacts into a zip file.
    """
    from ultralytics import YOLO

    if not best_pt or not os.path.exists(best_pt):
        print("No best.pt checkpoint found to package.")
        return

    print(f"\n{'='*60}")
    print("📦 Exporting Weights & Packaging Archive...")
    print(f"{'='*60}")

    onnx_path = None
    try:
        exp_model = YOLO(best_pt)
        print("⚡ Exporting to ONNX format...")
        onnx_file = exp_model.export(format="onnx", imgsz=640)
        if os.path.exists(str(onnx_file)):
            onnx_path = str(onnx_file)
            print(f" ONNX export saved to: {onnx_path}")
    except Exception as e:
        print(f"Notice: ONNX export skipped ({e}).")

    archive_name = "solar_seeker_yolo26_results.zip"
    with zipfile.ZipFile(archive_name, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(best_pt, arcname="best.pt")
        if onnx_path and os.path.exists(onnx_path):
            z.write(onnx_path, arcname="best.onnx")
        yaml_p = search_root / "data.yaml"
        if yaml_p.exists():
            z.write(str(yaml_p), arcname="data.yaml")
        if os.path.exists("yolo26_test_predictions.png"):
            z.write("yolo26_test_predictions.png", arcname="yolo26_test_predictions.png")
        for plot_img in glob.glob(f"runs/segment/{run_name}*/*.png"):
            z.write(plot_img, arcname=f"plots/{os.path.basename(plot_img)}")

    size_mb = os.path.getsize(archive_name) / 1024 / 1024
    print(f"✅ Packaged all training artifacts into: '{archive_name}' ({size_mb:.2f} MB)")
    print("You can download this archive to integrate 'best.pt' directly into Solar Seeker!")


def main():
    parser = argparse.ArgumentParser(description="Solar Seeker — YOLO26 Rooftop Segmentation Pipeline")
    parser.add_argument("--data", type=str, default=None, help="Path to dataset zip file or directory")
    parser.add_argument("--model", type=str, default="yolo26n-seg.pt", help="Pre-trained YOLO weights (e.g. yolo26n-seg.pt, yolo26s-seg.pt)")
    parser.add_argument("--epochs", type=int, default=60, help="Number of training epochs")
    parser.add_argument("--imgsz", type=int, default=640, help="Training image resolution")
    parser.add_argument("--batch", type=int, default=4, help="Batch size")
    parser.add_argument("--device", type=str, default=None, help="Device (0 for GPU, cpu for CPU)")
    parser.add_argument("--workers", type=int, default=2, help="DataLoader worker processes")
    parser.add_argument("--patience", type=int, default=25, help="Early stopping patience")
    parser.add_argument("--name", type=str, default="solar_seeker_yolo26_run", help="Run directory name")
    args = parser.parse_args()

    # 1. Unpack & Validate Dataset
    data_yaml_path, search_root = find_or_extract_dataset(args.data)

    # 2. Train Model
    model, train_results = train_yolo(args, data_yaml_path)

    # 3. Evaluate & Solar Calculations
    best_pt = evaluate_and_test_solar(model, data_yaml_path, search_root, args.name)

    # 4. Package Artifacts
    if best_pt:
        package_and_export(best_pt, args.name, search_root)


if __name__ == "__main__":
    main()
