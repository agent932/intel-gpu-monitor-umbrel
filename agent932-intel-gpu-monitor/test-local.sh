#!/bin/bash

# Local testing script for Intel GPU Monitor

echo "🚀 Starting Intel GPU Monitor - Local Test Mode"
echo "=================================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop first."
    exit 1
fi

echo "✅ Docker is running"

# Build and start the containers
echo "🏗️  Building and starting containers..."
docker-compose up --build -d

# Wait for containers to start
echo "⏳ Waiting for containers to start..."
sleep 5

# Check if containers are running
if docker-compose ps | grep -q "Up"; then
    echo "✅ Containers are running!"
    echo ""
    echo "🌐 Access the app at:"
    echo "   Main App: http://localhost:8847"
    echo "   Widget API: http://localhost:8880/widgets/gpu"
    echo ""
    echo "📊 To view logs:"
    echo "   docker-compose logs -f"
    echo ""
    echo "🛑 To stop:"
    echo "   docker-compose down"
    echo ""
    echo "⚠️  Note: GPU monitoring requires Intel integrated graphics."
    echo "   If you don't have Intel GPU, the app will show placeholder data."
else
    echo "❌ Failed to start containers. Check logs:"
    docker-compose logs
fi