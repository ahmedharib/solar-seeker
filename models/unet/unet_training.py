"""
Solar Seeker — U-Net Segmentation Training Pipeline
=====================================================
Optimized for Google Colab and Local Execution.

Colab Quickstart Instructions:
-----------------------------
1. Enable GPU in Colab:
   Runtime -> Change runtime type -> Hardware accelerator -> T4 GPU.

2. Install dependencies:
   !pip install -q segmentation-models-pytorch albumentations opencv-python-headless matplotlib

3. Upload 'solar-seeker-anno.zip' to the Colab files pane (or Google Drive).

4. Run training:
   !python unet_training.py --data solar-seeker-anno.zip --epochs 35 --batch_size 4

This will:
- Auto-extract and match images with CVAT Pascal VOC segmentation masks.
- Train U-Net (ResNet34 backbone, pre-trained on ImageNet) using combined BCE + Dice Loss.
- Track IoU (Jaccard) and Dice score on both train and validation sets.
- Save best model weights as 'unet_roof_obstacle.pth'.
- Generate 'training_history.png' (loss/IoU curves) and 'sample_predictions.png' (visual inspection).
"""

import os
import sys
import zipfile
import argparse
import cv2
import torch
import torch.nn as nn
import numpy as np
import matplotlib.pyplot as plt
from torch.utils.data import Dataset, DataLoader, random_split

import albumentations as A
from albumentations.pytorch import ToTensorV2
import segmentation_models_pytorch as smp


# ==============================================================================
# 1. Dataset Discovery & Extraction
# ==============================================================================
def find_or_extract_dataset(data_path=None, extract_dir="dataset_extracted"):
    """
    Locates or extracts the dataset.
    Supports:
      - .zip archive (e.g. 'solar-seeker-anno.zip')
      - Unzipped folder containing 'JPEGImages' and 'SegmentationClass'
      - Automatic lookup in the current directory if data_path is None
    """
    if data_path is None or not os.path.exists(data_path):
        candidates = [
            "solar_seeker_unified_dataset.zip",
            "data/datasets/solar_seeker_unified_dataset.zip",
            "data/unified_dataset/combined_train_val",
            os.path.join(os.path.dirname(__file__), "../../data/datasets/solar_seeker_unified_dataset.zip"),
            os.path.join(os.path.dirname(__file__), "../../data/datasets/solar-seeker-anno.zip"),
            "data/datasets/solar-seeker-anno.zip",
            "solar-seeker-anno.zip",
            "solar-seeker-anno",
            "dataset_extracted",
            ".",
        ]
        for cand in candidates:
            if os.path.exists(cand):
                data_path = cand
                break

    if data_path is None or not os.path.exists(data_path):
        raise FileNotFoundError(
            f"Dataset not found at '{data_path}'. Please specify --data <path_to_zip_or_folder>."
        )

    # If it's a zip file, extract it
    if data_path.lower().endswith(".zip") and os.path.isfile(data_path):
        print(f"📦 Extracting '{data_path}' to '{extract_dir}'...")
        os.makedirs(extract_dir, exist_ok=True)
        with zipfile.ZipFile(data_path, "r") as z:
            z.extractall(extract_dir)
        search_root = extract_dir
    else:
        search_root = data_path

    # Check for pre-split train/val structure
    valid_img_exts = {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".webp"}
    pre_train_img = None
    pre_train_mask = None
    pre_val_img = None
    pre_val_mask = None

    for root, _, files in os.walk(search_root):
        rel = os.path.relpath(root, search_root).replace("\\", "/").lower()
        has_imgs = any(os.path.splitext(f)[1].lower() in valid_img_exts for f in files)
        if has_imgs:
            if rel.endswith("train/images") or rel.endswith("train/imgs"):
                pre_train_img = root
            elif rel.endswith("train/masks") or rel.endswith("train/mask"):
                pre_train_mask = root
            elif rel.endswith("val/images") or rel.endswith("val/imgs"):
                pre_val_img = root
            elif rel.endswith("val/masks") or rel.endswith("val/mask"):
                pre_val_mask = root

    if pre_train_img and pre_train_mask:
        print(f"📁 Pre-split Train Images: {pre_train_img}")
        print(f"📁 Pre-split Train Masks:  {pre_train_mask}")
        if pre_val_img and pre_val_mask:
            print(f"📁 Pre-split Val Images:   {pre_val_img}")
            print(f"📁 Pre-split Val Masks:    {pre_val_mask}")
        return pre_train_img, pre_train_mask, pre_val_img, pre_val_mask

    # Fallback to single unsplit directory
    img_dir, mask_dir = None, None
    for root, _, files in os.walk(search_root):
        folder_name = os.path.basename(root).lower()
        has_images = any(os.path.splitext(f)[1].lower() in valid_img_exts for f in files)

        if has_images:
            if folder_name in ("jpegimages", "images", "imgs"):
                img_dir = root
            elif folder_name in ("segmentationclass", "masks", "mask", "segmentationclasspng"):
                mask_dir = root

    if not img_dir or not mask_dir:
        candidate_img = [os.path.join(search_root, "JPEGImages"), os.path.join(search_root, "images"), search_root]
        candidate_mask = [os.path.join(search_root, "SegmentationClass"), os.path.join(search_root, "masks")]
        for ci in candidate_img:
            if os.path.isdir(ci) and len(os.listdir(ci)) > 0:
                img_dir = ci
                break
        for cm in candidate_mask:
            if os.path.isdir(cm) and len(os.listdir(cm)) > 0:
                mask_dir = cm
                break

    if not img_dir or not mask_dir:
        raise FileNotFoundError(
            f"Could not locate image and mask folders inside '{search_root}'.\n"
            f"Expected 'train/images' + 'val/images' or 'JPEGImages' + 'SegmentationClass'."
        )

    print(f"📁 Image directory: {img_dir}")
    print(f"📁 Mask directory:  {mask_dir}")
    return img_dir, mask_dir, None, None


# ==============================================================================
# 2. PyTorch Dataset for CVAT/Pascal VOC Rooftop Segmentation
# ==============================================================================
class RoofObstacleDataset(Dataset):
    def __init__(self, images_dir, masks_dir, transform=None):
        self.images_dir = images_dir
        self.masks_dir = masks_dir
        self.transform = transform

        valid_exts = {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".webp"}
        image_files = [f for f in os.listdir(images_dir) if os.path.splitext(f)[1].lower() in valid_exts]
        mask_files = [f for f in os.listdir(masks_dir) if os.path.splitext(f)[1].lower() in valid_exts]

        # Match images and masks by base filename (case-insensitive)
        mask_map = {os.path.splitext(f)[0].lower(): f for f in mask_files}

        self.pairs = []
        for img_f in image_files:
            base = os.path.splitext(img_f)[0].lower()
            if base in mask_map:
                self.pairs.append((img_f, mask_map[base]))

        # Fallback: if names differ (e.g. sorted order matching)
        if len(self.pairs) == 0 and len(image_files) > 0 and len(image_files) == len(mask_files):
            print("Warning: Filenames didn't match directly by base name. Pairing sorted files.")
            self.pairs = list(zip(sorted(image_files), sorted(mask_files)))

        if len(self.pairs) == 0:
            raise FileNotFoundError(
                f"Could not match any images with masks!\n"
                f"Images in {images_dir}: {image_files[:5]}\n"
                f"Masks in {masks_dir}: {mask_files[:5]}"
            )

        print(f"✅ Successfully loaded {len(self.pairs)} image-mask pairs.")

    def __len__(self):
        return len(self.pairs)

    def __getitem__(self, idx):
        img_name, mask_name = self.pairs[idx]
        img_path = os.path.join(self.images_dir, img_name)
        mask_path = os.path.join(self.masks_dir, mask_name)

        # 1. Read Image
        image = cv2.imread(img_path)
        if image is None:
            raise FileNotFoundError(f"Could not read image: {img_path}")
        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

        # 2. Read Mask (Grayscale)
        # CVAT VOC masks: background = 0, roof class = 81 (or RGB 61,61,245)
        raw_mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
        if raw_mask is None:
            raise FileNotFoundError(f"Could not read mask: {mask_path}")

        # Strictly binarize: 1.0 for roof, 0.0 for background
        roof_mask = (raw_mask > 0).astype(np.float32)

        # 3. Apply Albumentations
        if self.transform:
            augmented = self.transform(image=image, mask=roof_mask)
            image = augmented["image"]
            roof_mask = augmented["mask"]

        # Ensure image is (3, H, W) float32 tensor
        if not isinstance(image, torch.Tensor):
            image = torch.tensor(image).permute(2, 0, 1).float() / 255.0
        else:
            image = image.float()

        # Ensure mask is (1, H, W) float32 binary tensor
        if not isinstance(roof_mask, torch.Tensor):
            roof_mask = torch.tensor(roof_mask).float()
        else:
            roof_mask = roof_mask.float()

        # Re-threshold to 0/1 after spatial interpolations
        roof_mask = (roof_mask > 0.5).float()

        if roof_mask.ndim == 2:
            roof_mask = roof_mask.unsqueeze(0)
        elif roof_mask.ndim == 3 and roof_mask.shape[-1] == 1:
            roof_mask = roof_mask.permute(2, 0, 1)

        return image, roof_mask


# ==============================================================================
# 3. Augmentations (Albumentations)
# ==============================================================================
def get_training_augmentation(img_size=512):
    """
    Robust augmentation pipeline for satellite imagery:
    Flips, rotations, affine scaling/rotation, color jitter, normalization.
    """
    try:
        spatial_affine = A.Affine(scale=(0.9, 1.1), rotate=(-15, 15), translate_percent=(-0.05, 0.05), p=0.5)
    except AttributeError:
        # Fallback for older albumentations
        spatial_affine = A.ShiftScaleRotate(scale_limit=0.1, rotate_limit=15, shift_limit=0.05, p=0.5, border_mode=0)

    train_transform = [
        A.Resize(img_size, img_size),
        A.HorizontalFlip(p=0.5),
        A.VerticalFlip(p=0.5),
        A.RandomRotate90(p=0.5),
        spatial_affine,
        A.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2, hue=0.1, p=0.5),
        A.Normalize(mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225)),
        ToTensorV2(),
    ]
    return A.Compose(train_transform)


def get_validation_augmentation(img_size=512):
    """Deterministic validation pipeline."""
    test_transform = [
        A.Resize(img_size, img_size),
        A.Normalize(mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225)),
        ToTensorV2(),
    ]
    return A.Compose(test_transform)


# ==============================================================================
# 4. Loss Function & Evaluation Metrics
# ==============================================================================
class CombinedBCEDiceLoss(nn.Module):
    """
    Combines BCE with Logits and Dice Loss.
    Addresses class imbalance in satellite imagery and sharpens roof boundaries.
    """
    def __init__(self, bce_weight=0.5, dice_weight=0.5):
        super().__init__()
        self.bce = nn.BCEWithLogitsLoss()
        self.dice = smp.losses.DiceLoss(mode="binary")
        self.bce_weight = bce_weight
        self.dice_weight = dice_weight

    def forward(self, y_pred, y_true):
        return self.bce_weight * self.bce(y_pred, y_true) + self.dice_weight * self.dice(y_pred, y_true)


def compute_metrics(preds_logits, targets, threshold=0.5, eps=1e-7):
    """
    Computes Intersection-over-Union (IoU/Jaccard) and Dice score (F1) for binary masks.
    """
    probs = torch.sigmoid(preds_logits)
    preds_bin = (probs > threshold).float()

    intersection = (preds_bin * targets).sum().item()
    total = (preds_bin + targets).sum().item()
    union = total - intersection

    iou = (intersection + eps) / (union + eps)
    dice = (2.0 * intersection + eps) / (total + eps)
    return iou, dice


# ==============================================================================
# 5. Post-Processing & Geometry Regularization (Exported for main.py)
# ==============================================================================
def post_process_and_calculate_area(roof_mask, obstacle_mask=None, gsd=0.15, min_roof_area_m2=35.0, min_solidity=0.45):
    """
    Applies:
      1. Morphological opening to strip isolated speckle noise
      2. Physical area thresholding (default >= 35 m2 for viable PV rooftops)
      3. Geometric solidity check (area / convex_hull >= 0.45) to drop irregular vegetation/curb noise
      4. Ramer-Douglas-Peucker (approxPolyDP) polygon regularization for crisp building boundaries
    
    Args:
        roof_mask: 2D binary numpy array (H, W) or (0.0 to 1.0)
        obstacle_mask: Optional 2D binary numpy array for obstacles (default None)
        gsd: Ground Sample Distance in meters/pixel (default 0.15m)
        min_roof_area_m2: Minimum viable rooftop area in m2 (default 35.0 m2)
        min_solidity: Minimum ratio of area to convex hull (default 0.45)
        
    Returns:
        clean_roof_mask: Regularized polygon mask (uint8, 0 or 255)
        usable_area_mask: Usable rooftop mask excluding obstacles
        usable_area_m2: Calculated gross usable area in square meters
    """
    roof_mask_uint8 = (roof_mask * 255).astype(np.uint8) if roof_mask.max() <= 1.0 else roof_mask.astype(np.uint8)

    # 1. Morphological opening to eliminate fine speckles & salt noise
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    clean_raw = cv2.morphologyEx(roof_mask_uint8, cv2.MORPH_OPEN, kernel)

    # 2. Contour extraction
    contours, _ = cv2.findContours(clean_raw, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    clean_roof_mask = np.zeros_like(roof_mask_uint8)

    # Convert physical area (m2) to pixel area: pixels = m2 / (gsd^2)
    min_pixel_area = min_roof_area_m2 / (gsd ** 2)

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_pixel_area:
            continue

        # Solidity filter: drops elongated/concave irregular tree branches or road edges
        hull = cv2.convexHull(cnt)
        hull_area = cv2.contourArea(hull)
        solidity = area / hull_area if hull_area > 0 else 0
        if solidity < min_solidity:
            continue

        peri = cv2.arcLength(cnt, True)
        epsilon = 0.02 * peri
        approx = cv2.approxPolyDP(cnt, epsilon, True)
        if len(approx) >= 3:
            cv2.drawContours(clean_roof_mask, [approx], 0, 255, -1)
        else:
            cv2.drawContours(clean_roof_mask, [cnt], 0, 255, -1)

    if obstacle_mask is not None:
        obs_uint8 = (obstacle_mask * 255).astype(np.uint8) if obstacle_mask.max() <= 1.0 else obstacle_mask.astype(np.uint8)
        usable_area_mask = cv2.bitwise_and(clean_roof_mask, cv2.bitwise_not(obs_uint8))
    else:
        usable_area_mask = clean_roof_mask.copy()

    usable_pixels = np.count_nonzero(usable_area_mask)
    usable_area_m2 = usable_pixels * (gsd ** 2)

    return clean_roof_mask, usable_area_mask, usable_area_m2


# ==============================================================================
# 6. Prediction Visualizer (Google Colab & Reports)
# ==============================================================================
def visualize_predictions(model, dataset, device, num_samples=3, save_path="sample_predictions.png"):
    """
    Generates side-by-side inspection figures:
    Original Satellite Image | Ground Truth Mask | Predicted Mask | RDP Polygons
    """
    model.eval()
    num_samples = min(num_samples, len(dataset))
    fig, axes = plt.subplots(num_samples, 4, figsize=(16, 4 * num_samples))
    if num_samples == 1:
        axes = np.expand_dims(axes, 0)

    # ImageNet un-normalization constants
    mean = np.array([0.485, 0.456, 0.406])
    std = np.array([0.229, 0.224, 0.225])

    for i in range(num_samples):
        image_tensor, mask_tensor = dataset[i]
        input_batch = image_tensor.unsqueeze(0).to(device)

        with torch.no_grad():
            output = model(input_batch)
            pred_mask = (torch.sigmoid(output).squeeze().cpu().numpy() > 0.5).astype(np.float32)

        clean_poly, _, _ = post_process_and_calculate_area(pred_mask)

        # Un-normalize image for plotting
        img_np = image_tensor.permute(1, 2, 0).cpu().numpy()
        img_np = np.clip((img_np * std + mean), 0, 1)

        gt_mask_np = mask_tensor.squeeze().cpu().numpy()

        # 1. Satellite Image
        axes[i, 0].imshow(img_np)
        axes[i, 0].set_title(f"Sample #{i+1}: Satellite Image")
        axes[i, 0].axis("off")

        # 2. Ground Truth
        axes[i, 1].imshow(gt_mask_np, cmap="Blues")
        axes[i, 1].set_title("Ground Truth Mask")
        axes[i, 1].axis("off")

        # 3. Model Output
        axes[i, 2].imshow(pred_mask, cmap="Reds")
        axes[i, 2].set_title("U-Net Prediction")
        axes[i, 2].axis("off")

        # 4. RDP Regularized Polygon
        axes[i, 3].imshow(clean_poly, cmap="Greens")
        axes[i, 3].set_title("Polygon Regularized (approxPolyDP)")
        axes[i, 3].axis("off")

    plt.tight_layout()
    plt.savefig(save_path, dpi=200, bbox_inches="tight")
    print(f"🖼️  Sample visual predictions saved to '{save_path}'")
    try:
        plt.show()
    except Exception:
        pass


# ==============================================================================
# 7. Training Pipeline
# ==============================================================================
def train_model(
    data_path=None,
    epochs=35,
    batch_size=4,
    lr=1e-4,
    img_size=512,
    val_split=0.2,
    save_name="unet_roof_obstacle.pth",
    device=None,
):
    """
    Main training routine.
    """
    if device is None:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"🚀 Training Device: {device}")
    if torch.cuda.is_available():
        print(f"   GPU Model: {torch.cuda.get_device_name(0)}")

    # 1. Find & Prepare Dataset
    train_img_dir, train_mask_dir, val_img_dir, val_mask_dir = find_or_extract_dataset(data_path)

    # 2. Build Dataset & Optional Train/Val Split
    if val_img_dir and val_mask_dir:
        print("📊 Using pre-split Train and Validation sets directly.")
        train_ds = RoofObstacleDataset(train_img_dir, train_mask_dir, transform=get_training_augmentation(img_size))
        val_ds = RoofObstacleDataset(val_img_dir, val_mask_dir, transform=get_validation_augmentation(img_size))
        print(f"📊 Dataset counts: {len(train_ds)} train tiles, {len(val_ds)} validation tiles.")
    else:
        full_dataset = RoofObstacleDataset(train_img_dir, train_mask_dir, transform=None)
        total_samples = len(full_dataset)

        val_count = int(total_samples * val_split) if total_samples >= 5 and val_split > 0 else 0
        train_count = total_samples - val_count

        if val_count > 0:
            generator = torch.Generator().manual_seed(42)
            train_subset, val_subset = random_split(full_dataset, [train_count, val_count], generator=generator)

            # Wrap subsets with respective transformations
            class SubsetAdapter(Dataset):
                def __init__(self, subset, transform):
                    self.subset = subset
                    self.transform = transform

                def __len__(self):
                    return len(self.subset)

                def __getitem__(self, idx):
                    img_name, mask_name = self.subset.dataset.pairs[self.subset.indices[idx]]
                    img = cv2.imread(os.path.join(self.subset.dataset.images_dir, img_name))
                    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
                    raw_mask = cv2.imread(os.path.join(self.subset.dataset.masks_dir, mask_name), cv2.IMREAD_GRAYSCALE)
                    roof_mask = (raw_mask > 0).astype(np.float32)

                    if self.transform:
                        aug = self.transform(image=img, mask=roof_mask)
                        img = aug["image"]
                        roof_mask = aug["mask"]

                    roof_mask = (roof_mask > 0.5).float()
                    if roof_mask.ndim == 2:
                        roof_mask = roof_mask.unsqueeze(0)
                    return img, roof_mask

                def get_raw(self, idx):
                    img_name, mask_name = self.subset.dataset.pairs[self.subset.indices[idx]]
                    return img_name, mask_name

            train_ds = SubsetAdapter(train_subset, get_training_augmentation(img_size))
            val_ds = SubsetAdapter(val_subset, get_validation_augmentation(img_size))
            print(f"📊 Dataset split: {train_count} train images, {val_count} validation images.")
        else:
            full_dataset.transform = get_training_augmentation(img_size)
            train_ds = full_dataset
            val_ds = None
            print(f"📊 Dataset: Training on all {train_count} images (val_split=0).")

    # DataLoader setup: avoid BatchNorm crash when batch has only 1 sample
    drop_last = (len(train_ds) % batch_size == 1) and (len(train_ds) > batch_size)
    num_workers = 2 if (os.name != "nt" and torch.cuda.is_available()) else 0

    train_loader = DataLoader(
        train_ds, batch_size=batch_size, shuffle=True, drop_last=drop_last, num_workers=num_workers
    )

    val_loader = (
        DataLoader(val_ds, batch_size=batch_size, shuffle=False, num_workers=num_workers)
        if val_ds is not None
        else None
    )

    # 3. Model Architecture
    print("🏗️  Initializing U-Net (ResNet34 backbone, ImageNet pre-trained)...")
    model = smp.Unet(
        encoder_name="resnet34",
        encoder_weights="imagenet",
        in_channels=3,
        classes=1,
    ).to(device)

    loss_fn = CombinedBCEDiceLoss(bce_weight=0.5, dice_weight=0.5)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs, eta_min=1e-6)

    # History tracker
    history = {
        "train_loss": [], "train_iou": [], "train_dice": [],
        "val_loss": [], "val_iou": [], "val_dice": [],
    }

    best_val_iou = -1.0
    best_loss = float("inf")

    print("\n" + "=" * 70)
    print(f"🚀 Starting Training for {epochs} Epochs (Batch size: {batch_size}, LR: {lr})")
    print("=" * 70)

    for epoch in range(epochs):
        # ----------------- TRAIN PHASE -----------------
        model.train()
        train_loss = 0.0
        train_iou_sum, train_dice_sum = 0.0, 0.0

        for images, masks in train_loader:
            images = images.to(device)
            masks = masks.to(device)

            optimizer.zero_grad()
            outputs = model(images)
            loss = loss_fn(outputs, masks)
            loss.backward()
            optimizer.step()

            train_loss += loss.item()
            b_iou, b_dice = compute_metrics(outputs, masks)
            train_iou_sum += b_iou
            train_dice_sum += b_dice

        scheduler.step()

        num_tb = len(train_loader)
        avg_train_loss = train_loss / num_tb
        avg_train_iou = train_iou_sum / num_tb
        avg_train_dice = train_dice_sum / num_tb

        history["train_loss"].append(avg_train_loss)
        history["train_iou"].append(avg_train_iou)
        history["train_dice"].append(avg_train_dice)

        # ----------------- VAL PHASE -----------------
        if val_loader:
            model.eval()
            val_loss = 0.0
            val_iou_sum, val_dice_sum = 0.0, 0.0

            with torch.no_grad():
                for v_images, v_masks in val_loader:
                    v_images = v_images.to(device)
                    v_masks = v_masks.to(device)

                    v_outputs = model(v_images)
                    v_loss = loss_fn(v_outputs, v_masks)

                    val_loss += v_loss.item()
                    vb_iou, vb_dice = compute_metrics(v_outputs, v_masks)
                    val_iou_sum += vb_iou
                    val_dice_sum += vb_dice

            num_vb = len(val_loader)
            avg_val_loss = val_loss / num_vb
            avg_val_iou = val_iou_sum / num_vb
            avg_val_dice = val_dice_sum / num_vb

            history["val_loss"].append(avg_val_loss)
            history["val_iou"].append(avg_val_iou)
            history["val_dice"].append(avg_val_dice)

            print(
                f"Epoch [{epoch+1:02d}/{epochs:02d}] "
                f"Train Loss: {avg_train_loss:.4f} | IoU: {avg_train_iou:.3f} | Dice: {avg_train_dice:.3f} || "
                f"Val Loss: {avg_val_loss:.4f} | IoU: {avg_val_iou:.3f} | Dice: {avg_val_dice:.3f}"
            )

            # Save best checkpoint
            if avg_val_iou > best_val_iou:
                best_val_iou = avg_val_iou
                torch.save(model.state_dict(), save_name)
                # Also save best tag
                torch.save(model.state_dict(), "best_unet_roof.pth")
        else:
            print(
                f"Epoch [{epoch+1:02d}/{epochs:02d}] "
                f"Train Loss: {avg_train_loss:.4f} | IoU: {avg_train_iou:.3f} | Dice: {avg_train_dice:.3f}"
            )
            if avg_train_loss < best_loss:
                best_loss = avg_train_loss
                torch.save(model.state_dict(), save_name)

    print("=" * 70)
    print(f"🎉 Training Complete! Model weights successfully saved to '{save_name}'.")

    # Plot & Save Learning Curves
    plot_learning_curves(history, save_path="training_history.png")

    # Visualize sample predictions
    vis_dataset = val_ds if val_ds is not None else train_ds
    visualize_predictions(model, vis_dataset, device, num_samples=3, save_path="sample_predictions.png")

    return model, history


def plot_learning_curves(history, save_path="training_history.png"):
    """Saves plots of loss, IoU, and Dice score progression."""
    epochs = range(1, len(history["train_loss"]) + 1)
    has_val = len(history["val_loss"]) > 0

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))

    # Loss plot
    ax1.plot(epochs, history["train_loss"], "b-o", label="Train Loss", markersize=3)
    if has_val:
        ax1.plot(epochs, history["val_loss"], "r--s", label="Val Loss", markersize=3)
    ax1.set_title("Combined BCE + Dice Loss")
    ax1.set_xlabel("Epoch")
    ax1.set_ylabel("Loss")
    ax1.grid(True, linestyle="--", alpha=0.6)
    ax1.legend()

    # IoU & Dice plot
    ax2.plot(epochs, history["train_iou"], "b-o", label="Train IoU", markersize=3)
    ax2.plot(epochs, history["train_dice"], "c-^", label="Train Dice", markersize=3)
    if has_val:
        ax2.plot(epochs, history["val_iou"], "r--s", label="Val IoU", markersize=3)
        ax2.plot(epochs, history["val_dice"], "m--d", label="Val Dice", markersize=3)
    ax2.set_title("IoU (Jaccard) & Dice Score")
    ax2.set_xlabel("Epoch")
    ax2.set_ylabel("Metric Score (0-1)")
    ax2.grid(True, linestyle="--", alpha=0.6)
    ax2.legend()

    plt.tight_layout()
    plt.savefig(save_path, dpi=200, bbox_inches="tight")
    print(f"📈 Learning curves saved to '{save_path}'")
    try:
        plt.show()
    except Exception:
        pass


# ==============================================================================
# 8. Command Line Interface for Google Colab & Terminal
# ==============================================================================
def parse_args():
    parser = argparse.ArgumentParser(description="Solar Seeker Rooftop U-Net Training")
    parser.add_argument(
        "--data",
        type=str,
        default=None,
        help="Path to solar-seeker-anno.zip or dataset directory (default: auto-detected)",
    )
    parser.add_argument("--epochs", type=int, default=35, help="Number of training epochs (default: 35)")
    parser.add_argument("--batch_size", type=int, default=4, help="Batch size for training (default: 4)")
    parser.add_argument("--lr", type=float, default=1e-4, help="Learning rate (default: 0.0001)")
    parser.add_argument("--img_size", type=int, default=512, help="Input image dimension (default: 512)")
    parser.add_argument("--val_split", type=float, default=0.2, help="Validation split ratio (default: 0.2)")
    parser.add_argument("--output", type=str, default="unet_roof_obstacle.pth", help="Checkpoint output filename")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()

    print("==================================================================")
    print("      Solar Seeker — Rooftop Solar AI Segmentation Training       ")
    print("==================================================================")

    train_model(
        data_path=args.data,
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        img_size=args.img_size,
        val_split=args.val_split,
        save_name=args.output,
    )
