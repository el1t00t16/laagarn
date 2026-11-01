# LAAGARN — My Way, Your Travel Buddy.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![React 19](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![PWA Ready](https://img.shields.io/badge/PWA-Installable-purple.svg)](https://web.dev/progressive-web-apps/)
[![Offline First](https://img.shields.io/badge/Offline-100%25%20Functional-brightgreen.svg)](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)

**LAAGARN** (*My Way, Your Travel Buddy.*) is an offline-first, mobile-optimized real-time GPS navigation and cartography application for the Philippine Archipelago.

---

## 🌟 Key Highlights

### 1. 🛰️ Real-Time GPS (Works Even When Internet Drops)
- **High-Frequency GPS Watcher**: Continuous on-device satellite tracking via `navigator.geolocation.watchPosition` with speed (km/h) and precision accuracy (± meters).
- **Physical Device Compass**: Integrates device magnetometer orientation (`DeviceOrientationEvent` / `webkitCompassHeading`) so your navigation chevron rotates with your vehicle or body even when stationary.
- **Offline Direct-Bearing Navigation**: If the network goes down mid-journey, turn guidance, remaining distance, ETA, and live vehicle tracking continue on-device without stalling.
- **Screen Wake Lock**: Automatically prevents mobile screens from dimming or locking during active navigation via the Screen Wake Lock API.
- **Spoken Voice Guidance**: On-device Text-to-Speech (TTS) turn-by-turn spoken announcements ("In 300 meters, turn right onto EDSA") with audio mute controls.

### 2. 📱 Mobile First & Installable PWA
- **Installable PWA**: Add to Home Screen on iOS Safari and Android Chrome with full standalone display mode, custom theme color, and offline app shell caching.
- **Responsive Mobile Bottom Sheet**: Interactive 3-stage drawer (`peek`, `half`, `full`) optimized for one-handed thumb interaction while driving or traveling.
- **Large Touch Targets**: 48px+ thumb-friendly action buttons for zooming, centering on GPS, switching layers, and ending navigation.

### 3. 🗺️ Offline Cartography Archive
- **Binary IndexedDB Storage**: Actual map tiles are archived as binary Blobs into IndexedDB (not synthetic placeholders or data URLs) with automatic object URL memory cleanup.
- **Pre-Packaged Regional Folios**: Download offline packs for:
  - Metro Manila & Greater NCR (Zoom 10–15 street-level)
  - CALABARZON, Tagaytay Ridge & Batangas Port
  - Central Luzon (Clark) & Baguio Cordillera
  - Metro Cebu & Mactan Island Hub
- **Active Route Corridor Caching**: 1-click archiving of every tile along your plotted journey corridor before heading into areas with weak cellular reception.

### 4. 🌦️ Weather & Traffic Intelligence
- **En-Route Meteorological Stations**: Real-time atmospheric conditions (temperature, precipitation probability, wind, visibility, and road surface advisories) powered by Open-Meteo with offline climatology fallback.
- **Corridor Traffic Dispatch**: Active traffic incidents, roadwork hazards, and delay calculations across Philippine expressways (Skyway, EDSA, SLEX, NLEX, CALAX).

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20 or higher
- npm (installed with Node)

### Installation
```bash
# Clone the repository
git clone https://github.com/JnnlCre8tor/Jnnl-GPS.git
cd Jnnl-GPS

# Install dependencies
npm install

# Start development server
npm run dev
```

Visit `http://localhost:3000` in your browser.

---

## 🧪 Testing & Verification

Run the comprehensive unit test suite and type check:

```bash
# Run unit tests
npm test

# Run TypeScript type check
npm run lint

# Build for production
npm run build
```

---

## 📲 Installing as Mobile App (PWA)

### On iOS (iPhone / iPad)
1. Open the deployed application URL in **Safari**.
2. Tap the **Share** button (box with upward arrow).
3. Scroll down and tap **"Add to Home Screen"**.
4. Tap **"Add"**. The app will now launch full-screen with offline support.

### On Android
1. Open the application URL in **Chrome**.
2. Tap the **"Install App"** button in the top bar (or tap the 3 dots menu -> **"Install app"**).
3. The app will be installed to your device launcher as a native-feeling standalone PWA.

---

## 🚢 Production Deployment

The project is pre-configured and ready to deploy to any major cloud provider:

### Option A: Vercel (1-Click)
1. Import the repository into your [Vercel Dashboard](https://vercel.com).
2. The included `vercel.json` automatically configures SPA rewrites and PWA Service Worker caching headers.
3. Deploy!

### Option B: Netlify
1. Connect repository in [Netlify](https://netlify.com).
2. The included `netlify.toml` handles routing and headers out-of-the-box.
3. Deploy!

### Option C: Docker Container
```bash
# Build Docker image
docker build -t laagarn .

# Run container on port 8080
docker run -p 8080:80 laagarn
```

---

## 📄 License
MIT License. Open-source cartography provided by OpenStreetMap contributors.
