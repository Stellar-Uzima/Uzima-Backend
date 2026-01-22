# Uzima Backend Cleanup Script for Drip Wave
Write-Host "🧹 Starting Uzima Backend Cleanup..." -ForegroundColor Cyan
Write-Host ""

Write-Host "🗑️  Removing 2FA Implementation..." -ForegroundColor Green
$files2FA = @(
    "src\services\twoFactorService.js",
    "src\__tests__\2fa.test.js",
    "src\middleware\require2FA.js"
)
foreach ($file in $files2FA) {
    if (Test-Path $file) {
        Remove-Item $file -Force
        Write-Host "   ✓ Deleted $file" -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "🗑️  Removing Payment & Webhook System..." -ForegroundColor Green
$paymentFiles = @(
    "src\controllers\webhookController.js",
    "src\models\Payment.js",
    "src\models\WebhookLog.js",
    "src\models\ReconciliationRun.js",
    "src\middleware\webhookValidation.js",
    "src\routes\webhookRoutes.js",
    "src\routes\reconciliation.js",
    "src\routes\subscriptionRoutes.js",
    "src\services\reconciliationService.js",
    "src\services\subscriptionScheduler.js",
    "src\jobs\reconciliationJob.js",
    "src\__tests__\webhook.test.js"
)
foreach ($file in $paymentFiles) {
    if (Test-Path $file) {
        Remove-Item $file -Force
        Write-Host "   ✓ Deleted $file" -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "🗑️  Removing WebSocket Implementation..." -ForegroundColor Green
$wsFiles = @(
    "src\wsServer.js",
    "src\services\realtime.service.js",
    "src\__tests__\wsNotifications.test.js"
)
foreach ($file in $wsFiles) {
    if (Test-Path $file) {
        Remove-Item $file -Force
        Write-Host "   ✓ Deleted $file" -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "🗑️  Removing Bull Queue Workers..." -ForegroundColor Green
$queueFiles = @(
    "src\queues\emailQueue.js",
    "src\workers\emailWorker.js",
    "src\jobs\importWorker.js",
    "src\queue-setup.js",
    "src\worker.js"
)
foreach ($file in $queueFiles) {
    if (Test-Path $file) {
        Remove-Item $file -Force
        Write-Host "   ✓ Deleted $file" -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "✅ Cleanup Complete!" -ForegroundColor Green
Write-Host "⚠️  Next: Manual file edits required (6 files)" -ForegroundColor Yellow
