# kagiboy native shell (iOS + Android)

A [Capacitor 8](https://capacitorjs.com) wrapper around the web app in `../web`.
It bundles `web/dist` into a native app (`xyz.kagiboy.app`, "kagiboy") and boots
straight into the `/app` route (`server.appStartPath: "/app"` in
`capacitor.config.ts`).

**Status:** the shell runs **the same simulated cartridge as the web demo**. It
has no native Bluetooth yet. See [Bluetooth plan](#bluetooth-plan).

## Layout

| path | what |
| --- | --- |
| `capacitor.config.ts` | app id/name, `webDir: ../web/dist`, start path `/app` |
| `ios/` | Xcode project (Swift Package Manager, no CocoaPods) |
| `android/` | Android Studio / Gradle project |
| `assets/` | icon + splash sources (placeholders, from `scripts/make-assets.py`) |
| `scripts/ios-start-path.mjs` | `capacitor:copy:after` hook, see below |

## Build + sync

```sh
cd ~/gb-wallet/native
pnpm install          # first time only
pnpm build            # = pnpm --dir ../web build && cap sync
```

Run `pnpm build` again after **any** web change. The native apps ship a copy of
`web/dist`; they don't hot-reload.

## Run on iOS

Needs Xcode (installed) and nothing else. CocoaPods isn't used.

**Simulator:**
```sh
pnpm build
npx cap run ios       # pick a simulator from the list
```

**Your iPhone:**
1. Plug the iPhone in over USB (or pair it in Xcode). On the phone, enable
   Settings → Privacy & Security → Developer Mode, then reboot.
2. `pnpm build && pnpm ios` opens `ios/App/App.xcodeproj` in Xcode.
3. Select the **App** target → *Signing & Capabilities* → tick *Automatically
   manage signing* and pick your **Team** (a free personal Apple ID works; the
   build then expires after 7 days).
   If `xyz.kagiboy.app` is already taken under that team, change the bundle id here.
4. Pick the iPhone in the device dropdown and press Run (⌘R).
5. The first time, trust the developer on the phone under Settings → General →
   VPN & Device Management.

After the team is set once, `npx cap run ios --target <device-udid>` also works
from the terminal (`npx cap run ios --list` shows the ids).

## Run on Android

Needs Android Studio (which brings a JDK and the Android SDK). Neither is
installed on this Mac yet, so the Android project is scaffolded but has not
been built.

```sh
brew install --cask android-studio   # then open it once to install the SDK
pnpm build
pnpm android                         # opens android/ in Android Studio → Run
# or: npx cap run android            # emulator / USB device with USB debugging on
```

## Routing notes

- The web app uses `BrowserRouter`. Capacitor serves `web/dist` from
  `capacitor://localhost` (iOS) and `https://localhost` (Android). Both fall back
  to `index.html` for any extension-less path, so `/app`, `/demo` and the rest resolve.
- **iOS quirk:** `CAPBridgeViewController` won't load unless a file or folder
  exists at `public/<appStartPath>`. The app crashes with "Unable to load …/public//app"
  otherwise. `scripts/ios-start-path.mjs` runs as the `capacitor:copy:after`
  hook and drops an empty `public/app/` marker into the iOS copy. It runs
  automatically on every `cap sync`/`cap copy`/`cap run`, and `web/` is never touched.
- Root-relative fetches like `/wallet.gb` resolve against the local origin and work.
  `/api/waitlist` (landing page only) would not, but the native shell never
  shows the landing page.

## Icons / splash

These are placeholders: the GB-screen motif and the `kagiboy` wordmark
(PixelOperator8) on the `#cfe2ff → #ffdce8` gradient. To regenerate them:

```sh
python3 scripts/make-assets.py   # writes assets/*.png (needs Pillow)
pnpm assets                      # @capacitor/assets → iOS + Android sizes
```

Swap in final artwork by replacing `assets/icon-only.png` (1024²),
`icon-foreground.png`/`icon-background.png` (Android adaptive icon, 1024²) and
`splash.png`/`splash-dark.png` (2732²), then run `pnpm assets`.

## Bluetooth plan

Today the app talks to an in-browser emulated cartridge, exactly like the web
demo. The real cartridge link will use
[`@capacitor-community/bluetooth-le`](https://github.com/capacitor-community/bluetooth-le):

1. `pnpm add @capacitor-community/bluetooth-le` here **and** in `web/` (the JS
   API is imported by the web code), then `pnpm build`.
2. In `web/`, add a `BleTransport` behind the same interface the simulated
   cartridge uses. Pick it when `Capacitor.isNativePlatform()` is true and keep
   the simulator for the browser and the demo.
3. Flow: `BleClient.initialize()` → `requestDevice({ services: [KAGIBOY_SERVICE_UUID] })`
   → `connect` → `startNotifications` on the cartridge's TX characteristic,
   `write` requests to RX. The cartridge still shows and confirms every
   signature, and keys never leave it.

Permissions are **already declared**, so adding the plugin needs no further
native edits:

- iOS `ios/App/App/Info.plist`: `NSBluetoothAlwaysUsageDescription`
  ("kagiboy uses Bluetooth to connect to your kagiboy cartridge, which holds
  your keys and signs transactions.")
- Android `android/app/src/main/AndroidManifest.xml`: `BLUETOOTH_SCAN`
  (`neverForLocation`) + `BLUETOOTH_CONNECT` for API 31+, legacy
  `BLUETOOTH`/`BLUETOOTH_ADMIN`/`ACCESS_FINE_LOCATION` capped at API 30, and
  `bluetooth_le` declared as an optional feature.
