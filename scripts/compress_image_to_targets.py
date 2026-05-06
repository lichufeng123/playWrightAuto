import argparse
import io
import struct
from pathlib import Path

from PIL import Image


DEFAULT_INPUT = Path("image/big_image.png")
DEFAULT_OUTPUT_DIR = Path("output/image-compressed")

# 目标大小，单位 MB。脚本会尽量生成接近该大小的图片文件，而不是简单压到小于该大小。
TARGET_MB_LIST: list[float] = [12, 9]

MIN_QUALITY = 20
MAX_QUALITY = 100
RESIZE_STEP = 0.92
TARGET_TOLERANCE = 0.01
JPEG_COMMENT_CHUNK_SIZE = 60000


def target_bytes(target_mb: float) -> int:
    if target_mb <= 0:
        raise argparse.ArgumentTypeError(f"目标大小必须大于 0: {target_mb}")
    return int(target_mb * 1024 * 1024)


def normalize_for_jpeg(image: Image.Image) -> Image.Image:
    if image.mode in {"RGB", "L"}:
        return image.copy()

    # 透明 PNG 转 JPG 时用白底合成，避免透明区域变黑。
    background = Image.new("RGB", image.size, "white")
    if image.mode in {"RGBA", "LA"}:
        background.paste(image, mask=image.getchannel("A"))
        return background
    return image.convert("RGB")


def encode_jpeg(image: Image.Image, quality: int, *, optimize: bool = False) -> bytes:
    buffer = io.BytesIO()
    image.save(
        buffer,
        format="JPEG",
        quality=quality,
        optimize=optimize,
        progressive=False,
        subsampling=0,
    )
    return buffer.getvalue()


def add_jpeg_comment_padding(data: bytes, target_size: int) -> bytes:
    if len(data) > target_size:
        return data

    padding_size = target_size - len(data)
    if padding_size == 0:
        return data
    if not data.startswith(b"\xff\xd8"):
        raise ValueError("只有 JPEG 文件支持安全填充到指定大小。")

    chunks: list[bytes] = []
    remaining = padding_size
    while remaining > 0:
        # JPEG COM 段格式：FF FE + 2字节长度，长度字段包含自身 2 字节。
        payload_size = min(remaining - 4, JPEG_COMMENT_CHUNK_SIZE)
        if payload_size <= 0:
            break
        chunk_length = payload_size + 2
        chunks.append(b"\xff\xfe" + struct.pack(">H", chunk_length) + (b"0" * payload_size))
        remaining -= payload_size + 4

    padded = data[:2] + b"".join(chunks) + data[2:]
    if len(padded) < target_size:
        # 文件尾部追加少量字节，多数图片解析器会忽略 EOI 后的数据，用来补齐最后 1-3 字节。
        padded += b"0" * (target_size - len(padded))
    return padded


def compress_to_target(image: Image.Image, target_size: int) -> tuple[bytes, int, tuple[int, int], bool]:
    working = normalize_for_jpeg(image)
    min_size = int(target_size * (1 - TARGET_TOLERANCE))

    while True:
        low = MIN_QUALITY
        high = MAX_QUALITY
        best_bytes = encode_jpeg(working, low)
        best_quality = low
        best_delta = abs(len(best_bytes) - target_size)

        while low <= high:
            quality = (low + high) // 2
            current = encode_jpeg(working, quality)
            current_delta = abs(len(current) - target_size)
            if len(current) <= target_size and current_delta <= best_delta:
                best_bytes = current
                best_quality = quality
                best_delta = current_delta

            if len(current) < min_size:
                low = quality + 1
            elif len(current) > target_size:
                high = quality - 1
            else:
                return current, quality, working.size, False

        if len(best_bytes) <= target_size:
            if len(best_bytes) >= min_size:
                return best_bytes, best_quality, working.size, False
            padded = add_jpeg_comment_padding(best_bytes, target_size)
            return padded, best_quality, working.size, True

        next_width = max(1, int(working.width * RESIZE_STEP))
        next_height = max(1, int(working.height * RESIZE_STEP))
        if (next_width, next_height) == working.size:
            raise RuntimeError("图片已无法继续缩小，但仍未达到目标大小。")
        working = working.resize((next_width, next_height), Image.Resampling.LANCZOS)


def target_label(target_mb: float) -> str:
    if float(target_mb).is_integer():
        return str(int(target_mb))
    return str(target_mb).replace(".", "_")


def compress_image(input_path: Path, output_dir: Path, target_mb_list: list[float]) -> None:
    if not input_path.exists():
        raise FileNotFoundError(f"输入图片不存在: {input_path}")

    output_dir.mkdir(parents=True, exist_ok=True)
    with Image.open(input_path) as image:
        for target_mb in target_mb_list:
            size = target_bytes(target_mb)
            data, quality, final_size, padded = compress_to_target(image, size)
            output_path = output_dir / f"{input_path.stem}_{target_label(target_mb)}mb.jpg"
            output_path.write_bytes(data)
            actual_mb = len(data) / 1024 / 1024
            print(
                f"已生成: {output_path} "
                f"(目标≈{target_mb}MB, 实际={actual_mb:.2f}MB, quality={quality}, "
                f"size={final_size[0]}x{final_size[1]}, padding={'yes' if padded else 'no'})"
            )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="将图片压缩/调整到一个或多个目标大小附近。")
    parser.add_argument("--input", default=str(DEFAULT_INPUT), help="输入图片路径，默认 image/big_image.png。")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="输出目录。")
    parser.add_argument(
        "--target-mb",
        action="append",
        type=float,
        help="目标大小 MB。传入后会覆盖脚本内 TARGET_MB_LIST，可传多次，例如 --target-mb 12 --target-mb 9。",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    target_mb_list = args.target_mb or TARGET_MB_LIST
    compress_image(Path(args.input), Path(args.output_dir), target_mb_list)


if __name__ == "__main__":
    main()
