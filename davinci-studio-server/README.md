# DaVinci Resolve Studio Server for Umbrel

This Umbrel app provides a central project server for Blackmagic Design's DaVinci Resolve, enabling collaboration on video editing and color grading projects.

## Installation

Install this app through the Umbrel app store.

## Configuration

- **Timezone**: Set your server's timezone (e.g., Europe/London, America/New_York). Defaults to Europe/London if not specified.

## Usage

After installation, access the web interface at the app's URL (port 8543).

DaVinci Resolve clients can connect to the server using the exposed ports (5432 for database, 50059 for collaboration).

## Data Storage

Project databases, backups, hooks, and jobs are stored in the app's data directory.

## Based on

This app is based on [Studio Server](https://wirebear.co.uk/software/studio-server) by WireBear.