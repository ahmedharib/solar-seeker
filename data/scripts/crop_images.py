import os
from pathlib import Path
from PIL import Image

# Directories
BASE_DATA_DIR = Path(__file__).resolve().parent.parent / "images"
INPUT_DIR = BASE_DATA_DIR / "test_images_uncropped"
OUTPUT_DIR = BASE_DATA_DIR / "test_images_cropped"

# Crop offsets (in pixels)
CROP_LEFT = 60
CROP_TOP = 53
CROP_RIGHT = 42
CROP_BOTTOM = 84

# Supported image extensions
VALID_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"}

def batch_crop():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    image_files = [f for f in INPUT_DIR.iterdir() if f.suffix.lower() in VALID_EXTENSIONS]

    if not image_files:
        print(f"No valid images found in '{INPUT_DIR}'.")
        return

    processed_count = 0

    for file_path in image_files:
        try:
            with Image.open(file_path) as img:
                width, height = img.size

                # Calculate crop boundaries dynamically to be safe
                left = CROP_LEFT
                top = CROP_TOP
                right = width - CROP_RIGHT
                bottom = height - CROP_BOTTOM

                # Verification check
                if right <= left or bottom <= top:
                    print(f"Skipping {file_path.name}: dimensions too small ({width}x{height})")
                    continue

                cropped_img = img.crop((left, top, right, bottom))

                output_path = OUTPUT_DIR / file_path.name

                # Preserve format and save
                cropped_img.save(output_path)
                processed_count += 1
                print(f"Cropped: {file_path.name} -> {cropped_img.size[0]}x{cropped_img.size[1]}px")

        except Exception as e:
            print(f"Error processing {file_path.name}: {e}")

    print(f"\nCompleted! Processed {processed_count} image(s) saved to '{OUTPUT_DIR}'.")

if __name__ == "__main__":
    batch_crop()