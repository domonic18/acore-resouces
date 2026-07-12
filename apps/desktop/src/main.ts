import { app, BrowserWindow, ipcMain, Menu, dialog } from 'electron';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const BACKEND_COMMAND =
  process.env.ACORE_BACKEND_COMMAND || 'uv run uvicorn backend.app.main:app --port 8000';
const BACKEND_URL = process.env.ACORE_BACKEND_URL || 'http://localhost:8000';
const FRONTEND_DEV_URL = process.env.ACORE_FRONTEND_URL || 'http://localhost:5173';

function log(message: string) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${message}`);
}

async function waitForBackend(timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BACKEND_URL}/health`);
      if (res.ok) return;
    } catch {
      // 后端尚未就绪
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`后端在 ${timeoutMs}ms 内未就绪`);
}

function startBackend(): void {
  if (backendProcess) return;

  const [command, ...args] = BACKEND_COMMAND.split(' ');
  log(`启动后端: ${BACKEND_COMMAND} (cwd: ${PROJECT_ROOT})`);
  backendProcess = spawn(command, args, {
    cwd: PROJECT_ROOT,
    shell: false,
    stdio: 'pipe',
  });

  backendProcess.stdout?.on('data', (data: Buffer) => {
    log(`[backend] ${data.toString().trim()}`);
  });

  backendProcess.stderr?.on('data', (data: Buffer) => {
    log(`[backend:err] ${data.toString().trim()}`);
  });

  backendProcess.on('exit', (code) => {
    log(`后端进程退出，代码: ${code}`);
    backendProcess = null;
  });
}

function stopBackend(): void {
  if (!backendProcess) return;
  log('停止后端进程');
  backendProcess.kill('SIGTERM');
  backendProcess = null;
}

async function restartBackend(): Promise<void> {
  stopBackend();
  await new Promise((resolve) => setTimeout(resolve, 500));
  startBackend();
  await waitForBackend();
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '..', '..', 'web', 'dist', 'index.html'));
  } else {
    mainWindow.loadURL(FRONTEND_DEV_URL);
    mainWindow.webContents.openDevTools();
  }

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '视图',
      submenu: [
        { label: '刷新', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.webContents.reload() },
        { label: '开发者工具', accelerator: 'F12', click: () => mainWindow?.webContents.toggleDevTools() },
      ],
    },
    {
      label: '后端',
      submenu: [
        { label: '重启后端', click: async () => {
          try {
            await restartBackend();
            await dialog.showMessageBox(mainWindow!, { message: '后端已重启' });
          } catch (err) {
            await dialog.showErrorBox('重启失败', err instanceof Error ? err.message : String(err));
          }
        }},
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  startBackend();
  try {
    await waitForBackend();
  } catch (err) {
    dialog.showErrorBox('后端启动失败', err instanceof Error ? err.message : String(err));
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('backend:restart', async () => {
  await restartBackend();
  return { ok: true };
});

ipcMain.handle('app:version', () => app.getVersion());
