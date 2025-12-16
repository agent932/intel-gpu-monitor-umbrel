# Intel GPU Monitor for Umbrel

<div align="center">

![Intel GPU Monitor](https://raw.githubusercontent.com/agent932/intel-gpu-monitor-umbrel/main/donmon-appstore-intel-gpu-monitor/icon.svg)

**Real-time Intel GPU monitoring for your Umbrel home server**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=flat&logo=docker&logoColor=white)](https://github.com/agent932/intel-gpu-monitor-umbrel/pkgs/container/intel-gpu-monitor)
[![Umbrel](https://img.shields.io/badge/Umbrel-App-purple)](https://umbrel.com)

[Features](#features) • [Installation](#installation) • [Screenshots](#screenshots) • [Troubleshooting](#troubleshooting) • [Development](#development)

</div>

---

## 🎯 Overview

Intel GPU Monitor is a beautiful, real-time monitoring dashboard for Intel integrated graphics on Umbrel. Track GPU usage, frequency, power consumption, and see which applications are using your GPU - perfect for media servers running Plex, Jellyfin, or other hardware-accelerated apps.

### Why Use This?

- **Hardware Transcoding Insights**: See when Plex/Jellyfin is using GPU acceleration
- **Performance Monitoring**: Track GPU load, frequency, and power usage in real-time
- **Application Detection**: Automatically identifies which Umbrel apps are using the GPU
- **Umbrel Dashboard Widget**: Quick GPU stats right on your Umbrel homepage
- **Zero Configuration**: Just install and go - no setup required

---

## ✨ Features

### 📊 Real-Time Monitoring
- **GPU Usage**: Overall GPU utilization percentage
- **Frequency**: Current and maximum GPU frequency in MHz
- **Power Consumption**: Real-time power draw in watts
- **RC6 Idle State**: GPU power-saving efficiency

### 🎮 Engine Breakdown
- **Render/3D Engine**: 3D graphics and compute workloads
- **Blitter Engine**: Memory-to-memory copy operations
- **Video Decode**: Hardware video decoding (Video/0, Video/1)
- **Video Encode**: Hardware video encoding (VideoEnhance)
- **All Engines**: Comprehensive view of all GPU components

### 🔍 Application Detection
- **Smart App Recognition**: Automatically maps processes to Umbrel app names
- **App Icons**: Displays official Umbrel app icons when available
- **Supported Apps**: Plex, Jellyfin, Emby, Immich, PhotoPrism, Frigate, HandBrake, Tdarr, FFmpeg, and more
- **Live Updates**: Process list updates every 2 seconds

### 📱 Umbrel Dashboard Widget
- **Four-Stat Widget**: GPU Usage, Frequency, Power, and RC6 state
- **2-Second Refresh**: Real-time updates on your Umbrel homepage
- **No Configuration Needed**: Automatically appears after installation

### 🎨 Beautiful Interface
- **Dark Mode Design**: Matches Umbrel's aesthetic
- **Responsive Layout**: Works on desktop, tablet, and mobile
- **WebSocket Updates**: Smooth real-time updates without page refresh
- **Color-Coded Metrics**: Easy-to-read visual indicators

---

## 📦 Installation

### Prerequisites
- Umbrel OS (tested on Umbrel 1.0+)
- Intel CPU with integrated graphics (iGPU)
- `/dev/dri` device access (automatically configured)

### Method 1: Community App Store (Recommended)

1. Open your Umbrel dashboard
2. Go to **App Store**
3. Search for **"Intel GPU Monitor"**
4. Click **Install**

### Method 2: Manual Installation

1. Add this app store to your Umbrel:
```bash
# SSH into your Umbrel
ssh umbrel@umbrel.local

# Add the community app store
# (Instructions coming soon)
```

2. The app will appear in your App Store

### Method 3: Developer Installation

```bash
# Clone the repository
git clone https://github.com/agent932/intel-gpu-monitor-umbrel.git

# Copy to Umbrel app stores directory
sudo cp -r intel-gpu-monitor-umbrel/donmon-appstore-intel-gpu-monitor \
  /home/umbrel/umbrel/app-data/community-app-stores/donmon-appstore/

# Restart Umbrel
sudo reboot
```

---

## 📸 Screenshots

### Main Dashboard
![Main Dashboard](https://via.placeholder.com/800x600?text=Main+Dashboard+Screenshot)

*Real-time GPU metrics with engine breakdown and application detection*

### Umbrel Widget
![Umbrel Widget](https://via.placeholder.com/400x200?text=Widget+Screenshot)

*Quick GPU stats on your Umbrel homepage*

### Application Detection
![App Detection](https://via.placeholder.com/600x400?text=Application+Detection+Screenshot)

*See which apps are using your GPU with icons and process details*

---

## 🚀 Usage

### Accessing the Dashboard

After installation, access the app at:
```
http://umbrel.local:8847
```

Or click the **"Open"** button in your Umbrel App Store.

### Understanding the Metrics

| Metric | Description | Good Range |
|--------|-------------|------------|
| **GPU Usage** | Overall GPU utilization | 0-100% |
| **Frequency** | Current GPU clock speed | Varies by model |
| **Power** | Current power consumption | Lower is better when idle |
| **RC6 Idle** | % time in power-saving state | Higher is better (>90%) |

### Engine Details

- **Render/3D**: Used by games, 3D apps, desktop compositing
- **Blitter**: Memory operations, image processing
- **Video/0, Video/1**: Hardware video decoding (watching videos)
- **VideoEnhance**: Hardware video encoding (Plex/Jellyfin transcoding)

### Application Detection

The app automatically detects processes using the GPU and maps them to familiar Umbrel app names:

- **Plex Media Server** → Shows as "Plex" with icon
- **Jellyfin** → Shows as "Jellyfin" with icon
- **FFmpeg** → Shows as "FFmpeg" (encoding/transcoding)
- **intel_gpu_top** → Shows as "Intel GPU Monitor" (this app)

---

## 🔧 Configuration

### No Configuration Required!

Intel GPU Monitor works out of the box. However, you can customize some aspects:

### Environment Variables

Edit in `docker-compose.yml` (advanced users):

```yaml
environment:
  - NODE_ENV=production
  - PORT=8847
```

### Enabling GPU Access for Other Apps

To enable hardware acceleration in Plex, Jellyfin, etc.:

1. Ensure your app has `/dev/dri` device access
2. Enable hardware transcoding in the app's settings
3. Intel GPU Monitor will automatically detect usage

---

## 🐛 Troubleshooting

### Widget Not Showing Data

**Symptoms**: Widget appears on Umbrel homepage but shows no stats

**Solutions**:
1. **Reinstall the app** to ensure both containers are running:
   ```bash
   # Uninstall from Umbrel UI, then reinstall
   ```

2. **Check both containers are running**:
   ```bash
   docker ps | grep intel-gpu
   # Should show TWO containers: web_1 and widget-server_1
   ```

3. **Run the diagnostic script**:
   ```bash
   # Download and run the test script
   cd /tmp
   curl -O https://raw.githubusercontent.com/agent932/intel-gpu-monitor-umbrel/main/test-widget-server.sh
   chmod +x test-widget-server.sh
   ./test-widget-server.sh
   ```

4. **Check widget-server logs**:
   ```bash
   docker logs donmon-appstore-intel-gpu-monitor_widget-server_1
   ```

### GPU Not Detected

**Symptoms**: "GPU Not Available" error in dashboard

**Solutions**:
1. **Verify Intel GPU exists**:
   ```bash
   ls -la /dev/dri/
   # Should show renderD128 and card0
   ```

2. **Check intel-gpu-tools is installed** (inside container):
   ```bash
   docker exec donmon-appstore-intel-gpu-monitor_web_1 which intel_gpu_top
   ```

3. **Restart the app** from Umbrel UI

### No Applications Detected

**Symptoms**: "No other applications currently using the GPU" message

**Solutions**:
1. **This is normal if no other apps are using the GPU**
   - Start a Plex transcode or play a video
   
2. **Verify apps have GPU access**:
   ```bash
   # Check if Plex container has /dev/dri
   docker inspect plex_web_1 | grep -A 5 Devices
   ```

3. **Check privileged mode** (advanced):
   ```bash
   # Intel GPU Monitor needs privileged mode for process detection
   docker inspect donmon-appstore-intel-gpu-monitor_web_1 | grep Privileged
   # Should show "Privileged": true
   ```

### High CPU Usage

**Symptoms**: High CPU usage from intel_gpu_top

**Solutions**:
1. This is expected - `intel_gpu_top` polls GPU every 100ms
2. Typical usage: 1-3% CPU on modern Intel CPUs
3. If excessive, check for multiple instances running

### WebSocket Connection Issues

**Symptoms**: "Reconnecting..." status, no real-time updates

**Solutions**:
1. **Check port 8847 is accessible**:
   ```bash
   curl http://localhost:8847
   ```

2. **Verify no firewall blocking WebSocket** (port 8847/tcp)

3. **Check browser console** for errors (F12 in browser)

---

## 🏗️ Architecture

### Two-Service Design

Intel GPU Monitor uses a dual-container architecture for optimal performance:

```
┌─────────────────────────────────────┐
│         Main Application            │
│    (intel-gpu-monitor:latest)       │
├─────────────────────────────────────┤
│  Port: 8847                         │
│  - Web Dashboard (HTTP)             │
│  - WebSocket (Real-time updates)    │
│  - GPU Monitoring                   │
│  - Process Detection                │
│  - /api/processes endpoint          │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│         Widget Server               │
│  (intel-gpu-monitor-widget:latest)  │
├─────────────────────────────────────┤
│  Port: 80 (internal only)           │
│  - /widgets/gpu endpoint            │
│  - Independent GPU monitoring       │
│  - Lightweight & isolated           │
│  - Health check endpoint            │
└─────────────────────────────────────┘
```

**Why Two Containers?**
- **Widget Independence**: Widget server runs separately for reliability
- **Resource Isolation**: Main app and widget don't interfere
- **Follows Umbrel Patterns**: Matches official apps like Transmission
- **Better Performance**: Dedicated processes for each function

### Process Detection Methods

Intel GPU Monitor uses three fallback methods to detect GPU usage:

1. **Kernel DRI Clients** (Primary):
   - Reads `/sys/kernel/debug/dri/0/clients`
   - Most accurate and detailed
   - Requires privileged mode

2. **lsof Fallback**:
   - Lists open file descriptors on `/dev/dri/*`
   - Works when kernel debug unavailable

3. **fuser Last Resort**:
   - Finds PIDs using DRI devices
   - Minimal information but reliable

### Data Flow

```
intel_gpu_top (JSON mode)
    ↓
Parse GPU metrics
    ↓
Detect processes (every 2s)
    ↓
WebSocket broadcast
    ↓
Browser updates UI in real-time
```

---

## 🛠️ Development

### Building Locally

```bash
# Clone repository
git clone https://github.com/agent932/intel-gpu-monitor-umbrel.git
cd intel-gpu-monitor-umbrel/donmon-appstore-intel-gpu-monitor

# Build main image
docker build -t intel-gpu-monitor:local .

# Build widget server image
docker build -f Dockerfile.widget -t intel-gpu-monitor-widget:local .

# Run locally
docker-compose up
```

### Project Structure

```
donmon-appstore-intel-gpu-monitor/
├── docker-compose.yml          # Two-service orchestration
├── Dockerfile                  # Main app image
├── Dockerfile.widget           # Widget server image
├── server.js                   # Main Express + WebSocket server
├── widget-server.js            # Lightweight widget endpoint
├── umbrel-app.yml              # Umbrel app manifest
└── icon.svg                    # App icon
```

### Key Technologies

- **Backend**: Node.js 18, Express 4.18.2
- **Real-time**: WebSocket (ws 8.14.2)
- **GPU Monitoring**: intel-gpu-tools (`intel_gpu_top -J`)
- **Process Detection**: Linux kernel DRI clients, lsof, fuser
- **Frontend**: Vanilla JavaScript, CSS3
- **Container**: Docker, Docker Compose v3.7

### CI/CD Pipeline

GitHub Actions automatically builds and publishes Docker images:

```yaml
# .github/workflows/docker-build.yml
on:
  push:
    branches: [main]

# Builds:
# - ghcr.io/agent932/intel-gpu-monitor:latest
# - ghcr.io/agent932/intel-gpu-monitor-widget:latest
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Main dashboard HTML |
| `/ws` | WebSocket | Real-time GPU data stream |
| `/api/processes` | GET | Current GPU processes (JSON) |
| `/widgets/gpu` | GET | Widget data (widget-server only) |
| `/health` | GET | Health check (widget-server only) |

### WebSocket Message Format

```json
{
  "available": true,
  "data": {
    "engines": {
      "Render/3D": {"busy": 42.5, "sema": 0, "wait": 0},
      "Video/0": {"busy": 85.2, "sema": 0, "wait": 0}
    },
    "frequency": {"requested": 1100, "actual": 1100},
    "power": {"GPU": 25.5, "Package": 45.2},
    "rc6": {"value": 92.5}
  },
  "processes": [
    {
      "name": "plexmediaserver",
      "pid": 12345,
      "command": "/usr/lib/plexmediaserver/Plex Media Server"
    }
  ]
}
```

### Contributing

Contributions are welcome! Please follow these steps:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes**
4. **Test thoroughly**:
   ```bash
   # Test main app
   docker-compose up
   
   # Test widget endpoint
   curl http://localhost/widgets/gpu
   ```
5. **Commit**: `git commit -m 'Add amazing feature'`
6. **Push**: `git push origin feature/amazing-feature`
7. **Open a Pull Request**

### Testing

```bash
# Run diagnostic tests
./test-widget-server.sh

# Check container health
docker ps
docker logs donmon-appstore-intel-gpu-monitor_web_1
docker logs donmon-appstore-intel-gpu-monitor_widget-server_1

# Test API endpoints
curl http://localhost:8847/api/processes
curl http://localhost/widgets/gpu  # From widget-server container
```

---

## 📊 Supported Hardware

### Intel CPUs

Intel GPU Monitor works with any Intel CPU that has integrated graphics:

| Generation | Example CPUs | Notes |
|------------|--------------|-------|
| **6th Gen+** | Skylake, Kaby Lake, Coffee Lake | Recommended |
| **10th Gen+** | Ice Lake, Tiger Lake, Alder Lake | Best support |
| **12th Gen+** | Alder Lake, Raptor Lake | Latest features |

### Tested Platforms

- ✅ Intel NUC (various generations)
- ✅ Intel N100/N95/N5095 mini PCs
- ✅ Dell OptiPlex Micro
- ✅ HP EliteDesk Mini
- ✅ Custom builds with Intel CPUs

---

## 🤝 Community & Support

### Get Help

- **GitHub Issues**: [Report bugs or request features](https://github.com/agent932/intel-gpu-monitor-umbrel/issues)
- **Umbrel Community**: [Umbrel Community Forums](https://community.umbrel.com)
- **Discussions**: [GitHub Discussions](https://github.com/agent932/intel-gpu-monitor-umbrel/discussions)

### Useful Resources

- [Intel GPU Tools Documentation](https://manpages.ubuntu.com/manpages/focal/man1/intel_gpu_top.1.html)
- [Umbrel App Development](https://github.com/getumbrel/umbrel-apps)
- [Docker Documentation](https://docs.docker.com)

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Umbrel Team** - For the amazing home server platform
- **Intel** - For intel-gpu-tools
- **Community** - For testing and feedback

---

## 🗺️ Roadmap

### Planned Features

- [ ] Historical GPU usage graphs (24h, 7d, 30d)
- [ ] GPU temperature monitoring (if available)
- [ ] Alerts/notifications for high GPU usage
- [ ] Export metrics to Prometheus/Grafana
- [ ] Multi-GPU support
- [ ] Per-process GPU usage percentage
- [ ] Custom refresh intervals
- [ ] Dark/Light theme toggle
- [ ] Mobile app (React Native)

### Under Consideration

- AMD GPU support (amdgpu)
- NVIDIA GPU support (nvidia-smi)
- Container-level GPU usage metrics
- REST API for third-party integrations
- Detailed transcoding statistics

---

## 📈 Stats

![GitHub stars](https://img.shields.io/github/stars/agent932/intel-gpu-monitor-umbrel?style=social)
![GitHub forks](https://img.shields.io/github/forks/agent932/intel-gpu-monitor-umbrel?style=social)
![GitHub issues](https://img.shields.io/github/issues/agent932/intel-gpu-monitor-umbrel)
![GitHub pull requests](https://img.shields.io/github/issues-pr/agent932/intel-gpu-monitor-umbrel)

---

<div align="center">

**Made with ❤️ for the Umbrel community**

[⬆ Back to Top](#intel-gpu-monitor-for-umbrel)

</div>
