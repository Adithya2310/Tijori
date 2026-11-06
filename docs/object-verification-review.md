# Object verification review — 2026-11-06

This is a functional review build on `object-verification-improvement`, based on main `8caf573`. Changes remain uncommitted. It is ready for local camera evaluation after the checks below; it is not a completed physical-instance accuracy or security validation.

## Confirmed causes and changes

- `lib/object-isolation.ts:29`: the image processor converts its `RawImage` input to RGB in place. The previous crop code then read that buffer with an RGBA stride. This can corrupt colours and generated features. A real-model public-photo check exposed non-finite quality measurements. The processor now receives a clone, and the source buffer layout is checked before reading pixels.
- `lib/object-image.ts:9`: the earlier crop was stretched to 224×224, discarding aspect proportions. The version-2 pipeline pads to a square and uses deterministic sampling. Crop mapping, foreground occupancy and quality metadata remain linked to the scan.
- `lib/dino.ts:50`: one-way best-patch reuse and a top-35% score can overstate evidence. Global and full two-way coverage gates remain necessary, and `lib/object-detail.ts` adds foreground-only, mean-centered local evidence and one-to-one geometric correspondences. The historical score is diagnostic, never sufficient alone.
- `lib/object-detail.ts:52`: fitting geometry after choosing an arbitrary unweighted matching caused a valid exposure-variant smoke test to fail. The verifier now searches coherent translations among all eligible pairs; each fixed translation is inherently one-to-one. The limits were not lowered to make the positive pass. This is an aligned-grid overlap check, not a claim of general 3D pose estimation.
- `lib/object-verification.ts`: all gates must pass against one enrolled view. Scores from different views are not mixed to manufacture a pass. Unknown/poor evidence requests RETRY; a clearly inconsistent category or global reference is rejected. Exact enrollment-image reuse is refused. There is no liveness guarantee.
- `lib/object-username.ts`, `lib/api/domain.ts:43`, `lib/vault.ts:39`: username lookup is exact after trim/NFC/case normalization. New duplicate names and ambiguous older names fail. The frontend checks the fresh object before making the login request; the API separately checks the username/address binding.

The newly introduced category model's q8 export failed a public-photo sanity test. Its pinned fp32 export produced meaningful predictions and is the one used. This issue was found during integration; it is not presented as the cause of the original application's false acceptance.

## New enrollment and persistence

New accounts capture four guided views of one distinctive bottle, pen or watch. A pinned category model screens unknown/conflicting categories. Mask confidence/area, selected-object size, lighting, contrast, sharpness and foreground evidence are checked. Original photos and full masks remain on-device and are released as each capture is replaced.

A version-2 profile stores separate per-view compact descriptors, model/revision and preprocessing identifiers, category/precision metadata, image hashes, crop mapping, quality measurements and pooled foreground occupancy. Exact fields, dimensions and nonempty encoded vectors are validated; hidden photo/key fields are not accepted in the profile schema. The additive v6→v7 aggregate migration retains every existing record, original envelope and reference. It does not upgrade a one-view account into four views or regenerate a key.

One representative four-view public-photo profile was 71,341 JSON bytes. The total aggregate cap remains 100,000 bytes. Capacity is exposed before signup; the API's streaming signup limit now permits a four-view request while the existing aggregate cap still rejects overflow. Nothing is deleted to make room. This limits how many identities fit in the prototype.

Older one-view records remain on their compatibility path, with a visible warning; they lack the new multi-view/category evidence and may reject after the pixel correction or stricter policy. Use a fresh synthetic username to exercise the entire new enrollment path. Re-enrolling existing funded identities or claiming that old references are now secure is outside this review build.

## Measured checks

The synthetic matrix below isolates a shared-global-signal impostor: both synthetic identities have identical global vectors but different local details. It is **not camera data**. The historical decision rule is evaluated on the same newly prepared descriptors, so this is a rule ablation rather than a reconstructed historical image benchmark.

| Reference | Query | Global | Historical combined score | Historical 0.50 rule | Current decision | Detail coverage |
|---|---|---:|---:|---|---|---:|
| Synthetic A | A | 1.000 | 1.000 | Accept | MATCH | 1.000 |
| Synthetic A | B | 1.000 | 0.951 | Accept | RETRY | 0.000 |
| Synthetic B | A | 1.000 | 0.951 | Accept | RETRY | 0.000 |
| Synthetic B | B | 1.000 | 1.000 | Accept | MATCH | 1.000 |

No wrong-instance synthetic pair was accepted. Two negative trials, sharing the same two synthetic identities, cannot establish a low false-accept rate. The evaluator marks a 1% FAR proposal unusable at this sample count and never installs it automatically. The generated synthetic matrix and histogram are in Git-ignored `data/object-evaluation/synthetic/`.

Real-model smoke checks used public photos only:

- A labelled plastic bottle was detected as bottle, with native-model category score about 0.829 and finite quality measurements. Five exposure variants were processed. Four were used as reference views solely for this smoke test; a fifth was MATCH, global similarity 0.962, detail coverage 1.000 and geometric inlier ratio 1.000. These are image augmentations, not distinct physical camera angles or held-out identities.
- A separate plain green bottle returned RETRY because its category was uncertain; its global similarity to the labelled bottle was 0.333. This demonstrates fail-closed uncertainty, not reliable instance recognition of all bottles.
- Browser-page WASM completed segmentation, category screening and DINOv2 on the plain public bottle: 384-dimensional CLS, 256 patches, CLS norm approximately 1, finite quality, about 8.4 seconds on first run in this laptop's Chrome. The SDK probes optional tokenizer metadata for the image model; that optional probe can return 404 without preventing inference.
- Real phone Safari/iOS and WebGPU have not been validated. Browser worker WASM also completed with 384 CLS dimensions, 256 patches and norm 1 in about 8.3 seconds. A centre tap selected a partial label with ambiguous category and correctly requested retry; a second tap on the upper bottle selected the full object with bottle score about 0.796, mask score about 0.890 and finite quality. This illustrates tap sensitivity and why RETRY must remain distinct from success. CPU and browser resampling/runtime results can differ; do not treat these timings or scores as device-wide guarantees.

Photo sources for reproducibility (temporary smoke inputs, not committed dataset fixtures): [labelled bottle by Dammy Kaka, CC BY-SA 4.0](https://commons.wikimedia.org/wiki/File:A_plastic_bottle_water.jpg); [plain bottle](https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=600); [public model documentation cats fixture](https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/cats.jpg) for the classifier precision sanity check. No user photo or private key was uploaded.

## Evaluation and regression coverage

The browser review page collects compact manifests with physical instance, category, view, device, session and dataset split labels. The CLI validates immutable model/preprocessing compatibility, image uniqueness and identity-disjoint splits, then emits all-pairs results and metrics by category, angle, device, instance and split. It distinguishes retries, same-category hard negatives and cross-category negatives. It produces score distributions and conditional confidence intervals, explicitly warning about correlated attempts.

Calibration uses only the calibration split, proposes a tightening of the test policy and requires an explicit target FAR. It rejects trivial all-reject solutions as usable settings, screens inadequate negative sample counts and never changes the runtime policy. `--require-heldout` refuses a CI dataset without held-out positive/negative attempts. An accepted held-out wrong-instance attempt causes a nonzero exit code. No real held-out dataset was supplied, so a measured physical-instance FAR/FRR operating point and ROC/DET study remain outstanding.

Regression coverage includes finite/zero/incompatible features, the reported 0.60 failure, high-global wrong-detail matches, one-to-one matching, incoherent rearrangements, repeated texture with coherent geometry, absent/unknown/poor scans, category mismatches, exact enrollment-image reuse, four-view schema validation, username uniqueness/binding, additive migration and original key readability. An isolated production-server test creates a four-view username, confirms that wrong objects make zero login requests, checks encrypted storage/reference readback and repeats login after restart. Existing Arkiv RPC fixture and local acoustic API integration suites remain relevant regression checks; they do not spend testnet funds.

## Storage status and security limits

The adapter already persists usernames and linked object descriptors inside the encrypted Arkiv aggregate in Arkiv mode. The active phone test server is explicitly local and does not upload those records to Arkiv. Its UI reports the actual mode.

The current live read-only Arkiv check failed with `Arkiv state differs from the verified journal.` Live signup/login must not be described as verified until the separate journal/state mismatch is reconciled. No journal, encryption key, budget or existing Arkiv state was reset, overwritten or migrated by a paid write during this work. Do not bypass this check or automatically fall back to local mode.

Object-only demo access was explicitly requested instead of an independent unlock factor. The random EVM private key remains browser-encrypted; no plaintext private key or user passphrase goes to the API. However, the accessible feature reference also contains the wrapping material, so a data/file holder can bypass the photo check and unwrap the demo identity. The unauthenticated API is not a trusted visual authorization boundary. Recognition tuning cannot fix that security model. No secure recovery, hardware-passkey protection, robust rate limit, replay/liveness defence or any-angle accuracy guarantee is claimed.

## Handoff checks and test instance

`npm run build`, `npm run lint`, all 69 tests and the Arkiv RPC/API and local acoustic integration suites pass. The new production-server object test verifies four-view encrypted persistence, exact username binding, no login request for wrong object evidence, and successful readback/login after restart. The optional evaluation CLI produced its synthetic matrix and histogram successfully; this does not replace a real held-out study.

The existing local store on port 3444 has 56,888 of 100,000 bytes used, so a new four-view profile cannot fit. A separate empty local review instance runs at `https://localhost:3445` (phone: `https://10.71.58.1:3445` on the same LAN). Its temporary private storage directory is recorded in `/tmp/tichori-object-review-path`; it is not the original local database and is not Arkiv. The process explicitly disables Arkiv signing and treasury relaying. Existing servers and records were retained. The independent Next build directory is `.next-object-review/`, which is Git-ignored.

To test: create a fresh synthetic username with four clear views, then enter that username again and show the original object. Next show a pen, another bottle, a blank scene and a consenting person-in-frame negative. None of the wrong-object cases should reach login; REJECT and RETRY both stop it. Use the diagnostics page to record failures, including legitimate objects requesting retries. Physical phone hardware and held-out real-instance accuracy remain unverified. No commits were made.
