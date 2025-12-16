#!/bin/bash

echo "========================================="
echo "Widget Server Diagnostic Tool"
echo "========================================="
echo ""

APP_ID="donmon-appstore-intel-gpu-monitor"

echo "1. Checking if app is installed..."
if docker ps | grep -q "${APP_ID}"; then
    echo "✓ App containers are running"
else
    echo "✗ App containers NOT found"
    echo "  Please make sure the app is installed"
    exit 1
fi
echo ""

echo "2. Listing all app containers..."
docker ps --filter "name=${APP_ID}" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""

echo "3. Checking widget-server container specifically..."
WIDGET_SERVER=$(docker ps --filter "name=${APP_ID}_widget-server" --format "{{.Names}}" | head -n 1)
if [ -z "$WIDGET_SERVER" ]; then
    echo "✗ Widget-server container NOT FOUND!"
    echo ""
    echo "This is the problem! The widget-server container is not running."
    echo "Possible reasons:"
    echo "  - Docker Compose didn't start the widget-server service"
    echo "  - The widget-server image failed to build/pull"
    echo "  - Container crashed on startup"
    echo ""
    echo "Let's check docker-compose logs..."
    exit 1
else
    echo "✓ Widget-server container found: $WIDGET_SERVER"
fi
echo ""

echo "4. Getting widget-server container IP..."
WIDGET_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$WIDGET_SERVER")
if [ -z "$WIDGET_IP" ]; then
    echo "✗ Could not get widget-server IP"
else
    echo "✓ Widget-server IP: $WIDGET_IP"
fi
echo ""

echo "5. Checking widget-server container logs (last 30 lines)..."
echo "---"
docker logs --tail 30 "$WIDGET_SERVER"
echo "---"
echo ""

echo "6. Testing widget endpoint from inside container network..."
WEB_CONTAINER=$(docker ps --filter "name=${APP_ID}_web" --format "{{.Names}}" | head -n 1)
if [ -n "$WEB_CONTAINER" ]; then
    echo "Using web container to test: $WEB_CONTAINER"
    docker exec "$WEB_CONTAINER" curl -s "http://widget-server:80/widgets/gpu" 2>&1 || echo "✗ Failed to connect"
else
    echo "Web container not found, trying direct IP test..."
    if [ -n "$WIDGET_IP" ]; then
        curl -s "http://${WIDGET_IP}:80/widgets/gpu" 2>&1 || echo "✗ Failed to connect"
    fi
fi
echo ""

echo "7. Checking if widget-server is listening on port 80..."
docker exec "$WIDGET_SERVER" sh -c "netstat -tulpn 2>/dev/null | grep :80 || ss -tulpn 2>/dev/null | grep :80 || echo 'netstat/ss not available'" || echo "Could not check ports"
echo ""

echo "========================================="
echo "Summary:"
echo "========================================="
echo "If widget-server is running and has an IP, but endpoint returns blank:"
echo "  → Check logs above for GPU access errors"
echo "  → Widget-server needs /dev/dri access"
echo "  → May need privileged mode"
echo ""
echo "If widget-server is NOT running:"
echo "  → Check: docker-compose ps"
echo "  → Check: docker logs for widget-server errors"
echo "  → Rebuild: docker-compose up -d --build widget-server"
