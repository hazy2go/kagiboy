import type { CapacitorConfig } from "@capacitor/cli";

// kagiboy native shell. The web app (../web) is a BrowserRouter SPA; Capacitor
// serves web/dist from capacitor://localhost (iOS) / https://localhost (Android)
// and falls back to index.html for unknown paths, so appStartPath boots straight
// into the /demo route instead of the landing page.
const config: CapacitorConfig = {
  appId: "xyz.kagiboy.app",
  appName: "kagiboy",
  webDir: "../web/dist",
  server: {
    // defaults, set explicitly: real path-based routing needs http(s) on Android
    androidScheme: "https",
    iosScheme: "capacitor",
    appStartPath: "/demo", // Capacitor >= 7.3
  },
  ios: {
    contentInset: "never",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
