#!/bin/bash
# ============================================================
# Mock API Server - Stop Script (macOS/Linux)
# ============================================================

echo ""
echo "🛑 Stopping Mock API Server..."
echo ""

# Kill processes on port 3001 (Express server)
if lsof -ti:3001 > /dev/null 2>&1; then
    lsof -ti:3001 | xargs kill -9 2>/dev/null
    echo "✅ Stopped Express server (port 3001)"
else
    echo "ℹ️  No process found on port 3001"
fi

# Kill processes on port 4010 (Prism server)
if lsof -ti:4010 > /dev/null 2>&1; then
    lsof -ti:4010 | xargs kill -9 2>/dev/null
    echo "✅ Stopped Prism server (port 4010)"
else
    echo "ℹ️  No process found on port 4010"
fi

# Kill any node server.js processes in this directory
pkill -f "node server.js" 2>/dev/null && echo "✅ Stopped node processes" || true

echo ""
echo "✅ Mock API Server stopped"
echo ""
