"""Shared image annotation - boxes + label collision avoidance + segmentation
compositing, all in PIL. Produces the final pixel-accurate PNG that both the
UI and the download button use, so there's no JS drift."""
from __future__ import annotations

from typing import Iterable
import base64
import io

def _font(size: int):
    """Pick a cross-platform monospace font; fall back to PIL's bitmap default."""
    from PIL import ImageFont
    candidates = [
        "DejaVuSansMono.ttf",
        "Consola.ttf", "consola.ttf",
        "Menlo.ttc",
        "Courier New.ttf", "cour.ttf",
        "Arial.ttf", "arial.ttf",
    ]
    for name in candidates:
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            continue
    return ImageFont.load_default()

def _measure(font, text):
    try:
        bbox = font.getbbox(text)
        return bbox[2] - bbox[0], bbox[3] - bbox[1]
    except Exception:
        return len(text) * (font.size if hasattr(font, "size") else 10) * 0.6, 12

def _layout_labels(items: list, W: int, H: int, font):
    """Greedy top-down placement with vertical cascade on collision.
    Returns a list parallel to `items`: each entry is
    {boxX, boxY, boxW, boxH, labelX, labelY, labelW, labelH, text}.
    """
    label_h = max(16, int(font.size * 1.35) if hasattr(font, "size") else 20)

    raw = []
    for idx, it in enumerate(items):
        nx, ny, nw, nh = it.get("box", [0, 0, 0, 0])
        x, y = nx * W, ny * H
        w, h = nw * W, nh * H
        if w <= 0 or h <= 0:
            continue
        text = f"{it.get('label', 'object')} {int(round(it.get('score', 0) * 100))}%"
        tw, _ = _measure(font, text)
        label_w = min(int(tw + 10), W)
        lx = max(0, min(int(x), W - label_w))
        ly = int(y) - label_h - 1
        if ly < 0:
            ly = int(y)
        raw.append({
            "idx": idx,
            "boxX": x, "boxY": y, "boxW": w, "boxH": h,
            "labelX": lx, "labelY": ly, "labelW": label_w, "labelH": label_h,
            "text": text,
        })

    order = sorted(raw, key=lambda c: (c["labelY"], c["labelX"]))
    placed = []

    def overlaps(a, b):
        return (a["labelX"] < b["labelX"] + b["labelW"] and
                a["labelX"] + a["labelW"] > b["labelX"] and
                a["labelY"] < b["labelY"] + b["labelH"] and
                a["labelY"] + a["labelH"] > b["labelY"])

    for c in order:
        for _ in range(32):
            hit = next((p for p in placed if overlaps(c, p)), None)
            if hit is None:
                break
            c["labelY"] = hit["labelY"] + hit["labelH"] + 1
            if c["labelY"] + c["labelH"] > H:
                c["labelY"] = H - c["labelH"]
                break
        placed.append(c)

    return sorted(raw, key=lambda c: c["idx"])

def draw_boxes(img, items, accent=(100, 220, 180)) -> "Image":
    """Return a copy of `img` with boxes + labels drawn. `accent` is RGB."""
    from PIL import ImageDraw
    out = img.copy().convert("RGB")
    W, H = out.size
    draw = ImageDraw.Draw(out)
    stroke = max(2, int(min(W, H) * 0.004))
    font_size = max(12, int(min(W, H) * 0.022))
    font = _font(font_size)
    layout = _layout_labels(items, W, H, font)

    for L in layout:
        x1, y1 = int(L["boxX"]), int(L["boxY"])
        x2, y2 = int(L["boxX"] + L["boxW"]), int(L["boxY"] + L["boxH"])
        draw.rectangle([x1, y1, x2, y2], outline=accent, width=stroke)
        draw.rectangle(
            [L["labelX"], L["labelY"], L["labelX"] + L["labelW"], L["labelY"] + L["labelH"]],
            fill=accent,
        )
        ty = L["labelY"] + max(0, (L["labelH"] - font_size) // 2) - 1
        draw.text((L["labelX"] + 5, ty), L["text"], fill=(5, 19, 26), font=font)

    return out

def composite_masks(img, overlay_rgba) -> "Image":
    """Alpha-blend `overlay_rgba` onto `img` and return an RGB composite."""
    from PIL import Image
    base = img.copy().convert("RGBA")
    if overlay_rgba.size != base.size:
        overlay_rgba = overlay_rgba.resize(base.size, Image.NEAREST)
    base.alpha_composite(overlay_rgba)
    return base.convert("RGB")

def encode_png_data_url(pil_image) -> str:
    buf = io.BytesIO()
    pil_image.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
