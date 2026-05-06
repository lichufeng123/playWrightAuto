import argparse
from pathlib import Path

from PIL import Image


DEFAULT_INPUT = Path("image/test_image.jpg")
DEFAULT_OUTPUT_DIR = Path("output/image-resolutions")

# 需要生成的分辨率列表。后续要增删尺寸，直接改这里即可。
RESOLUTIONS: list[tuple[int, int]] = [
    (500, 1500),
    (1500, 500),
    (500, 1250),
    (500, 1000),
    (300, 300),
    (301, 301),
    (350, 350),
    (250, 250),
    (100, 100),
    (400, 400),
    (401, 401),
    (390, 399),
]

def parse_resolution(value: str) -> tuple[int, int]:
    normalized = value.lower().replace("*", "x").replace("×", "x")
    width_text, height_text = normalized.split("x", 1)
    width = int(width_text.strip())
    height = int(height_text.strip())
    if width <= 0 or height <= 0:
        raise argparse.ArgumentTypeError(f"分辨率必须为正整数: {value}")
    return width, height


def output_suffix(image: Image.Image, requested_suffix: str | None) -> str:
    if requested_suffix:
        return requested_suffix if requested_suffix.startswith(".") else f".{requested_suffix}"
    if image.format:
        return f".{image.format.lower().replace('jpeg', 'jpg')}"
    return ".jpg"


def save_resized_images(input_path: Path, output_dir: Path, resolutions: list[tuple[int, int]], suffix: str | None) -> None:
    if not input_path.exists():
        raise FileNotFoundError(f"输入图片不存在: {input_path}")

    output_dir.mkdir(parents=True, exist_ok=True)
    with Image.open(input_path) as image:
        final_suffix = output_suffix(image, suffix)
        for width, height in resolutions:
            resized = image.resize((width, height), Image.Resampling.LANCZOS)
            if final_suffix.lower() in {".jpg", ".jpeg"} and resized.mode not in {"RGB", "L"}:
                resized = resized.convert("RGB")
            output_path = output_dir / f"{input_path.stem}_{width}x{height}{final_suffix}"
            resized.save(output_path, quality=95, optimize=True)
            print(f"已生成: {output_path} ({width}x{height})")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="按预设分辨率批量调整图片尺寸。")
    parser.add_argument("--input", default=str(DEFAULT_INPUT), help="输入图片路径，默认 image/test_image.jpg。")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="输出目录。")
    parser.add_argument(
        "--resolution",
        action="append",
        type=parse_resolution,
        help="额外指定分辨率，例如 500x1500。传入后会覆盖脚本内 RESOLUTIONS 列表，可传多次。",
    )
    parser.add_argument("--suffix", default=None, help="输出格式后缀，例如 jpg/png。默认沿用输入图片格式。")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    resolutions = args.resolution or RESOLUTIONS
    save_resized_images(Path(args.input), Path(args.output_dir), resolutions, args.suffix)


if __name__ == "__main__":
    main()
