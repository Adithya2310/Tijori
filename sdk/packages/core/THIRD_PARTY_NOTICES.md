# VILA

The browser DINOv2 matching algorithm in `packages/core/src/dino.ts` adapts `encode_full`,
`cross_attention_sim` and the combined score from
https://github.com/marcociama/VILA (`eval.py`, `ui/backend/server.py`).
GroundingDINO, SAM and attention visualization are not included.

MIT License

Copyright (c) 2026 Marco Ciamarra

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

# Locally served inference assets

The unmodified pinned `Xenova/dinov2-small` ONNX model derives from Meta's DINOv2
(Apache License 2.0; see `packages/client/licenses/dinov2.txt`). The ONNX Runtime Web
WASM/runtime files are copied from the installed npm package (MIT; see
`packages/client/licenses/onnxruntime.txt`). Preparation serves these license notices
alongside the downloaded model and runtime. Model files are not committed.

SlimSAM ONNX weights: Xenova/slimsam-77-uniform (Apache-2.0), derived from nielsr/slimsam-77-uniform. The browser uses a user-selected foreground point; GroundingDINO is not included.

# ggwave

`packages/client/src/vendor/ggwave.js` is the ggwave 0.4.0 npm build
(https://github.com/ggerganov/ggwave), converted to an ES module by
`packages/client/scripts/vendor-ggwave.mjs`. The script checks the upstream file's
SHA-256, removes the Node-only `fs`/`path` loader and replaces the UMD footer with
an ES export. The audio protocol and embedded WASM are unchanged.

MIT License

Copyright (c) 2020 Georgi Gerganov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
