#!/bin/bash
# ============================================================
# Mock API Server - One-Click Start Script (macOS/Linux)
# ============================================================

set -e

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  🚀 Starting Mock API Server..."
echo "═══════════════════════════════════════════════════════════"
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo ""
    echo "Please install Node.js first:"
    echo "  1. Go to https://nodejs.org/"
    echo "  2. Download and install the LTS version"
    echo "  3. Run this script again"
    echo ""
    exit 1
fi

echo "✅ Node.js found: $(node --version)"

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies (first time only)..."
    npm install --silent
    echo "✅ Dependencies installed"
fi

# Kill any existing processes on our ports
echo "🧹 Cleaning up any existing processes..."
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
lsof -ti:4010 | xargs kill -9 2>/dev/null || true
sleep 1

# Start the server
echo "🎯 Starting server..."
echo ""
node server.js
