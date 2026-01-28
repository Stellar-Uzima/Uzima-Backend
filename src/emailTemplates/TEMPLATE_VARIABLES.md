# Email Template Variables Documentation

This document describes all available email templates and their variables for the Uzima Health email system.

## Overview

The email template system uses [Handlebars](https://handlebarsjs.com/) for templating with [Juice](https://github.com/Automattic/juice) for CSS inlining to ensure maximum email client compatibility.

## Available Templates

| Template | Description | Use Case |
|----------|-------------|----------|
| `welcome` | New user welcome email | User registration, account activation |
| `passwordReset` | Password reset email | Forgot password flow |
| `notification` | General notification | Alerts, updates, confirmations |

---

## Template: `welcome`

**Description:** New user welcome email with optional account activation link.

### Required Variables

| Variable | Type | Description |
|----------|------|-------------|
| `username` | String | User's display name or first name |

### Optional Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `email` | String | - | User's email address |
| `activationLink` | String | - | URL to activate the account |
| `expiresIn` | String | - | Link expiration time (e.g., "24 hours") |
| `features` | Array | Default features | Array of feature highlights `[{title, description}]` |
| `supportEmail` | String | From env | Support email address |
| `dashboardLink` | String | - | Link to user dashboard |
| `unsubscribeLink` | String | - | Link to unsubscribe from emails |

### Example Usage

```javascript
import { renderTemplate } from '../services/templateService.js';

const { html, text } = await renderTemplate('welcome', {
  username: 'John',
  email: 'john@example.com',
  activationLink: 'https://uzima.health/activate?token=abc123',
  expiresIn: '24 hours',
  features: [
    { title: 'Virtual Consultations', description: 'Connect with doctors online' },
    { title: 'Health Records', description: 'Secure access to your medical history' }
  ]
});
```

---

## Template: `passwordReset`

**Description:** Password reset email with security information and tips.

### Required Variables

| Variable | Type | Description |
|----------|------|-------------|
| `username` | String | User's display name or first name |
| `resetLink` | String | URL to reset password page with token |
| `expiresIn` | String | Link expiration time (e.g., "15 minutes") |

### Optional Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `email` | String | - | User's email address |
| `ipAddress` | String | - | IP address that requested the reset |
| `userAgent` | String | - | Browser/device information |
| `requestTime` | String | - | Time when reset was requested |
| `supportEmail` | String | From env | Support email address |

### Example Usage

```javascript
import { renderTemplate } from '../services/templateService.js';

const { html, text } = await renderTemplate('passwordReset', {
  username: 'John',
  email: 'john@example.com',
  resetLink: 'https://uzima.health/reset-password?token=xyz789',
  expiresIn: '15 minutes',
  ipAddress: '192.168.1.1',
  requestTime: 'January 15, 2024 at 10:30 AM UTC'
});
```

---

## Template: `notification`

**Description:** General notification/alert email with configurable type and styling.

### Required Variables

| Variable | Type | Description |
|----------|------|-------------|
| `username` | String | User's display name or first name |
| `title` | String | Notification title/header |
| `message` | String | Main notification message (can include HTML) |

### Optional Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `type` | String | `'info'` | Notification type: `'info'`, `'success'`, `'warning'`, `'error'` |
| `actionButton` | Object | - | Primary CTA button `{ text, link }` |
| `secondaryButton` | Object | - | Secondary action button `{ text, link }` |
| `details` | Array | - | Detail items `[{ label, value }]` |
| `timestamp` | String | - | When the event occurred |
| `footer` | String | - | Additional footer text (can include HTML) |
| `supportEmail` | String | From env | Support email address |
| `unsubscribeLink` | String | - | Link to manage notification preferences |

### Type Styling

| Type | Header Color | Box Color | Icon |
|------|--------------|-----------|------|
| `info` | Purple gradient | Light purple | Bell |
| `success` | Green gradient | Light green | Checkmark |
| `warning` | Orange gradient | Light orange | Warning |
| `error` | Red gradient | Light red | X mark |

### Example Usage

```javascript
import { renderTemplate } from '../services/templateService.js';

// Appointment confirmation
const { html, text } = await renderTemplate('notification', {
  username: 'John',
  title: 'Appointment Confirmed',
  type: 'success',
  message: 'Your appointment has been successfully scheduled.',
  details: [
    { label: 'Doctor', value: 'Dr. Smith' },
    { label: 'Date', value: 'January 20, 2024' },
    { label: 'Time', value: '10:00 AM' },
    { label: 'Location', value: 'Uzima Health Clinic' }
  ],
  actionButton: {
    text: 'View Appointment',
    link: 'https://uzima.health/appointments/123'
  },
  secondaryButton: {
    text: 'Reschedule',
    link: 'https://uzima.health/appointments/123/reschedule'
  },
  timestamp: 'January 15, 2024 at 2:30 PM'
});

// Payment failed warning
const warning = await renderTemplate('notification', {
  username: 'John',
  title: 'Payment Failed',
  type: 'warning',
  message: 'We were unable to process your payment. Please update your payment method.',
  actionButton: {
    text: 'Update Payment',
    link: 'https://uzima.health/billing'
  }
});
```

---

## Global Variables

These variables are automatically available in all templates:

| Variable | Type | Description |
|----------|------|-------------|
| `companyName` | String | "Uzima Health" |
| `currentYear` | Number | Current year for copyright |
| `supportEmail` | String | From `SUPPORT_EMAIL` env variable |

---

## Handlebars Helpers

The following custom helpers are available in templates:

### Comparison Helpers

```handlebars
{{#if (eq type 'success')}}Success!{{/if}}
{{#if (neq status 'pending')}}Not pending{{/if}}
{{#if (gt count 5)}}More than 5{{/if}}
{{#if (lt count 10)}}Less than 10{{/if}}
{{#if (or conditionA conditionB)}}Either true{{/if}}
{{#if (and conditionA conditionB)}}Both true{{/if}}
```

### String Helpers

```handlebars
{{uppercase name}}        <!-- JOHN -->
{{lowercase name}}        <!-- john -->
{{capitalize name}}       <!-- John -->
{{truncate description 50}}  <!-- First 50 chars... -->
```

### Date Helper

```handlebars
{{formatDate date 'short'}}    <!-- Jan 15, 2024 -->
{{formatDate date 'long'}}     <!-- Monday, January 15, 2024 -->
{{formatDate date 'time'}}     <!-- 10:30 AM -->
{{formatDate date 'datetime'}} <!-- Jan 15, 2024, 10:30 AM -->
```

### Utility Helpers

```handlebars
{{default value 'fallback'}}                <!-- Use fallback if value is empty -->
{{pluralize count 'item' 'items'}}          <!-- 1 item / 5 items -->
{{json object}}                             <!-- Debug: outputs JSON -->
```

---

## API Endpoints

### List Templates
```
GET /api/templates
```

### Template Gallery (HTML)
```
GET /api/templates/gallery
```

### Get Template Documentation
```
GET /api/templates/:templateName/docs
```

### Preview Template
```
GET  /api/templates/:templateName/preview
GET  /api/templates/:templateName/preview?format=json|text|html
POST /api/templates/:templateName/preview
Body: { custom data object }
```

### Render Template
```
POST /api/templates/:templateName/render
Body: {
  "data": { template variables },
  "options": {
    "inlineStyles": true,
    "minify": false
  }
}
```

### Clear Cache
```
POST /api/templates/cache/clear
```

---

## Service API

```javascript
import templateService from '../services/templateService.js';

// Render a template
const { html, text } = await templateService.renderTemplate('welcome', {
  username: 'John',
  activationLink: 'https://...'
});

// Get available templates
const templates = templateService.getAvailableTemplates();
// ['welcome', 'passwordReset', 'notification']

// Get template documentation
const docs = templateService.getTemplateDocumentation('welcome');

// Preview with example data
const preview = await templateService.previewTemplate('welcome', {
  // optional overrides
});

// Clear cache (for development)
templateService.clearTemplateCache();
```

---

## Best Practices

1. **Always provide fallback text** - Use the `text` output for email clients that don't support HTML
2. **Test across email clients** - Use the preview endpoint to verify rendering
3. **Keep messages concise** - Email content should be scannable
4. **Use appropriate notification types** - Match `type` to the message severity
5. **Include action buttons** - Make it easy for users to take the next step
6. **Set expiration times** - Always communicate link validity for time-sensitive emails

---

## Adding New Templates

1. Create a new `.hbs` file in `/src/emailTemplates/`
2. Add documentation to `templateService.js` in `getTemplateDocumentation()`
3. Update plain text generation in `generatePlainText()` if needed
4. Test using the preview endpoint

Example structure:
```handlebars
{{!--
  Template Name

  Variables:
    - required: description
    - optional: description
--}}
<!DOCTYPE html>
<html>
  <!-- Template content -->
</html>
```
