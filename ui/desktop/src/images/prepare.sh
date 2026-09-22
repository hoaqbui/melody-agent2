#!/usr/bin/env sh
# Renders every raster from glyph.svg, glyph-update.svg and icon.svg.
# macOS only: qlmanage rasterises the SVGs (ImageMagick is not assumed), iconutil builds the .icns,
# and the .ico is packed by the python at the end.
set -e
cd "$(dirname "$0")"

render() { # render <svg> <size> <out.png>
  qlmanage -t -s "$2" -o . "$1" >/dev/null 2>&1
  mv "$1.png" "$3"
}

# Template icons for the menu bar (and the variant with the update dot)
render glyph.svg 22 iconTemplate.png
render glyph.svg 44 iconTemplate@2x.png
render glyph-update.svg 22 iconTemplateUpdate.png
render glyph-update.svg 44 iconTemplateUpdate@2x.png

# Main application icons from icon.svg
render icon.svg 1024 icon.png
render icon.svg 2048 icon@2x.png
render icon.svg 512 icon-512.png

# macOS icon set (icns)
mkdir -p icon.iconset
for s in 16 32 128 256 512; do
  render icon.svg "$s" "icon.iconset/icon_${s}x${s}.png"
  render icon.svg "$((s * 2))" "icon.iconset/icon_${s}x${s}@2x.png"
done
iconutil -c icns icon.iconset
rm -rf icon.iconset

# Windows icon (ico): PNG-compressed entries, one per size
mkdir -p ico
for s in 16 32 48 64 128 256; do render icon.svg "$s" "ico/$s.png"; done
python3 - <<'PY'
import struct, pathlib
sizes = [16, 32, 48, 64, 128, 256]
pngs = [pathlib.Path(f"ico/{s}.png").read_bytes() for s in sizes]
header = struct.pack("<HHH", 0, 1, len(sizes))
offset = 6 + 16 * len(sizes)
entries, body = b"", b""
for s, png in zip(sizes, pngs):
    entries += struct.pack("<BBBBHHII", s % 256, s % 256, 0, 0, 1, 32, len(png), offset)
    body += png
    offset += len(png)
pathlib.Path("icon.ico").write_bytes(header + entries + body)
PY
rm -rf ico
