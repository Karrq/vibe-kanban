# Offline Mode: HTTP vs HTTPS Considerations

## The Issue
Service Workers, which provide the best offline experience, **only work over HTTPS or localhost** for security reasons. This is a browser-enforced restriction to prevent man-in-the-middle attacks.

## Implementation Strategy

### 1. Automatic Detection
The app now automatically detects the connection context and chooses the appropriate caching strategy:

```typescript
const isSecureContext = window.isSecureContext;
const isLocalhost = window.location.hostname === 'localhost' || 
                   window.location.hostname === '127.0.0.1';
```

### 2. Dual-Mode Support

#### HTTPS/Localhost Mode (Full Features)
- ✅ Service Worker registration
- ✅ Background sync
- ✅ Push notifications (if implemented)
- ✅ IndexedDB for large data storage
- ✅ Offline asset caching
- ✅ Network-first caching strategies

#### HTTP Mode (Fallback)
- ❌ No Service Worker
- ✅ localStorage caching (5-10MB limit)
- ✅ IndexedDB still works (for data)
- ✅ Online/offline detection
- ✅ Page visibility handling
- ✅ Basic data caching
- ⚠️ No offline asset caching

### 3. Fallback Implementation

Created `offline-fallback.ts` that provides localStorage-based caching when Service Workers aren't available:

```typescript
// Automatic fallback in cached-api.ts
this.useIndexedDB = isSecureContext || isLocalhost;

const cached = this.useIndexedDB 
  ? await offlineStorage.getProject(id)  // IndexedDB
  : offlineFallback.get<ProjectWithBranch>(`project-${id}`); // localStorage
```

## Features by Environment

| Feature | HTTPS/Localhost | HTTP |
|---------|----------------|------|
| **Service Worker** | ✅ Yes | ❌ No |
| **Offline Assets** | ✅ Cached | ❌ Requires network |
| **Data Caching** | ✅ IndexedDB | ✅ localStorage |
| **Cache Size** | ✅ ~50% of disk | ⚠️ 5-10MB |
| **Background Sync** | ✅ Yes | ❌ No |
| **Offline Detection** | ✅ Yes | ✅ Yes |
| **Page Resume Sync** | ✅ Yes | ✅ Yes |
| **Stale Indicators** | ✅ Yes | ✅ Yes |

## Development vs Production

### Development (localhost)
```bash
# Works with full offline features on:
http://localhost:3000  ✅
http://127.0.0.1:3000  ✅
http://[::1]:3000      ✅
```

### Development (Network IP)
```bash
# Limited offline features on:
http://192.168.1.100:3000  ⚠️ (localStorage only)
http://10.0.0.5:3000       ⚠️ (localStorage only)
```

### Production
```bash
# Full features:
https://your-domain.com    ✅

# Limited features:
http://your-domain.com     ⚠️
```

## Enabling HTTPS in Development

### Option 1: Vite HTTPS Mode
```bash
# Add to package.json scripts:
"dev:https": "vite --https"

# Or use environment variable:
VITE_HTTPS=true pnpm run dev
```

### Option 2: Using mkcert for Local HTTPS
```bash
# Install mkcert
brew install mkcert  # macOS
# or: choco install mkcert  # Windows

# Create local CA
mkcert -install

# Generate certificates
mkcert localhost 127.0.0.1 ::1

# Configure Vite
# vite.config.ts:
server: {
  https: {
    key: fs.readFileSync('./localhost+2-key.pem'),
    cert: fs.readFileSync('./localhost+2.pem'),
  }
}
```

### Option 3: ngrok Tunnel
```bash
# Install ngrok
brew install ngrok

# Start your dev server
pnpm run dev

# In another terminal, create HTTPS tunnel
ngrok http 3000

# Access via ngrok's HTTPS URL
https://abc123.ngrok.io
```

## Mobile Testing Scenarios

### Local Network Testing (HTTP)
When testing on mobile devices via local network IP:
- Service Worker: ❌ Disabled
- Basic caching: ✅ Works via localStorage
- Resume without refresh: ✅ Works
- Offline data access: ✅ Limited to 5-10MB

### Production Testing (HTTPS)
When deployed with HTTPS:
- Service Worker: ✅ Full support
- All offline features: ✅ Available
- iOS Safari: ✅ Supported (11.3+)
- Android Chrome: ✅ Supported

## User Experience by Context

### Best Experience (HTTPS)
- Instant page loads from cache
- Works completely offline
- Background sync of changes
- Large data storage capacity

### Degraded Experience (HTTP)
- Data persists across sessions
- Resume without full refresh
- Limited offline capability
- Requires network for assets
- Smaller cache capacity

### Minimum Requirements
- For full offline: HTTPS or localhost
- For basic caching: Any modern browser
- For mobile: iOS 11.3+ or Android 5+

## Recommendations

1. **Development**: Use localhost for full feature testing
2. **Staging**: Deploy with HTTPS for realistic testing
3. **Production**: Always use HTTPS for security and features
4. **Mobile Testing**: Use ngrok or similar for HTTPS tunneling

## Console Messages

The app provides clear console messages about the offline mode status:

- `"Service worker disabled: requires HTTPS or localhost"` - On HTTP
- `"Using localStorage fallback for offline caching"` - Fallback mode
- `"App ready for offline use"` - Full offline mode active