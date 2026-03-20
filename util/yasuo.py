# Compress the images while keeping size near target

from PIL import Image
import io
import os

input_paths = [
    "D:\\Users\\Pictures\\cankao1.png",
    "D:\\Users\\Pictures\\cankao2.png",
]

TARGET_MB = 19
MIN_MB = 18
MAX_MB = 20

PNG_COMPRESS_LEVEL = 6
PNG_SCALE_MIN = 0.7
PNG_SCALE_MAX = 1.0
PNG_SCALE_ADJUST = 0.02
PNG_MAX_ITER = 6

JPEG_QUALITY_MIN = 40
JPEG_QUALITY_MAX = 95
JPEG_SCALE_STEPS = [1.0, 0.98, 0.96, 0.94, 0.92, 0.9, 0.88, 0.86, 0.84, 0.82, 0.8, 0.75, 0.7]


def mb_to_bytes(mb):
    return int(mb * 1024 * 1024)


def resize_image(img, scale):
    if scale == 1.0:
        return img
    new_w = max(1, int(img.width * scale))
    new_h = max(1, int(img.height * scale))
    return img.resize((new_w, new_h), Image.LANCZOS)


def encode_png(img, compress_level):
    buf = io.BytesIO()
    img.save(buf, "PNG", compress_level=compress_level, optimize=False)
    return buf.getbuffer().nbytes, buf


def encode_jpeg(img, quality):
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
    return buf.getbuffer().nbytes, buf


def find_best_png(path, img):
    target_bytes = mb_to_bytes(TARGET_MB)
    min_bytes = mb_to_bytes(MIN_MB)
    max_bytes = mb_to_bytes(MAX_MB)

    original_bytes = os.path.getsize(path)
    if min_bytes <= original_bytes <= max_bytes:
        return img, 1.0, PNG_COMPRESS_LEVEL, original_bytes

    scale = (target_bytes / original_bytes) ** 0.5
    scale = max(PNG_SCALE_MIN, min(PNG_SCALE_MAX, scale))

    best = None
    for step in range(1, PNG_MAX_ITER + 1):
        candidate = resize_image(img, scale)
        size_bytes, _ = encode_png(candidate, PNG_COMPRESS_LEVEL)
        best = (candidate, scale, PNG_COMPRESS_LEVEL, size_bytes)
        print(
            f"{path} | png step {step}/{PNG_MAX_ITER} | scale={scale:.4f} | size={size_bytes / 1024 / 1024:.2f}MB",
            flush=True,
        )

        if min_bytes <= size_bytes <= max_bytes:
            break
        if size_bytes > max_bytes:
            scale = max(PNG_SCALE_MIN, scale * (1 - PNG_SCALE_ADJUST))
        else:
            scale = min(PNG_SCALE_MAX, scale * (1 + PNG_SCALE_ADJUST))

    return best


def find_best_jpeg(img):
    target_bytes = mb_to_bytes(TARGET_MB)
    min_bytes = mb_to_bytes(MIN_MB)
    max_bytes = mb_to_bytes(MAX_MB)

    best = None

    for scale in JPEG_SCALE_STEPS:
        candidate = resize_image(img, scale)
        low, high = JPEG_QUALITY_MIN, JPEG_QUALITY_MAX
        best_local = None
        best_gap = None

        while low <= high:
            quality = (low + high) // 2
            size_bytes, _ = encode_jpeg(candidate, quality)

            if min_bytes <= size_bytes <= max_bytes:
                gap = abs(size_bytes - target_bytes)
                if best_local is None or gap < best_gap:
                    best_local = (candidate, quality, size_bytes)
                    best_gap = gap

                if size_bytes > target_bytes:
                    high = quality - 1
                else:
                    low = quality + 1
            elif size_bytes > max_bytes:
                high = quality - 1
            else:
                low = quality + 1

        if best_local:
            return best_local

        size_min, _ = encode_jpeg(candidate, JPEG_QUALITY_MIN)
        if min_bytes <= size_min <= max_bytes:
            return (candidate, JPEG_QUALITY_MIN, size_min)

        if size_min < min_bytes:
            size_max, _ = encode_jpeg(candidate, JPEG_QUALITY_MAX)
            return (candidate, JPEG_QUALITY_MAX, size_max)

        best = (candidate, JPEG_QUALITY_MIN, size_min)

    return best


output_paths = []

for path in input_paths:
    img = Image.open(path)
    ext = os.path.splitext(path)[1].lower()
    base = os.path.splitext(path)[0]

    if ext == ".png":
        chosen_img, scale, compress_level, size_bytes = find_best_png(path, img)
        output_path = f"{base}_compressed{ext}"
        chosen_img.save(
            output_path,
            "PNG",
            compress_level=compress_level,
            optimize=False,
        )
        print(
            f"{path} -> {output_path} | scale={scale:.4f} | compress_level={compress_level} | size={size_bytes / 1024 / 1024:.2f}MB"
        )
    else:
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        chosen_img, quality, size_bytes = find_best_jpeg(img)
        output_path = f"{base}_compressed.jpg"
        chosen_img.save(
            output_path,
            "JPEG",
            quality=quality,
            optimize=True,
            progressive=True,
        )
        print(
            f"{path} -> {output_path} | quality={quality} | size={size_bytes / 1024 / 1024:.2f}MB"
        )

    output_paths.append(output_path)

output_paths
