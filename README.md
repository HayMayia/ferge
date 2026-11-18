# Smartfarm

**A little insight. A healthier harvest.**

Website URL (after Pages activation below): **[haymayia.github.io/ferge](https://haymayia.github.io/ferge/)**

A responsive farm-monitoring website built for the AI Thinker ESP32-CAM firmware supplied with this project. React, TypeScript, and Vite power the interface; a small Node.js gateway connects it to the camera. No account, database, AI API key, or firmware changes are needed.

## What’s included

- **Farm overview:** camera status, current condition, captured scans today, and green/yellow/brown composition.
- **Camera view:** MJPEG streaming, pause/resume, an expandable frame, JPEG capture, and frame downloads.
- **Leaf screening:** the firmware’s five condition classes and practical care guidance. No invented confidence score or trained-AI claims.
- **Photo screening:** drag in a JPG, PNG, or WebP and analyse it entirely in the browser using the firmware’s HSV thresholds.
- **Scan history:** saved captures and uploads, condition/date/search filters, individual reports, and CSV export.
- **Devices and settings:** validated camera connections, a setup guide, configurable camera/location names, and clear offline states.
- **Field guide:** explanations and care suggestions for healthy leaves, yellowing, possible leaf spot, and possible damage.
- **A clearly labelled demo:** a sample camera photograph and 24 example scans let you explore without hardware.
- **Accessible navigation:** keyboard search with Ctrl/Cmd+K, focus-managed dialogs, mobile navigation, reduced-motion support, and self-hosted fonts.

## Run the website

Use **Node.js 22.12 or newer**.

```bash
npm ci
npm run dev
```

Open **http://localhost:5173**. This starts:

| Service        | Port | Purpose                                               |
| -------------- | ---- | ----------------------------------------------------- |
| Vite website   | 5173 | The browser interface and same-origin `/api` proxy    |
| Camera gateway | 3001 | Connects to the ESP32 on the computer’s local network |

Both services bind to `0.0.0.0`. The interface uses relative API URLs, so browser previews and another phone/computer on the same network can also use the dashboard. Keep the gateway on a trusted network; it is not an authenticated public service.

The default workspace is a **demo**. Sample frames, readings, and history are identified in the interface. Sample history is hidden when you connect a real device.

## Connect your ESP32-CAM

1. Upload your supplied sketch with **AI Thinker ESP32-CAM** selected and **PSRAM enabled**. Use the upload/reset procedure in your sketch’s comments.
2. Leave `USE_AP` set to `false` to join the drone’s **F450-ESP32-DRONE** access point.
3. Connect the computer running this website/gateway to that same access point. The gateway—not just the browser—must be able to reach the camera.
4. In the Arduino Serial Monitor at **115200 baud**, find the camera’s printed IP address. The example address `192.168.4.3` is only a placeholder; use the address your board actually prints.
5. Open **Settings → ESP32-CAM**, enter that IPv4 address, and select **Connect camera**.
6. Open **Live camera**, put a leaf close to the camera in good, even light, and capture a scan.

The gateway uses the exact endpoints from your sketch:

| Firmware endpoint | Port | Website behaviour                                                                           |
| ----------------- | ---- | ------------------------------------------------------------------------------------------- |
| `GET /status`     | 80   | Fetches condition, recommendation, and colour percentages every 3 seconds                   |
| `GET /jpg`        | 80   | Captures/downloads a JPEG; a saved camera scan uses a subsequent firmware status response   |
| `GET /stream`     | 81   | Forwards MJPEG without buffering and stops the upstream request when the viewer disconnects |

The browser calls `/api/camera/status`, `/api/camera/jpg`, and `/api/camera/stream`; it never calls another service at the browser’s own `localhost`. The gateway restricts targets to private IPv4 addresses and fixed firmware ports/endpoints, rejects redirects, bounds response sizes, and times out failed requests. It does not provide general-purpose URL proxying.

### Hosted preview versus a local camera

**A cloud preview or GitHub Pages site cannot directly reach a camera on your home/drone Wi-Fi.** GitHub Pages is static hosting and does not run the Node.js gateway. HTTPS pages also cannot simply embed an insecure private HTTP camera stream reliably.

Use the hosted site for **demo mode, local photo screening, history, and exports**. For real hardware, run this repository on a computer connected to the drone access point. The included gateway serves the camera through the same origin as the website, avoiding mixed-content and cross-origin browser issues.

Do not expose the camera, its credentials, or this unauthenticated gateway directly to the public internet. Remote production access would need an authenticated, TLS-protected network bridge/VPN and appropriate deployment hardening.

## Screening behaviour and limitations

This is **colour-based screening, not a disease diagnosis or trained AI model**. No photos are sent to Gemini or another third-party service.

The browser photo screener follows the supplied firmware’s decision order:

1. Less than **5%** leaf-coloured sampled pixels → no leaf in view.
2. Dark share strictly between **0.5% and 8%**, with green above **25% of leaf pixels** → possible pest/leaf damage.
3. Brown above **12% of leaf pixels** → possible leaf spot.
4. Yellow above **25% of leaf pixels** → yellowing.
5. Otherwise → healthy-looking leaf.

Composition percentages are fractions of **leaf-coloured pixels**, not the entire image, and are not confidence scores. The on-screen corner marks are a fixed framing guide, not AI object localisation.

The ESP32 supplies its own five-frame majority-vote classification. Uploaded photos are single-image screenings with the same thresholds but no temporal vote. Browser canvas pixels are RGB, so the ESP32-specific `RGB_IS_BGR` swap is not applied a second time.

Lighting, backgrounds, shadows, and natural leaf colour can all affect results. Inspect both sides of a leaf and confirm concerns with a local agronomist before treatment.

## Data and privacy

- Preferences and up to **60 manually saved captures/uploads** are stored in this browser’s local storage.
- A small compressed thumbnail is retained rather than the original full-resolution upload. Downloads from a saved result contain this retained image.
- Live status polling does **not** continuously fill scan history.
- The 24 demo examples are generated locally, separate from saved scans.
- History is not synchronised between devices, and there is no cloud account or backend database.
- **Settings → Data & privacy → Clear saved scans** removes local saved scans. Browser storage can also be cleared manually.
- If storage is disabled or full, the app continues in memory; when possible it saves metadata without thumbnails.
- CSV exports escape quoted text and neutralise spreadsheet formulas.
- The demonstration greenhouse image is an AI-generated illustration, not a live hardware capture.

## Checks and production build

```bash
npm run check   # strict TypeScript check and 55 unit/integration tests
npm run build   # optimised static website in dist/
npm start       # production website + camera gateway on port 3001
```

Set `PORT` if you need another production port. Production builds should use the default base path `/` when served by the bundled gateway.

Tests cover HSV classes and threshold boundaries, pest priority, telemetry validation, sample data, CSV safety, target validation, status/JPEG/MJPEG forwarding, response bounds, and offline errors. The interface was also browser-tested at mobile, tablet, and desktop widths, including a simulated camera. Physical ESP32 testing still requires your hardware and network.

Production dependencies pass `npm audit --omit=dev`. At implementation time, `npm audit` reports an upstream development-only `picomatch` regular-expression denial-of-service advisory inherited by Vite/Vitest; no patched `picomatch` release was available in the registry. Build/test globs are trusted project configuration, not user input. Recheck the advisory and update development dependencies when a patch is released.

## GitHub Pages publishing

**Website URL after activation:** [https://haymayia.github.io/ferge/](https://haymayia.github.io/ferge/)

This uses the same publishing method as [HayMayia/Data](https://haymayia.github.io/Data/): **GitHub Pages → Deploy from a branch → `/docs`**. The source branch for this site is `arena/c581980e-ferge`. No temporary preview server is needed for the public website.

### One-time owner setting

The website files are pushed and ready, but the connected GitHub integration was denied permission to create the Pages site (`403 Resource not accessible by integration`). A repository owner can activate hosting without changing any code:

1. Open [this repository’s Pages settings](https://github.com/HayMayia/ferge/settings/pages).
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. Choose branch **`arena/c581980e-ferge`** and folder **`/docs`**, then click **Save**.
4. Wait for GitHub’s first Pages deployment to succeed. The website URL above will then become available.

Alternatively, reconnect GitHub in Arena with the repository permissions needed to manage Pages, then retry activation. No passwords or access tokens should be shared in chat.

The committed `docs/` directory is an optimised static build of the existing interface, with the `/ferge/` asset base path and a `.nojekyll` file. Publishing does not change the UI. The build is deliberately tracked because branch-based GitHub Pages serves the committed files directly.

To update the website after editing the source:

```bash
npm ci
npm run check
npm run build:pages
```

Commit the source changes and rebuilt `docs/` together, then push the same publishing branch. GitHub Pages automatically redeploys the `/docs` folder. Keep that branch available while it is selected as the Pages source; deleting it stops future publishing. To change the source later, update **Settings → Pages** explicitly.

The **Check Smartfarm** workflow runs formatting checks, type checking, tests, a production build, and a production-dependency audit on pushes and pull requests. Pages publishing uses GitHub’s built-in branch deployment after the one-time owner setting above; no custom deployment workflow is required.

For another static host, deploy `dist/`. `npm run build` and `npm start` still build and serve the normal root-path website plus its local camera gateway. `npm run build:pages` is a separate static-only build for GitHub Pages.

Hash-based navigation keeps all pages refresh-safe on static hosts. The public site supports demo mode, browser-local photo screening, history, and exports. Real-camera mode still requires the local gateway described above; GitHub Pages cannot run the Node.js server or reach your private Wi-Fi camera.

## Project structure

```text
src/
  App.tsx                    Workspace, navigation, and page routing
  components/                Dashboard, device/history/guide pages, and dialogs
  context/FarmContext.tsx    Device polling, capture flows, and local persistence
  lib/screening.ts           Firmware-compatible colour analysis and CSV helpers
  lib/screening.test.ts      Screening and data tests
  fonts.css                  Self-hosted variable fonts
  styles.css                 Responsive interface
server/
  app.mjs                    Same-origin status, JPEG, and MJPEG gateway
  camera.mjs                 Restricted camera-target validation
  camera.test.mjs            Gateway integration and validation tests
  index.mjs                  Gateway/production server entry point
public/
  images/leaf-camera.webp    Clearly labelled demonstration image
docs/
  index.html                 Published GitHub Pages build (generated; do not edit directly)
  assets/                    Compiled JavaScript, CSS, and self-hosted fonts
.github/workflows/
  ci.yml                     Checks for pushes and pull requests
```

Third-party font, icon, and React notices are included in `public/licenses/`. Use `npm run format` to format the source, or `npm run format:check` to verify formatting.
