# Content Security Policy (CSP)

## Overview
Helmet middleware enforces CSP headers on all responses to prevent XSS and injection attacks.

## Directives

| Directive | Value | Purpose |
|-----------|-------|---------|
| `default-src` | `'self'` | Fallback for unspecified directives |
| `script-src` | `'self'`, `'nonce-<random>'` | Scripts from same origin + nonce-based inline |
| `style-src` | `'self'`, `'unsafe-inline'`, Google Fonts | Styles from same origin + inline + fonts |
| `font-src` | `'self'`, Google Fonts | Fonts from same origin + Google |
| `img-src` | `'self'`, `data:`, `https:` | Images from same origin + data URIs + HTTPS |
| `connect-src` | `'self'`, Stellar APIs, `wss:` | XHR/WebSocket to self, Stellar, and WS |
| `object-src` | `'none'` | Block plugins (Flash, etc.) |
| `frame-ancestors` | `'none'` | Prevent embedding in iframes |
| `base-uri` | `'self'` | Restrict `<base>` tag |
| `form-action` | `'self'` | Forms submit to same origin only |

## Whitelisted Domains
- `https://fonts.googleapis.com` - Google Fonts CSS
- `https://fonts.gstatic.com` - Google Fonts files
- `https://horizon.stellar.org` - Stellar mainnet API
- `https://horizon-testnet.stellar.org` - Stellar testnet API

## Nonce Support
Each request generates a unique nonce via `res.locals.cspNonce`. Use it for inline scripts:
```html
<script nonce="<%= cspNonce %>">...</script>
```

## Violation Reporting
Violations are logged to `POST /api/csp-report` and recorded via Winston logger.

## Excluded Paths
- `/api-docs/*` - Swagger UI (uses inline scripts that can't be nonce-tagged)

## Files
- `src/config/csp.js` - CSP directives configuration
- `src/middleware/cspNonce.js` - Nonce generation middleware
- `src/routes/cspReportRoutes.js` - Violation reporting endpoint
