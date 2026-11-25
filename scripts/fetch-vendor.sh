#!/usr/bin/env bash
# Downloads the on-device OCR files (Tesseract.js 7.0.0 and English LSTM data) into vendor/.
# They're Apache-2.0 licensed third-party code, so they aren't kept in this repo.
# Run from the repo root:  bash scripts/fetch-vendor.sh
# Needs curl, tar and shasum (macOS) or sha256sum (Linux).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fetch() { # npm package tarball URL, folder name
  echo "Downloading $1"
  mkdir -p "$TMP/$2"
  curl -fsSL "$1" | tar xz -C "$TMP/$2" --strip-components=1
}
fetch https://registry.npmjs.org/tesseract.js/-/tesseract.js-7.0.0.tgz tesseract.js
fetch https://registry.npmjs.org/tesseract.js-core/-/tesseract.js-core-7.0.0.tgz tesseract.js-core
fetch https://registry.npmjs.org/@tesseract.js-data/eng/-/eng-1.0.0.tgz eng

T="$ROOT/vendor/tesseract" L="$ROOT/vendor/lang"
mkdir -p "$T" "$L"
cp "$TMP/tesseract.js/dist/tesseract.min.js" "$TMP/tesseract.js/dist/worker.min.js" "$T/"
cp "$TMP/tesseract.js/LICENSE.md" "$T/LICENSE-tesseract.js.md"
for f in tesseract-core-lstm.wasm.js tesseract-core-simd-lstm.wasm.js tesseract-core-relaxedsimd-lstm.wasm.js; do
  cp "$TMP/tesseract.js-core/$f" "$T/"
done
cp "$TMP/eng/4.0.0_best_int/eng.traineddata.gz" "$L/"

# Check the files are the ones the app was tested with.
if command -v sha256sum >/dev/null; then SHA="sha256sum"; else SHA="shasum -a 256"; fi
cd "$ROOT/vendor"
$SHA -c - <<'SUMS'
000c27d9cd0def655f77b36c72a389c0ab13793aa31cb4d7aab56d09c0afbc7e  tesseract/tesseract.min.js
576b7df7e3393e137e51849357c9adb53fe7ac1bb69bfa06cf3d61520f182c6d  tesseract/worker.min.js
b40930bbcf80744c86c46a12bc9da056641d722716c378f5659b9e555ef833e1  tesseract/LICENSE-tesseract.js.md
eef5f8b2f8e20e150680b20adaec4a60babafee3adbe8a94583c81fee46e8680  tesseract/tesseract-core-lstm.wasm.js
c58b46a4c796c0b8afccf77591d5b875b6896b45d402bbce8caa6f5362447b38  tesseract/tesseract-core-simd-lstm.wasm.js
861a536cf9ef8e63cb644d57bab39c388f37f7d6b6f60024b741c5f6b39a59b3  tesseract/tesseract-core-relaxedsimd-lstm.wasm.js
45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91  lang/eng.traineddata.gz
SUMS
echo "vendor/ is ready."
