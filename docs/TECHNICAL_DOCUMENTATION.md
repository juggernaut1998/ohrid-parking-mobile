# Ohrid Parking App — Technical Documentation & Tutorial

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Application Entry Point & Bootstrapping](#2-application-entry-point--bootstrapping)
3. [Authentication Flow](#3-authentication-flow)
4. [Local Storage & Persistence](#4-local-storage--persistence)
5. [Service Architecture](#5-service-architecture)
6. [Route Protection & Guards](#6-route-protection--guards)
7. [Third-Party Plugins & Libraries](#7-third-party-plugins--libraries)
8. [Real-Time Data (WebSockets & Pusher Protocol)](#8-real-time-data-websockets--pusher-protocol)
9. [Data Flow & State Management](#9-data-flow--state-management)
10. [Future Improvements & Recommendations](#10-future-improvements--recommendations)

---

## 1. Executive Summary

**Ohrid Parking** is an Ionic/Angular mobile application for managing parking in Ohrid, Macedonia. It integrates with a Laravel backend (`ohrid-parking-backend`) to provide:

- Passwordless email authentication (6-digit verification code)
- Map-based discovery of parking spots with real-time occupancy
- QR code scanning to start and stop parking sessions
- Vehicle management and payment processing

**Tech Stack:**
- **Frontend:** Angular 20, Ionic 8, TypeScript 5.9
- **Build:** Output to `www/` (Capacitor web directory)
- **State:** RxJS Observables (BehaviorSubjects) for reactive state
- **Real-time:** WebSocket using Pusher protocol (Laravel Reverb)

---

## 2. Application Entry Point & Bootstrapping

### 2.1 Entry Point Chain

```
index.html
    └── <app-root></app-root>
            ↓
main.ts
    └── platformBrowserDynamic().bootstrapModule(AppModule)
            ↓
AppModule (app.module.ts)
    └── bootstrap: [AppComponent]
    └── imports: [AppRoutingModule, IonicModule.forRoot(), ...]
```

### 2.2 Detailed Flow

| File | Role |
|------|------|
| `index.html` | HTML shell; loads `<app-root>` |
| `main.ts` | Bootstraps Angular via `platformBrowserDynamic().bootstrapModule(AppModule)` |
| `AppModule` | Root module; provides `IonicRouteStrategy`, `HttpClient` |
| `AppComponent` | Root component; template is `<ion-app><ion-router-outlet></ion-router-outlet></ion-app>` |
| `AppRoutingModule` | Defines routes; root path `''` redirects to `'login'` |

### 2.3 Routing Strategy

- **PreloadAllModules:** Routes are lazy-loaded via `loadComponent` / `loadChildren`, with preloading to speed up navigation.
- **IonicRouteStrategy:** Uses Ionic’s navigation stack instead of Angular’s default router strategy.

---

## 3. Authentication Flow

### 3.1 How We Know If a User Is Authenticated

Authentication is determined by:

1. **Token presence in localStorage:** `AuthService.isLoggedIn` returns `!!storage.getToken()`.
2. **User data in memory:** `AuthService.currentUser$` exposes the current user.

```typescript
// auth.service.ts
get isLoggedIn(): boolean {
  return !!this.storage.getToken();
}
```

**Important:** There is no HTTP interceptor that validates the token on every request. Auth is considered valid if a token exists in storage. If the backend returns 401, the app does not automatically redirect to login.

### 3.2 Login Flow — Passwordless Email (6-Digit Code)

The app uses **passwordless email authentication**, not magic links. The backend sends a **6-digit verification code** to the user's email.

```
Login Page → requestMagicLink(email)
    → Backend: POST /auth/request
    → Backend generates 6-digit code, caches it for 10 min, sends VerifyCodeMail
    → Frontend navigates to /verify-code?email=...
    → User enters the 6-digit code from email
    → verifyCode(email, code)
    → Backend: POST /auth/verify
    → Backend validates code from cache, creates user if new, sends WelcomeMail to new users
    → Backend returns { token, user } (Laravel Sanctum token)
    → handleAuthResponse() stores token & user in localStorage
    → Navigate to /setup-profile (if !profileComplete) or /tabs/map
```

**Backend implementation (ohrid-parking-backend):**
- **AuthController::requestCode** — Validates email, generates 6-digit code via `CodeGenerator` trait, caches with key `verify_code:{email}` for 10 minutes, queues `VerifyCodeMail`.
- **AuthController::verifyCode** — Validates 6-digit code (required, size 6), compares with cached value, clears cache on success. Creates user if not found (with random password, `email_verified_at` set). Sends `WelcomeMail` for new users. Creates Sanctum token via `$user->createToken('mobile-app')`.
- **AuthController::logout** — Revokes current token via `$request->user()->currentAccessToken()->delete()`.

**API routes (from `routes/api.php`):**
| Method | Endpoint | Controller | Auth |
|--------|----------|------------|------|
| POST | `/auth/request` | AuthController::requestCode | Public |
| POST | `/auth/verify` | AuthController::verifyCode | Public |
| POST | `/auth/logout` | AuthController::logout | Sanctum |

**Backend auth stack:** Laravel Sanctum (API tokens). Token is created via `$user->createToken('mobile-app')->plainTextToken`. Protected routes use `auth:sanctum` middleware. The frontend sends `Authorization: Bearer <token>` on every API request.

### 3.3 Post-Login Navigation

After successful auth, the app checks `user.profileComplete`:

- **`true`** → `/tabs/map`
- **`false`** → `/setup-profile`

The same logic is used in:
- `LoginPage.ngOnInit()` when `isLoggedIn` is true
- `VerifyCodePage` after successful `verifyCode`

### 3.4 Logout

- Calls `POST /auth/logout` (best-effort).
- Always clears localStorage and redirects to `/login` (even if the API fails).

---

## 4. Local Storage & Persistence

### 4.1 What We Store

| Key | Purpose |
|-----|---------|
| `auth_token` | Laravel Sanctum personal access token (Bearer) for API auth |
| `user_data` | Serialized user object (JSON) |

### 4.2 StorageService API

```typescript
setToken(token: string)
getToken(): string | null
removeToken()
setUser(user: any)
getUser(): any
removeUser()
clear()  // Removes both token and user
```

### 4.3 Usage

- **Token:** Attached to every API request via `ApiService.getHeaders()` as `Authorization: Bearer <token>`.
- **User:** Cached in memory (`AuthService.currentUserSubject`) and read from storage on app load. Updated after login, profile updates, and refresh.

### 4.4 Why localStorage

- Simple, synchronous API.
- Data survives page reloads and browser restarts.
- No server session required.
- Works in PWA / Capacitor web view.

**Note:** For native builds, Capacitor uses the web view’s storage; for more robust persistence, `@capacitor/preferences` could be used.

---

## 5. Service Architecture

### 5.1 Service Overview

| Service | Responsibility |
|---------|----------------|
| **StorageService** | Token and user persistence |
| **ApiService** | HTTP client; adds Bearer token |
| **AuthService** | Auth flows, user state, logout |
| **UserService** | Profile and vehicle CRUD |
| **ParkingService** | Spots, sessions, payments |
| **LocationService** | Geolocation (Capacitor) |
| **SocketService** | WebSocket / Pusher protocol |

All services use `providedIn: 'root'` (singleton).

### 5.2 ApiService — Central HTTP Layer

```typescript
get<T>(endpoint): Observable<T>
post<T>(endpoint, data): Observable<T>
put<T>(endpoint, data): Observable<T>
delete<T>(endpoint): Observable<T>
```

- Base URL: `environment.apiUrl` (e.g. `http://localhost/api`)
- All requests include `Content-Type: application/json` and optional `Authorization: Bearer <token>`.

### 5.3 AuthService — State & Auth

- `currentUserSubject`: BehaviorSubject for current user.
- `currentUser$`: Public observable.
- On construction, restores user from `StorageService.getUser()`.
- `handleAuthResponse()`: Stores token and user in storage and updates `currentUserSubject`.

### 5.4 ParkingService — Domain Logic

- `parkingSpots$`, `bounds$`, `activeSession$`: BehaviorSubjects for spots and active session.
- Subscribes to `SocketService.spotOccupancy$` for real-time updates.
- Transforms API payloads (snake_case) to frontend models (camelCase).
- Extracts spot code from QR URLs (e.g. `/spots/OHRID-S5O5HY6D` → `OHRID-S5O5HY6D`).

### 5.5 Dependency Flow

```
AuthService → ApiService, StorageService, Router
UserService → ApiService, AuthService, StorageService
ParkingService → ApiService, SocketService
SocketService → StorageService (for private channel auth)
ApiService → StorageService (for token)
```

---

## 6. Route Protection & Guards

### 6.1 AuthGuard

**Used for:** `setup-profile`, `payment`, `spot-details`, `tabs`

```typescript
canActivate(): boolean | UrlTree {
  if (this.authService.isLoggedIn) return true;
  return this.router.createUrlTree(['/login']);
}
```

**Behavior:** If there is a token in storage, navigation proceeds; otherwise, redirect to `/login`.

### 6.2 ProfileCompleteGuard

Defined but **not used** in the current routing configuration:

```typescript
canActivate(): boolean | UrlTree {
  const user = this.authService.currentUser;
  if (user?.profileComplete) return true;
  return this.router.createUrlTree(['/setup-profile']);
}
```

**Intended use:** Protect routes that require a completed profile (e.g. `/tabs`). Currently, post-login navigation in Login/VerifyCode handles this instead.

### 6.3 Unprotected Routes

- `/login` — Public
- `/verify-code` — Public (relies on `email` query param)

---

## 7. Third-Party Plugins & Libraries

### 7.1 Ionic Framework (`@ionic/angular`)

- UI components (buttons, lists, modals, tabs).
- Ionic routing and navigation.
- Pattern: `IonicModule.forRoot()` in `AppModule`, component imports in pages.

### 7.2 Capacitor (Native Bridge)

| Package | Purpose |
|---------|---------|
| `@capacitor/core` | Core runtime |
| `@capacitor/geolocation` | GPS via native APIs |
| `@capacitor/google-maps` | Native Google Maps (configured) |
| `@capacitor/app` | App lifecycle |
| `@capacitor/haptics` | Haptic feedback |
| `@capacitor/keyboard` | Keyboard handling |
| `@capacitor/status-bar` | Status bar styling |

**Used in this app:**
- **Geolocation:** `LocationService` — `getCurrentPosition()`, `watchPosition()` for map and spot loading.

**Configured but not clearly used in code:**
- Google Maps (map page uses Google Maps JS API via script tag, not Capacitor plugin).
- Google Auth: `@capgo/capacitor-social-login`, `@codetrix-studio/capacitor-google-auth` in package.json; login page only shows email flow.

### 7.3 ZXing (`@zxing/library`)

Used in `ScannerPage` for QR decoding:

```typescript
import { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } from '@zxing/library';
```

- `BrowserMultiFormatReader`: Decodes QR codes from the camera.
- Flow: start camera → decode frames → on success call `handleScanResult(text)`.
- Supports full QR URLs (e.g. `http://localhost/api/parking/spots/OHRID-S5O5HY6D`); spot code is extracted before API calls.

### 7.4 Google Maps JavaScript API

- Loaded dynamically in `MapPage` via a script tag.
- API key: `environment.googleMapsApiKey`.
- Used for map, markers, and user position.

---

## 8. Real-Time Data (WebSockets & Pusher Protocol)

### 8.1 What Is Pusher?

**Pusher** is a hosted real-time messaging service. Its protocol defines a standard for:

- WebSocket connection URL format
- Subscribe/unsubscribe to channels
- Event names and payloads
- Ping/pong keep-alive

### 8.2 Laravel Reverb & Pusher Compatibility

**Laravel Reverb** is a Laravel-first WebSocket server that speaks the **Pusher protocol**. The frontend can use the same client format:

- URL: `ws://host/app/{appKey}?protocol=7&client=js&version=8.3.0`
- App key: `environment.pusherAppKey` (must match backend `REVERB_APP_KEY`)

### 8.3 SocketService Implementation

- Uses the browser `WebSocket` API (no Pusher JS SDK).
- Connects to `environment.wsUrl` (e.g. `ws://localhost:8080`).
- Implements a subset of the Pusher protocol: connect, ping/pong, subscribe, event handling.

**Handled events:**

| Event | Action |
|-------|--------|
| `pusher:connection_established` | Store `socket_id`, subscribe to `parking-spots` channel |
| `pusher:pong` | Keep-alive |
| `pusher_internal:subscription_succeeded` | Log subscription |
| `spot.updated` / `SpotUpdated` / `App\Events\SpotUpdated` | Emit `SpotOccupancyUpdate` |
| `session.started` / `session.ended` / `payment.completed` | Emit `ParkingSessionEvent` |

### 8.4 Data Flow

```
Backend (Laravel Reverb) → broadcasts events
    ↓
WebSocket → SocketService.handleMessage()
    ↓
spotOccupancySubject / sessionEventSubject
    ↓
ParkingService.handleOccupancyUpdate() → updates parkingSpotsSubject
    ↓
MapPage subscribes to parkingSpots$ → updates markers
```

### 8.5 Reconnection

- On unexpected close: reconnects up to 3 times with 5s delay.
- Ping every 30s to keep the connection alive.

### 8.6 Live Update Scenarios — When the User Sees Real-Time Changes

**Prerequisites:** User must be on the **Map tab** with parking spots loaded. The WebSocket must be connected (status shows "Live" in the map header). Laravel Reverb must be running on the backend.

**Channel requirement:** The backend broadcasts `spot.updated` on channel `parking-spots`. The frontend must subscribe to `parking-spots` (not `parking`) to receive live updates.

| Scenario | Backend trigger | Backend broadcast | Frontend behavior |
|----------|------------------|-------------------|----------------------------------------|
| **Someone starts parking** | User scans QR, `POST /parking/start` → `ParkingSession` created → spot `markAsOccupied()` | `ParkingSpot::updated` fires → `ParkingSpotUpdated` → `spot.updated` on `parking-spots` | Map marker for that spot turns from green/free to red/occupied |
| **Someone ends parking** | User scans QR to stop, `POST /parking/end` → spot `markAsFree()` | Same as above | Map marker turns from occupied back to free |
| **Admin changes spot status** | Admin panel updates a spot (status, etc.) | `ParkingSpot::updated` → `ParkingSpotUpdated` | Map marker updates to new status |
| **Spot deleted** | Admin deletes a spot | `ParkingSpot::deleted` → `ParkingSpotUpdated` | Spot removed from map (if frontend handles it) |

**What the frontend actually uses:**

- **`spotOccupancy$`** — Updates `ParkingService.parkingSpotsSubject` → `MapPage` re-renders markers. This is the **only** live update path that changes the UI.
- **`sessionEvent$`** — Emits `session.started`, `session.ended`, `payment.completed`, but **no component subscribes** to it. Session events do not currently drive any live UI.

**Where live updates appear:** Only on the **Map page** (markers and spot list). The Spot Details page, Scanner, Profile, and Payment pages do not subscribe to WebSocket updates; they rely on HTTP API responses.

---

## 9. Data Flow & State Management

### 9.1 Reactive State

State is kept in BehaviorSubjects and exposed as Observables:

| Subject | Exposed As | Updated By |
|---------|------------|------------|
| `parkingSpotsSubject` | `parkingSpots$` | `getSpots`, `handleOccupancyUpdate` |
| `activeSessionSubject` | `activeSession$` | `getActiveSession`, `startParking`, `stopParking` |
| `currentUserSubject` | `currentUser$` | Login, refresh, logout |
| `currentPositionSubject` | `currentPosition$` | Geolocation |

### 9.2 Tabs and Active Session

- `TabsPage` subscribes to `ParkingService.activeSession$`.
- When `activeSession` is set: middle tab label becomes "Parking", icon `time`.
- When no active session: label "Scan", icon `qr-code`.

### 9.3 No NgRx/Standalone State Library

The app uses plain RxJS and services instead of NgRx or similar. This fits the current size; a store would help if complexity grows.

---

## 10. Future Improvements & Recommendations

### 10.1 Authentication & Security

| Improvement | Why |
|-------------|-----|
| **HTTP interceptor for 401** | Auto-redirect on token expiry or invalid token. |
| **Token refresh** | Prolong sessions without re-login when refresh tokens are available. |
| **Secure storage** | Use `@capacitor/preferences` or similar for tokens on native builds. |
| **Token validation** | Verify token with backend or check expiration before trusting `isLoggedIn`. |

### 10.2 Offline & Resilience

| Improvement | Why |
|-------------|-----|
| **Offline detection** | Show a clear state when offline and queue actions. |
| **Request retry** | Retry failed requests (e.g. with exponential backoff). |
| **Cached spots** | Show last known spots when offline. |
| **Service worker** | Cache static assets for faster loads and basic offline use. |

### 10.3 Real-Time

| Improvement | Why |
|-------------|-----|
| **Reconnect on tab focus** | Reconnect WebSocket when the user returns to the app. |
| **Use Pusher JS SDK** | Rely on maintained client instead of custom protocol handling. |
| **Private channels** | Use user-specific channels for session updates if needed. |

### 10.4 Code Quality & Architecture

| Improvement | Why |
|-------------|-----|
| **Use ProfileCompleteGuard** | Enforce profile completion on `/tabs` and related routes. |
| **Centralized error handling** | Global interceptor for API errors and user feedback. |
| **Environment validation** | Check required env vars at startup. |
| **Type-safe API models** | Shared DTOs/interfaces between frontend and backend. |
| **Unit / E2E tests** | Cover auth, parking flows, and critical services. |

### 10.5 UX & Features

| Improvement | Why |
|-------------|-----|
| **Deep linking** | Open specific spots or sessions from links. |
| **Push notifications** | Remind when parking is ending or payment is due. |
| **Payment receipts** | Downloadable or shareable receipts. |
| **Spot availability filter** | Filter map/list by availability. |
| **Favorites / recent spots** | Store frequent spots for quick access. |

### 10.6 Performance

| Improvement | Why |
|-------------|-----|
| **Lazy load Google Maps** | Load script only when map is shown. |
| **Virtual scrolling** | For long spot lists. |
| **Image optimization** | Compress and serve appropriately sized assets. |
| **Bundle analysis** | Identify and trim large dependencies. |

---

## Appendix A: File Structure Overview

```
src/
├── main.ts                 # Bootstrap
├── index.html              # Entry HTML
├── app/
│   ├── app.module.ts       # Root module
│   ├── app.component.ts    # Root component
│   ├── app-routing.module.ts
│   ├── guards/
│   │   ├── auth.guard.ts
│   │   └── profile-complete.guard.ts
│   ├── services/
│   │   ├── api.service.ts
│   │   ├── auth.service.ts
│   │   ├── storage.service.ts
│   │   ├── user.service.ts
│   │   ├── parking.service.ts
│   │   ├── location.service.ts
│   │   └── socket.service.ts
│   ├── pages/
│   │   ├── login/
│   │   ├── verify-code/
│   │   ├── setup-profile/
│   │   ├── map/
│   │   ├── scanner/
│   │   ├── spot-details/
│   │   ├── payment/
│   │   └── profile/
│   └── tabs/
└── environments/
    ├── environment.ts
    └── environment.prod.ts
```

---

## Appendix B: Environment Variables

| Variable | Purpose |
|----------|---------|
| `apiUrl` | Backend API base URL (e.g. `http://localhost/api`) |
| `wsUrl` | WebSocket (Laravel Reverb) URL |
| `pusherAppKey` | Must match backend `REVERB_APP_KEY` |
| `googleMapsApiKey` | Google Maps JavaScript API |
| `googleClientId` | Google OAuth client ID (for future use) |

---

## Appendix C: Backend API Routes Summary

From `ohrid-parking-backend/routes/api.php`:

**Public (no auth):**
- `POST /auth/request` — Request 6-digit verification code
- `POST /auth/verify` — Verify code, return token + user
- `GET /parking/spots` — List spots (with lat/lng/radius filters)
- `GET /parking/spots/{qr_code}` — Get spot by QR code
- `GET /parking/zones` — List zones

**Protected (auth:sanctum):**
- `POST /auth/logout` — Revoke token
- `GET /profile` — Get user profile
- `PUT /profile` — Update profile
- `DELETE /profile` — Deactivate account
- `GET|POST|PUT|DELETE /vehicles` — Vehicle CRUD
- `POST /vehicles/{id}/set-primary` — Set default vehicle
- `POST /parking/start` — Start parking session
- `POST /parking/end` — End parking session
- `GET /parking/active` — Get active session
- `GET /parking/history` — Get session history
- `POST /payments/{id}/pay` — Process payment
- `POST /sessions/{id}/pay` — Pay for session directly

---
