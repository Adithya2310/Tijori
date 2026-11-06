# Object feature matching

License notice for adapted object feature matching code in `lib/dino.ts`.

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
(Apache License 2.0; see `scripts/licenses/dinov2.txt`). The ONNX Runtime Web
WASM/runtime files are copied from the installed npm package (MIT; see
`scripts/licenses/onnxruntime.txt`). Preparation serves these license notices
alongside the downloaded model and runtime. Model files are not committed.

SlimSAM ONNX weights: Xenova/slimsam-77-uniform (Apache-2.0), derived from nielsr/slimsam-77-uniform. The browser uses a user-selected foreground point; GroundingDINO is not included.

# Category screening model

The pinned `Xenova/mobilevit-xx-small` ONNX export derives from `apple/mobilevit-xx-small`. Its model card identifies the Apple Sample Code License; the notice is retained in `scripts/licenses/mobilevit.txt` and served beside the model. Only the checksum-verified fp32 export is used.
