# Build Android APK with Capacitor

This guide wraps the **notebookcalendar / Inkling** web app (static `index.html`, `src/`, CSS) in a native Android shell using [Capacitor](https://capacitorjs.com/). The WordWeaver Three.js viewport (`src/components/WordWeaverViewport.jsx`, `src/wordweaver/TimelineRenderer.js`) runs inside the WebView like any other part of the UI.

> **Note:** This repo also ships a **Tauri Android** path (`npm run tauri:android:build`). Use Capacitor when you want Android Studio–first workflows and Play Store APK/AAB packaging via Gradle; use Tauri when you prefer the existing Rust-based shell in `src-tauri/`.

## Prerequisites

- Node.js 18+
- npm (or pnpm/yarn)
- [Android Studio](https://developer.android.com/studio) (latest stable)
- Android SDK Platform 34+ and Build-Tools
- JDK 17 (bundled with recent Android Studio)

Set environment variables (Windows example):

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:PATH += ";$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\tools"
```

Verify:

```bash
adb version
```

## 1. Install Capacitor

From the project root (`Inkling/`):

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Inkling" "com.inkling.notebookcalendar" --web-dir dist
```

Adjust `appId` / `appName` to match your package naming.

## 2. Build web assets

Capacitor serves whatever you put in the configured `webDir`. Build a production bundle first:

```bash
npm run build:web
```

If your build script outputs to a folder other than `dist`, update `capacitor.config.ts` (or `capacitor.config.json`):

```json
{
  "appId": "com.inkling.notebookcalendar",
  "appName": "Inkling",
  "webDir": "dist",
  "server": {
    "androidScheme": "https"
  }
}
```

Ensure static copies include:

- `index.html`
- `src/` (ES modules + `src/wordweaver/timeline.json`)
- `fonts/` (Three.js typeface JSON for extruded 3D text)
- CSS and `public/` assets

## 3. Add the Android platform

```bash
npx cap add android
```

This creates `android/` with a Gradle project wired to your `webDir`.

## 4. Copy web assets into the native project

After every web rebuild:

```bash
npm run build:web
npx cap sync android
```

`cap sync` copies the web bundle into `android/app/src/main/assets/public` and updates native plugins.

Optional live reload during development:

```bash
npx cap run android -l --external
```

Point the dev server at your machine IP (e.g. `http://192.168.1.10:3080`) in `capacitor.config` if needed.

## 5. Open Android Studio

```bash
npx cap open android
```

In Android Studio:

1. Wait for Gradle sync to finish.
2. Select a device or emulator (API 34+ recommended).
3. **Build → Make Project** to verify compilation.

### Signing (release APK)

1. **Build → Generate Signed Bundle / APK**
2. Choose **APK** or **Android App Bundle (AAB)** for Play Store.
3. Create or select a keystore; set `keyAlias`, passwords, and validity.
4. Select **release** build variant.

Command-line release APK (after signing config in `android/app/build.gradle`):

```bash
cd android
./gradlew assembleRelease
```

Windows:

```powershell
cd android
.\gradlew.bat assembleRelease
```

Output:

```
android/app/build/outputs/apk/release/app-release.apk
```

Unsigned debug APK (quick device test):

```bash
cd android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## 6. WebView / Three.js tips

- **Hardware acceleration:** enabled by default in Capacitor WebView; keep 3D scenes modest on low-end devices.
- **Fonts:** ship `fonts/helvetiker_regular.typeface.json` so WordWeaver 3D text extrudes offline; canvas fallback works if the font is missing.
- **Resize:** `TimelineRenderer` listens to `window.resize`; the viewport container should use `width/height: 100%` (see `WordWeaverViewport.jsx`).
- **API base URL:** set `INKLING_API_URL` at web build time if the app calls your Node backend (see `docs/DEPLOYMENT.md`).

## 7. Typical workflow summary

```bash
# 1. Web production build
npm run build:web

# 2. Sync into Android
npx cap sync android

# 3. Open IDE and run
npx cap open android
# Run ▶ on device/emulator, or Generate Signed APK
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Blank WebView | Confirm `webDir` matches build output; run `npx cap sync` after `build:web`. |
| 404 on `src/*.js` | Ensure ES module paths are relative and all files were copied to `dist`. |
| Three.js import map | Production build should bundle or mirror the import map from `index.html`. |
| Gradle sync failed | Install SDK 34, accept licenses: `sdkmanager --licenses`. |
| White screen on device | Check `adb logcat` for Chromium/WebView errors. |

## Related docs

- [DEPLOYMENT.md](./DEPLOYMENT.md) — Node server, env vars, Tauri deploy
- [WORLDWEAVER.md](./WORLDWEAVER.md) — WordWeaver / neighborhood architecture
