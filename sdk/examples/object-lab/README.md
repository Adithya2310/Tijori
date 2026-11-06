# Object lab (calibration tool)

A developer tool for calibrating Tijori's object matching (scanner v2) on real photos.

```sh
cd sdk
npm install && npm run build
npm run dev -w examples/object-lab     # prepares model assets, then http://127.0.0.1:3300
```

1. Enter a label for one exact object (e.g. `blue-bottle`) and its kind (e.g. `bottle`).
2. Take about 4 photos of it from different sides, holding it in the circle. Repeat for 4–6 objects, including two of the same kind (for example two different bottles).
3. Each photo shows what the scanner isolated, and its score against every object so far. Green means the same object would log in. Red means a different object would.
4. Click **Download calibration set**. It contains compact descriptors only, never photos.
5. Run `npm run calibrate -- ~/Downloads/tijori-object-calibration-*.json` in `sdk/` to get the recommended `OBJECT_MATCH_CLS_WEIGHT` and `OBJECT_MATCH_THRESHOLD` for `packages/core/src/object-match.ts`.
