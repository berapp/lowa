# LOWA Electron Application

Large Outdoor Wifi Analysis - Electron Desktop Application

## Overview

This is a clean Electron.js application for the LOWA project, designed to provide a desktop interface for WiFi network analysis.

## Prerequisites

- Node.js (v16 or higher recommended)
- npm (comes with Node.js)

## Installation

1. Navigate to the app directory:
```bash
cd app
```

2. Install dependencies:
```bash
npm install
```

## Running the Application

To start the Electron application:

```bash
npm start
```

## Project Structure

```
app/
├── main.js           # Electron main process (entry point)
├── preload.js        # Preload script for secure context bridge
├── index.html        # Main UI interface
├── renderer.js       # Renderer process script
├── package.json      # Project configuration and dependencies
└── .gitignore        # Git ignore rules
```

## Features

- Clean, modern UI with gradient design
- Displays Node.js, Chrome, and Electron version information
- Sample button interaction demonstrating event handling
- Security-conscious setup with Context Isolation enabled

## Security

This application follows Electron security best practices:
- Context Isolation is enabled
- Node Integration is disabled in the renderer process
- Content Security Policy is implemented
- Preload script is used for secure communication

## Development

To modify the application:

1. Edit `main.js` for main process logic
2. Edit `index.html` for UI changes
3. Edit `renderer.js` for renderer process logic
4. Use `preload.js` to expose APIs securely to the renderer

## License

ISC
