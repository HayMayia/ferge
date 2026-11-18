# Smartfarm

**A little insight. A healthier harvest.**

**Live website: [haymayia.github.io/ferge](https://haymayia.github.io/ferge/)**

A responsive farm-monitoring website for the supplied AI Thinker ESP32-CAM firmware. React, TypeScript, and Vite power the interface; a Node.js gateway connects it to a real camera. No account, database, AI API key, or firmware changes are needed.

## What works

- **Real-first dashboard:** a new workspace starts offline with zero scans and no health result. No camera address or healthy reading is invented.
- **Photo screening on the published site:** choose a JPG, PNG, or WebP and analyse its actual pixels entirely in your browser. The dashboard, photo preview, history, and reports update with the result.
- **Live camera:** real `/status` polling, authenticated MJPEG streaming, pause/resume, an expandable frame, JPEG capture, and frame downloads through the gateway.
- **Exact-frame captures:** saved camera scans screen the JPEG that was actually captured. They do not borrow an unrelated background firmware classification.
- **History and reports:** real captured/uploaded scans, condition/date/search filters, individual reports, image downloads, and CSV export.
- **Connection settings:** validated private camera addresses, an optional HTTPS gateway URL and session access key, cancellation, disconnect, useful errors, and offline/reconnection handling.
- **Field guide:** explanations and care guidance for the firmware's condition classes, without invented confidence scores or trained-AI claims.
- **Optional examples only:** the sample photograph and 24 sample scans appear only after explicitly choosing a demo workspace. They are labelled, excluded from real mode, and never represented as live hardware. Screening a real upload exits demo mode.
- **Existing responsive design:** keyboard search with Ctrl/Cmd+K, focus-managed dialogs, mobile navigation, reduced-motion support, and self-hosted fonts.

Previously automatically enabled demo preferences are migrated to real/offline mode. Existing real captures and uploaded-photo results are preserved.

## Try real screening now

1. Open [the published website](https://haymayia.github.io/ferge/).
2. Select **New scan → Upload a photo**.
3. Choose one well-lit leaf photo and select **Screen this leaf**.
4. View its actual green/yellow/brown composition, then **Export scan** if you want a CSV.
5. Close the result to see the saved photo and reading on the overview. The camera correctly remains **Offline** until hardware is connected.

The image is analysed locally; it is not sent to a third-party AI service. This is **colour screening, not a trained disease/pest detector or a diagnosis**.

## Run the website and gateway locally

Use **Node.js 22.12 or newer**. The source and publishing branch is `arena/c581980e-ferge`:

```bash
git clone --branch arena/c581980e-ferge https://github.com/HayMayia/ferge.git
cd ferge
npm ci
npm run dev
```

If the repository is already checked out on that branch, start with `npm ci`.

Open **http://localhost:5173** on that computer, or `http://<that-computer's-LAN-IP>:5173` from another device on the same network. This starts:

| Service        | Port | Purpose                                               |
| -------------- | ---- | ----------------------------------------------------- |
| Vite website   | 5173 | Browser interface and same-origin `/api` proxy        |
| Camera gateway | 3001 | Connects to the ESP32 on the computer’s local network |

Both services bind to `0.0.0.0`. Browser requests use the website's origin, not another computer's `localhost`. With no access key configured, use this only on a **trusted local network**, never as an unauthenticated internet service.

For a production local build:

```bash
npm run build
npm start
```

This serves both the website and gateway on port **3001**. The production start command also works on Windows; it does not rely on Unix environment-variable syntax. Optional `.env` settings are loaded by the server. Restart it after changing those settings.

## Connect your ESP32-CAM

1. Upload your supplied sketch with **AI Thinker ESP32-CAM** selected and **PSRAM enabled**. Follow the sketch's upload/reset procedure.
2. Leave `USE_AP` set to `false` to join **F450-ESP32-DRONE**.
3. Connect the **computer running the gateway** to that same access point. The gateway—not just the browser—must be able to reach the camera. If the access point has no internet, install/build the website before joining it; the local dashboard does not need internet once started.
4. Open the Arduino Serial Monitor at **115200 baud** after resetting the camera. Use the IP printed by your board. `192.168.4.3` in the form is a placeholder, not an assigned address.
5. In the locally served website, open **Settings → ESP32-CAM**, enter that IPv4 address, leave **HTTPS gateway URL** blank, and select **Connect camera**. If you configured a gateway access key, enter that key too.
6. Status is verified before the workspace changes to online. Open **Live camera**, put a leaf in good light, and capture a scan.

### Use the GitHub Pages website with a real camera

**GitHub Pages is static hosting. It cannot run Node.js or directly contact your private HTTP ESP32.** An HTTPS gateway on the camera network is necessary for live hardware from the public website. Uploaded-photo screening, history, and exports work without it.

The included gateway supports authenticated remote browser access:

1. On the camera-network computer, copy `.env.example` to `.env`.
2. Generate a unique random key **locally**:

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

3. Edit `.env` on that computer:
   - Set `GATEWAY_TOKEN` to the generated key. Use 32–256 bearer-safe characters, without spaces.
   - Set `ALLOWED_ORIGINS=https://haymayia.github.io`. This is the **origin only**, not the `/ferge/` page path. Multiple exact origins may be comma-separated; wildcards are rejected.
   - Set `PORT` if needed; the default is `3001`.
4. Run `npm run build` and `npm start`. Put the gateway behind a **trusted HTTPS reverse proxy, authenticated network tunnel, or private VPN with HTTPS** that can reach this computer. Preserve the `Authorization` header and streaming responses, disable proxy buffering, and allow long-lived video connections. Do not forward the raw ESP32 ports to the internet.
5. Verify that `https://<your-gateway>/api/health` returns `service: "smartfarm-camera-gateway"` and `authRequired: true`. This verifies the **gateway**, not a camera connection.
6. On [the published dashboard](https://haymayia.github.io/ferge/), open **Settings → ESP32-CAM** and enter:
   - **Camera IP address:** the private IP from the ESP32 Serial Monitor.
   - **HTTPS gateway URL:** your reachable, trusted HTTPS origin, without `/api`, a path, or a query.
   - **Gateway access key:** your generated key.
7. Select **Connect camera**. A successful, validated `/status` response is required. The stream and JPEG requests use the same authenticated gateway.

A reachable HTTPS endpoint, certificate, and network/tunnel setup must be provided on your farm network; this repository does **not** silently provision one or claim that a camera is connected. Some browsers also ask permission to access local-network devices. Allow it only for your trusted gateway. Never disable browser security or TLS certificate checks to make production access work.

The access key is sent in an **Authorization header**, never a URL or a CSV. It is scoped to the selected gateway in this tab's session storage, not permanent preferences. Changing the gateway URL clears the form's old key. **Use photos only · disconnect camera** removes the current key and disconnects without deleting scan history. `.env` is ignored by Git; never put real keys in the public source or in chat.

### Firmware endpoints

| Firmware endpoint | Port | Website behaviour                                                                                                  |
| ----------------- | ---- | ------------------------------------------------------------------------------------------------------------------ |
| `GET /status`     | 80   | Polls the real firmware classification, recommendation, and colour percentages every 3 seconds                     |
| `GET /jpg`        | 80   | Captures/downloads an actual JPEG; saved scans analyse that exact image with the firmware's HSV thresholds         |
| `GET /stream`     | 81   | Forwards MJPEG without buffering; the browser decodes length-delimited JPEG parts and aborts when paused or closed |

Browser endpoints are `/api/camera/status`, `/api/camera/jpg`, and `/api/camera/stream`, either on the website's local origin or the configured HTTPS gateway. The gateway restricts camera targets to private IPv4 addresses and fixed firmware ports/endpoints, rejects redirects, bounds status/JPEG response sizes, times out stalled requests, and cancels disconnected streams. It is not a general-purpose URL proxy.

Remote access requires an access key and an exact allowed origin. These are safeguards, not a substitute for a hardened network deployment. Keep the camera and gateway updated and private.

## Screening behaviour and limitations

This is **colour-based screening, not disease diagnosis or a trained AI model**. The browser screener follows the supplied firmware's decision order:

1. Less than **5%** leaf-coloured sampled pixels → no leaf in view.
2. Dark share strictly between **0.5% and 8%**, with green above **25% of leaf pixels** → possible pest/leaf damage.
3. Brown above **12% of leaf pixels** → possible leaf spot.
4. Yellow above **25% of leaf pixels** → yellowing.
5. Otherwise → healthy-looking leaf.

Composition percentages are fractions of **leaf-coloured pixels**, not the entire image, and are not confidence scores. The corner marks are a fixed framing guide, not object localisation. Transparent photo areas are treated as background, not black damage specks.

**Live readings** use the ESP32's own five-result majority-vote classification. **Saved camera captures and uploaded photos** are single-image screenings of the exact image, with the same HSV thresholds but no temporal vote. They can differ from the live reading. Reports include the screening method. Legacy camera scans are identified as unsynchronised firmware readings rather than silently relabelled as exact-frame results.

Browser images are analysed at up to 640 pixels on their longest side, and thumbnails are at most 320 pixels. Canvas provides RGB, so the firmware-specific `RGB_IS_BGR` swap is not applied a second time. Lighting, backgrounds, shadows, resizing, JPEG compression, and natural leaf colour affect results. Confirm any concern by eye and speak with a local agronomist before treatment.

## Data and privacy

- Preferences and up to **60 manually saved captures/uploads** are stored in this browser's local storage.
- Small compressed thumbnails, not original full-resolution uploads, are retained. Saved-result downloads contain the retained image.
- Live polling does **not** continuously fill history. There is no cloud account, cloud history database, or device-to-device synchronisation.
- Explicit demo examples are generated separately, labelled, and hidden in real mode. The demonstration image is AI-generated, not a live hardware capture.
- **Settings → Data & privacy → Clear saved scans** removes local captures/uploads. It does not remove the optional example set.
- If storage is disabled/full, the app continues in memory and warns you to export. Where possible it saves metadata without photos.
- Corrupt history entries are skipped without discarding valid scans. CSV exports quote text and neutralise spreadsheet formulas.

## Tests and verification

```bash
npm run format:check
npm run check          # strict TypeScript and unit/integration tests
npm run build
npm audit --omit=dev

# Install a browser once, then run the functional suite:
npx playwright install chromium
npm run test:browser
```

On Linux, `npx playwright install --with-deps chromium` also installs required system libraries. Browser gateway tests require **OpenSSL** and a non-loopback network interface to create a temporary TLS fixture. Certificate/key files are generated in a temporary directory and removed; only that fixture's browser tests accept its self-signed certificate. The application has no TLS bypass. For a separately running build, set `SMARTFARM_E2E_BASE_URL` to its URL. The private gateway tests are omitted when testing an external HTTPS static deployment.

The browser suite verifies fresh/legacy state, actual green/yellow/brown/dark/transparent pixels, invalid/oversized images, duplicate-click protection, dashboard updates, persistence, storage-disabled exports, navigation, and responsive layout. A real HTTPS test gateway also exercises bearer authentication, CORS, MJPEG decoding, pause/resume and cleanup, exact-frame capture, independent stream failures, camera offline/recovery, cancellation, and disconnect. Only the upstream ESP32 responses are simulated in these tests.

**Software tests are not physical hardware verification.** A real board/network check must still confirm the printed IP, `/status`, `/jpg`, `:81/stream`, continuous operation, captures, and disconnect/reconnect behaviour. No physical ESP32 is attached to this development environment, so that check has not been claimed as completed. Colour-screening accuracy is not medically/agronomically validated.

Production dependencies pass `npm audit --omit=dev`. At implementation time, the full development audit reports an upstream `picomatch` regular-expression denial-of-service advisory inherited by Vite/Vitest; no patched release was available in the registry. Build/test globs are trusted project configuration, not user input. Recheck the advisory when upgrading development tools.

## GitHub Pages publishing

**Published and activated:** [https://haymayia.github.io/ferge/](https://haymayia.github.io/ferge/)

The repository uses the same publishing method as [HayMayia/Data](https://haymayia.github.io/Data/): **Settings → Pages → Deploy from a branch → `arena/c581980e-ferge` → `/docs`**. The owner activation has already been completed; no temporary sandbox preview is needed for the website.

`docs/` is the committed static build with a `/ferge/` asset base and `.nojekyll`. Do not edit generated files directly. To publish updates:

```bash
npm ci
npm run format:check
npm run check
npm run build:pages
```

Commit source changes and the rebuilt `docs/` together, then push the same publishing branch. GitHub Pages automatically redeploys `/docs`. Keep that branch available while it is the Pages source. No custom deployment workflow is required.

The **Check Smartfarm** workflow runs formatting, type checks, unit/integration tests, a production build, browser functional tests, and the production-dependency audit. Hash navigation keeps all five pages refresh-safe on static hosting.

For another static host, deploy `dist/` from `npm run build`. The bundled Node production server expects that root-path build. `npm run build:pages` is a separate static-only build; publishing it does not deploy the gateway.

## Project structure

```text
src/
  App.tsx                    Workspace, navigation, and hash routing
  components/                Dashboard, pages, dialogs, and camera decoding UI
  context/FarmContext.tsx    Polling, exact-frame captures, and local persistence
  lib/screening.ts           HSV screening, history validation, and CSV helpers
  lib/transport.ts           Authenticated, bounded camera requests
  lib/mjpeg.ts               Incremental Content-Length MJPEG decoder
  lib/*.test.ts              Unit and regression tests
  styles.css                 Existing responsive interface
server/
  app.mjs                    Local/authenticated cross-origin camera gateway
  camera.mjs                 Restricted camera-target validation
  camera.test.mjs            Gateway/security integration tests
  index.mjs                  Environment loading and server entry point
tests/browser/               Functional browser tests and simulated ESP32 fixture
.env.example                 Non-secret local/remote gateway configuration
public/images/               Clearly labelled demonstration image
docs/                        Generated GitHub Pages build
.github/workflows/ci.yml     Automated quality checks
```

Third-party font, icon, and React notices are in `public/licenses/`. Use `npm run format` to format source changes.
