#!/bin/bash

# Request ID Manual Testing Script
# Run these curl commands to test request ID functionality

echo "🧪 Manual Request ID Testing"
echo "=============================="

echo ""
echo "1️⃣ Test Request ID Generation (no existing header):"
curl -i http://localhost:5000/api/health 2>/dev/null | grep -i "x-request-id"

echo ""
echo "2️⃣ Test Existing Request ID Preservation:"
curl -i -H "X-Request-ID: manual-test-123" http://localhost:5000/api/health 2>/dev/null | grep -i "x-request-id"

echo ""
echo "3️⃣ Test Multiple Requests (should have different IDs):"
echo "Request 1:"
curl -i http://localhost:5000/api/health 2>/dev/null | grep -i "x-request-id" | head -1
echo "Request 2:"
curl -i http://localhost:5000/api/health 2>/dev/null | grep -i "x-request-id" | head -1

echo ""
echo "4️⃣ Test with different endpoints:"
curl -i http://localhost:5000/docs 2>/dev/null | grep -i "x-request-id"

echo ""
echo "✅ Manual testing complete!"
echo "📝 Check your server console logs for [request-id] prefixes"
