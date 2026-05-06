#!/bin/bash
set -e

echo "=== Investment Monitor ==="

# Install dependencies
if [ ! -d ".venv" ]; then
  echo "Creating virtual environment..."
  python3 -m venv .venv
fi

source .venv/bin/activate

echo "Installing dependencies..."
pip install -q -r requirements.txt

# Copy .env if not exists
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  cp .env.example .env
  echo "Created .env from .env.example — edit it and add your API keys!"
fi

echo ""
echo "Starting server at http://localhost:8000"
echo "Open your browser to: http://localhost:8000"
echo ""

uvicorn app:app --host 0.0.0.0 --port 8000 --reload
