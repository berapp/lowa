const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// IPC handler to list files in the data directory for the renderer (secure)
ipcMain.handle('list-data-dir', (event) => {
  try {
    const candidates = [
      path.join(app.getAppPath(), 'data'),
      path.join(__dirname, '..', 'data'),
      path.join(process.cwd(), 'data'),
      path.join(__dirname, 'data')
    ];
    let dataDir = null;
    for (const c of candidates) {
      try {
        if (fs.existsSync(c) && fs.statSync(c).isDirectory()) {
          dataDir = c;
          break;
        }
      } catch (e) {
        // ignore and continue
      }
    }
    if (!dataDir) return { ok: false, error: 'data dir not found', candidates };
    const files = fs.readdirSync(dataDir).filter(f => /\.(csv|json)$/i.test(f)).sort();
    return { ok: true, files, dataDir };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// small diag handler
ipcMain.handle('diag-ping', () => ({ ok: true, ts: new Date().toISOString() }));

// GPS Serial Port handlers
ipcMain.handle('gps-list-serial-ports', async () => {
  try {
    // Try to import serialport - this will fail if not installed
    const { SerialPort } = require('serialport');
    const ports = await SerialPort.list();
    return { ok: true, ports: ports.map(p => ({ path: p.path, manufacturer: p.manufacturer, serialNumber: p.serialNumber })) };
  } catch (err) {
    return { ok: false, error: 'SerialPort module not available. Install with: npm install serialport', details: String(err) };
  }
});

ipcMain.handle('gps-open-serial-port', async (event, portPath, baudRate = 9600) => {
  try {
    const { SerialPort } = require('serialport');
    const { ReadlineParser } = require('@serialport/parser-readline');
    
    const port = new SerialPort({ path: portPath, baudRate: baudRate });
    const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));
    
    // Store port reference for cleanup
    event.sender.gpsSerialPort = port;
    
    // Forward GPS data to renderer
    parser.on('data', (line) => {
      if (line.startsWith('$GP') || line.startsWith('$GN')) {
        event.sender.send('gps-data', line);
      }
    });
    
    port.on('error', (err) => {
      event.sender.send('gps-error', String(err));
    });
    
    return { ok: true, message: `GPS serial port ${portPath} opened at ${baudRate} baud` };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('gps-close-serial-port', async (event) => {
  try {
    if (event.sender.gpsSerialPort) {
      event.sender.gpsSerialPort.close();
      event.sender.gpsSerialPort = null;
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload_secure.js'),
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  mainWindow.loadFile('index.html');

  // Open DevTools in development
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
