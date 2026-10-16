"""
Solar Seeker — Geometric Post-Processing & Polygon Regularization
==================================================================
Performs morphological cleaning, physical filtering, and Ramer-Douglas-Peucker (RDP)
polygon simplification on predicted rooftop masks.
"""

import cv2
import numpy as np


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


def extract_polygon_list(clean_roof_mask, gsd=0.15, packing_factor=0.65, panel_density_kwp_per_m2=0.20):
    """
    Extracts individual rooftop polygons and their physical metrics for the frontend interactive selector.

    Coordinates are returned both in absolute image pixels and normalized to [0, 1]
    (x / width, y / height) so the frontend can overlay them on the uploaded screenshot
    at any display size (e.g. an SVG with viewBox="0 0 1 1").

    Polygons are sorted by area (largest first) and IDs are assigned after sorting.

    Args:
        clean_roof_mask: Regularized uint8 mask (0 / 255) from post_process_and_calculate_area
        gsd: Ground Sample Distance in meters/pixel
        packing_factor: Usable fraction of gross area (for per-roof kWp estimate)
        panel_density_kwp_per_m2: Installed kWp per usable m²
    
    Returns:
        list of dicts: [
            {
                "id": 1,
                "points": [[x1, y1], [x2, y2], ...],             # pixels
                "points_normalized": [[nx1, ny1], ...],           # 0..1
                "bbox": [min_x, min_y, max_x, max_y],             # pixels
                "bbox_normalized": [nmin_x, nmin_y, nmax_x, nmax_y],
                "center": [cx, cy],                               # pixels
                "center_normalized": [ncx, ncy],
                "gross_area_m2": float,
                "net_usable_area_m2": float,
                "estimated_kwp": float
            }, ...
        ]
    """
    h, w = clean_roof_mask.shape[:2]
    contours, _ = cv2.findContours(clean_roof_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    polygons = []

    for cnt in contours:
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
        if len(approx) < 3:
            approx = cnt
        pts = approx.reshape(-1, 2).tolist()
        if len(pts) < 3:
            continue
        
        area_px = cv2.contourArea(approx)
        area_m2 = area_px * (gsd ** 2)
        if area_m2 <= 0:
            continue

        M = cv2.moments(approx)
        if M["m00"] != 0:
            cx = int(M["m10"] / M["m00"])
            cy = int(M["m01"] / M["m00"])
        else:
            cx, cy = pts[0] if pts else [0, 0]

        bx, by, bw, bh = cv2.boundingRect(approx)
        net_area_m2 = area_m2 * packing_factor

        polygons.append({
            "points": pts,
            "points_normalized": [[round(x / w, 5), round(y / h, 5)] for x, y in pts],
            "bbox": [bx, by, bx + bw, by + bh],
            "bbox_normalized": [round(bx / w, 5), round(by / h, 5),
                                round((bx + bw) / w, 5), round((by + bh) / h, 5)],
            "center": [cx, cy],
            "center_normalized": [round(cx / w, 5), round(cy / h, 5)],
            "gross_area_m2": round(area_m2, 2),
            "net_usable_area_m2": round(net_area_m2, 2),
            "estimated_kwp": round(net_area_m2 * panel_density_kwp_per_m2, 2),
        })

    # Largest roof first; assign stable IDs after sorting
    polygons.sort(key=lambda p: p["gross_area_m2"], reverse=True)
    for idx, poly in enumerate(polygons, start=1):
        poly["id"] = idx

    return [{"id": p["id"], **{k: v for k, v in p.items() if k != "id"}} for p in polygons]

