'use strict';

const crypto = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { powerMonitor, desktopCapturer, screen } = require('electron');
const { ApiError, createApiClient, normalizeApiBaseUrl } = require('./api-client');
const { DEFAULT_SETTINGS } = require('./session-store');

const MIN_HEARTBEAT_SECONDS = 10;
const MAX_HEARTBEAT_SECONDS = 600;
const EVALUATION_INTERVAL_MS = 5000;
const SCREENSHOT_INTERVAL_MS = 60 * 1000;
const SCREENSHOT_FLUSH_INTERVAL_MS = 10 * 1000;
const SCREENSHOT_UPLOAD_BATCH_SIZE = 50;
const SCREENSHOT_RETENTION_MS = 2 * 24 * 60 * 60 * 1000;
const MAX_PENDING_SCREENSHOTS = 3000;

const createRuntime = () => {
  const now = Date.now();
  return {
    sessionStartedAt: now,
    lastEvaluationAt: now,
    activeMs: 0,
    idleMs: 0,
    pendingActiveMs: 0,
    pendingIdleMs: 0,
    lastSyncAt: null,
    lastError: null,
    locked: false,
    sending: false,
    syncState: 'SIGNED_OUT'
  };
};

const createTrackerAgent = ({ app, store, onStateChange }) => {
  let persisted = store.getState();
  let session = persisted.session;
  let settings = { ...DEFAULT_SETTINGS, ...persisted.settings };
  let deviceId = persisted.deviceId || `${os.hostname()}-${crypto.randomUUID()}`;
  let runtime = createRuntime();
  let evaluationHandle = null;
  let flushHandle = null;
  let screenshotHandle = null;
  let screenshotFlushHandle = null;
  let refreshPromise = null;
  let powerEventsBound = false;

  const api = createApiClient(() => settings.apiBaseUrl);

  const persistState = () => {
    persisted = store.updateState((current) => ({
      ...current,
      deviceId,
      session,
      settings,
      pendingHeartbeats: Array.isArray(current.pendingHeartbeats) ? current.pendingHeartbeats : [],
      pendingScreenshots: Array.isArray(current.pendingScreenshots) ? current.pendingScreenshots : []
    }));
  };

  const setPendingHeartbeats = (payloads) => {
    persisted = store.updateState((current) => ({
      ...current,
      deviceId,
      session,
      settings,
      pendingHeartbeats: payloads,
      pendingScreenshots: Array.isArray(current.pendingScreenshots) ? current.pendingScreenshots : []
    }));
  };

  const setPendingScreenshots = (items) => {
    persisted = store.updateState((current) => ({
      ...current,
      deviceId,
      session,
      settings,
      pendingHeartbeats: Array.isArray(current.pendingHeartbeats) ? current.pendingHeartbeats : [],
      pendingScreenshots: items
    }));
  };

  const emitChange = () => {
    if (typeof onStateChange === 'function') {
      onStateChange(getSnapshot());
    }
  };

  const resetRuntime = () => {
    runtime = createRuntime();
    runtime.syncState = session ? 'PENDING' : 'SIGNED_OUT';
    emitChange();
  };

  const getIdleTimeoutMs = () => Math.max(60, Number(settings.idleTimeoutSeconds) || 60) * 1000;

  const getSystemIdleMs = () => {
    try {
      return Math.max(0, powerMonitor.getSystemIdleTime()) * 1000;
    } catch {
      return 0;
    }
  };

  const getCurrentStatus = () => {
    if (!session) return 'SIGNED_OUT';
    if (runtime.sending) return 'SYNCING';
    if (runtime.locked) return 'IDLE';
    return getSystemIdleMs() >= getIdleTimeoutMs() ? 'IDLE' : 'ACTIVE';
  };

  const getTrackedSeconds = () => Math.floor((runtime.activeMs + runtime.idleMs) / 1000);

  const isScreenshotFresh = (capturedAt) => {
    const capturedMs = new Date(capturedAt).getTime();
    if (Number.isNaN(capturedMs)) {
      return false;
    }

    return Date.now() - capturedMs <= SCREENSHOT_RETENTION_MS;
  };

  const normalizeScreenshotQueue = (items) => (
    (Array.isArray(items) ? items : [])
      .filter((item) => (
        item &&
        typeof item.imageData === 'string' &&
        typeof item.capturedAt === 'string' &&
        isScreenshotFresh(item.capturedAt)
      ))
      .slice(-MAX_PENDING_SCREENSHOTS)
  );

  const saveScreenshotQueue = (items) => {
    screenshotQueue = normalizeScreenshotQueue(items);
    setPendingScreenshots(screenshotQueue);
  };

  const evaluateTime = () => {
    const now = Date.now();
    const elapsedMs = now - runtime.lastEvaluationAt;
    if (!session || elapsedMs <= 0) {
      runtime.lastEvaluationAt = now;
      return;
    }

    const idleMs = getSystemIdleMs();
    const inactive = runtime.locked || idleMs >= getIdleTimeoutMs();

    if (inactive) {
      runtime.idleMs += elapsedMs;
      runtime.pendingIdleMs += elapsedMs;
    } else {
      runtime.activeMs += elapsedMs;
      runtime.pendingActiveMs += elapsedMs;
    }

    runtime.lastEvaluationAt = now;
    runtime.syncState = runtime.lastSyncAt ? runtime.syncState : 'PENDING';
    emitChange();
  };

  const buildPayloads = (pendingMs, status, recordedAt) => {
    const payloads = [];
    let remainingSeconds = Math.floor(pendingMs / 1000);
    let sentMs = 0;

    while (remainingSeconds >= MIN_HEARTBEAT_SECONDS) {
      const durationSeconds = Math.min(remainingSeconds, MAX_HEARTBEAT_SECONDS);
      payloads.push({
        status,
        durationSeconds,
        recordedAt,
        deviceId,
        editor: 'desktop-agent',
        isFocused: status === 'ACTIVE'
      });
      remainingSeconds -= durationSeconds;
      sentMs += durationSeconds * 1000;
    }

    return {
      payloads,
      sentMs
    };
  };

  const announcePresence = async (status, isFocused) => {
    if (!session) {
      return;
    }

    const payload = {
      status,
      recordedAt: new Date().toISOString(),
      deviceId,
      editor: 'desktop-agent',
      isFocused
    };

    const trySend = async () => {
      await api.postPresence(session.accessToken, payload);
    };

    try {
      await trySend();
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 401) {
        const refreshed = await refreshSession().catch(() => null);
        if (refreshed) {
          await trySend().catch(() => undefined);
        }
      }
    }
  };

  const buildHeartbeatBatch = () => {
    evaluateTime();
    const recordedAt = new Date().toISOString();
    const activeBatch = buildPayloads(runtime.pendingActiveMs, 'ACTIVE', recordedAt);
    const idleBatch = buildPayloads(runtime.pendingIdleMs, 'INACTIVE', recordedAt);

    return {
      payloads: [...activeBatch.payloads, ...idleBatch.payloads],
      sentActiveMs: activeBatch.sentMs,
      sentIdleMs: idleBatch.sentMs
    };
  };

  const refreshSession = async () => {
    if (!session) {
      return null;
    }

    if (refreshPromise) {
      return refreshPromise;
    }

    refreshPromise = (async () => {
      const response = await api.refreshSession(session.refreshToken);
      session = {
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        user: response.user
      };
      persistState();
      return session;
    })();

    try {
      return await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  };

  const sendHeartbeats = async (payloads) => {
    if (!session || !payloads.length) {
      return;
    }

    const trySend = async () => {
      for (const payload of payloads) {
        await api.postHeartbeat(session.accessToken, payload);
      }
    };

    try {
      await trySend();
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 401) {
        const refreshed = await refreshSession().catch(() => null);
        if (!refreshed) {
          throw new Error('Tracking continues locally. Authentication will be retried automatically.');
        }

        await trySend();
        return;
      }

      throw error;
    }
  };

  const flush = async () => {
    if (!session || runtime.sending) {
      return;
    }

    const queued = Array.isArray(store.getState().pendingHeartbeats) ? store.getState().pendingHeartbeats : [];
    const fresh = buildHeartbeatBatch();
    const payloads = [...queued, ...fresh.payloads];
    if (!payloads.length) {
      return;
    }

    runtime.sending = true;
    runtime.syncState = 'SYNCING';
    emitChange();

    try {
      await sendHeartbeats(payloads);
      runtime.pendingActiveMs = Math.max(0, runtime.pendingActiveMs - fresh.sentActiveMs);
      runtime.pendingIdleMs = Math.max(0, runtime.pendingIdleMs - fresh.sentIdleMs);
      runtime.lastSyncAt = new Date().toISOString();
      runtime.lastError = null;
      runtime.syncState = 'CONNECTED';
      setPendingHeartbeats([]);
      emitChange();
    } catch (error) {
      runtime.pendingActiveMs = Math.max(0, runtime.pendingActiveMs - fresh.sentActiveMs);
      runtime.pendingIdleMs = Math.max(0, runtime.pendingIdleMs - fresh.sentIdleMs);
      runtime.lastError = error instanceof Error ? error.message : 'Unknown sync error.';
      runtime.syncState = session ? 'ERROR' : 'SIGNED_OUT';
      setPendingHeartbeats(payloads);
      emitChange();
    } finally {
      runtime.sending = false;
      emitChange();
    }
  };

  const bindPowerEvents = () => {
    if (powerEventsBound) {
      return;
    }

    powerEventsBound = true;

    powerMonitor.on('lock-screen', () => {
      evaluateTime();
      runtime.locked = true;
      void announcePresence('IDLE', false);
      emitChange();
    });

    powerMonitor.on('unlock-screen', () => {
      runtime.locked = false;
      runtime.lastEvaluationAt = Date.now();
      void announcePresence('ACTIVE', true);
      emitChange();
    });

    powerMonitor.on('suspend', () => {
      evaluateTime();
      runtime.locked = true;
      void announcePresence('IDLE', false);
      emitChange();
    });

    powerMonitor.on('resume', () => {
      runtime.locked = false;
      runtime.lastEvaluationAt = Date.now();
      void announcePresence('ACTIVE', true);
      emitChange();
    });
  };

  const setAutoLaunch = (enabled) => {
    if (process.platform === 'linux') {
      const autostartDir = path.join(app.getPath('home'), '.config', 'autostart');
      const desktopFilePath = path.join(autostartDir, 'autovyn-desktop.desktop');
      const quoteDesktopExecArg = (value) => `"${String(value).replace(/(["\\`$])/g, '\\$1')}"`;
      const execParts = [quoteDesktopExecArg(process.execPath)];

      if (!app.isPackaged) {
        execParts.push(quoteDesktopExecArg(app.getAppPath()));
      }

      execParts.push('--autostart');
      execParts.push('--hidden');

      const desktopEntry = [
        '[Desktop Entry]',
        'Type=Application',
        'Version=1.0',
        'Name=Autovyn Desktop',
        'Comment=Autovyn background tracker',
        `Exec=${execParts.join(' ')}`,
        'Terminal=false',
        'X-GNOME-Autostart-enabled=true',
        'StartupNotify=false'
      ].join('\n');

      try {
        if (enabled) {
          fs.mkdirSync(autostartDir, { recursive: true });
          fs.writeFileSync(desktopFilePath, `${desktopEntry}\n`, 'utf8');
        } else if (fs.existsSync(desktopFilePath)) {
          fs.unlinkSync(desktopFilePath);
        }
      } catch {
        // Ignore unsupported desktop environments during local development.
      }

      return;
    }

    try {
      app.setLoginItemSettings({
        openAtLogin: Boolean(enabled),
        openAsHidden: true,
        args: ['--autostart']
      });
    } catch {
      // Ignore unsupported platforms during local development.
    }
  };

  let screenshotQueue = normalizeScreenshotQueue(persisted.pendingScreenshots);
  let flushingScreenshots = false;

  /**
   * Silent native screenshot for Linux — bypasses the XDG portal entirely.
   * Tries scrot → import (ImageMagick) → gnome-screenshot → grim in order.
   * Returns a base64 JPEG data-URL or null on failure.
   */
  const captureScreenshotNative = () => {
    if (process.platform !== 'linux') return Promise.resolve(null);

    const tmpFile = path.join(os.tmpdir(), `avyn-cap-${Date.now()}.jpg`);
    const tools = [
      { cmd: 'scrot', args: ['-o', '-q', '25', tmpFile] },
      { cmd: 'import', args: ['-window', 'root', '-quality', '25', tmpFile] },
      { cmd: 'gnome-screenshot', args: ['-f', tmpFile] },
      { cmd: 'grim', args: [tmpFile] }
    ];

    const tryTool = (index) =>
      new Promise((resolve) => {
        if (index >= tools.length) return resolve(null);

        const { cmd, args } = tools[index];
        execFile(cmd, args, { timeout: 8000 }, (err) => {
          if (err) return resolve(tryTool(index + 1));

          try {
            const buf = fs.readFileSync(tmpFile);
            fs.unlink(tmpFile, () => {});
            if (buf.length < 200) return resolve(tryTool(index + 1));
            resolve(`data:image/jpeg;base64,${buf.toString('base64')}`);
          } catch {
            resolve(tryTool(index + 1));
          }
        });
      });

    return tryTool(0);
  };

  const captureScreenshot = async () => {
    if (!session || runtime.locked) {
      return;
    }

    try {
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width, height } = primaryDisplay.size;
      const scaleFactor = primaryDisplay.scaleFactor || 1;

      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.round(width * scaleFactor * 0.15),
          height: Math.round(height * scaleFactor * 0.15)
        }
      });

      let dataUrl = null;

      if (sources.length) {
        const thumbnail = sources[0].thumbnail;
        if (!thumbnail.isEmpty()) {
          const jpegBuffer = thumbnail.toJPEG(25);
          dataUrl = `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;
        }
      }

      // Fallback to native tool on Linux if desktopCapturer returned nothing
      if (!dataUrl && process.platform === 'linux') {
        dataUrl = await captureScreenshotNative();
      }

      if (!dataUrl) return;

      saveScreenshotQueue([...screenshotQueue, {
        imageData: dataUrl,
        deviceId,
        capturedAt: new Date().toISOString()
      }]);
      void flushScreenshots();
    } catch {
      // Silently ignore capture failures.
    }
  };

  const flushScreenshots = async () => {
    if (!session || flushingScreenshots || !screenshotQueue.length) {
      return;
    }

    flushingScreenshots = true;
    saveScreenshotQueue(screenshotQueue);

    try {
      while (session && screenshotQueue.length) {
        const batch = screenshotQueue.slice(0, SCREENSHOT_UPLOAD_BATCH_SIZE);
        const trySend = async () => {
          await api.postScreenshots(session.accessToken, batch);
        };

        try {
          await trySend();
          saveScreenshotQueue(screenshotQueue.slice(batch.length));
        } catch (error) {
          if (error instanceof ApiError && error.statusCode === 401) {
            const refreshed = await refreshSession().catch(() => null);
            if (refreshed) {
              await trySend();
              saveScreenshotQueue(screenshotQueue.slice(batch.length));
              continue;
            }
          }

          saveScreenshotQueue(screenshotQueue);
          break;
        }
      }
    } catch {
      saveScreenshotQueue(screenshotQueue);
    } finally {
      flushingScreenshots = false;
    }
  };

  const wasOpenedFromStartup = () => {
    if (process.argv.includes('--autostart') || process.argv.includes('--hidden')) {
      return true;
    }

    try {
      const loginItemSettings = app.getLoginItemSettings();
      return Boolean(loginItemSettings.wasOpenedAtLogin || loginItemSettings.wasOpenedAsHidden);
    } catch {
      return false;
    }
  };

  const getSnapshot = () => ({
    loggedIn: Boolean(session),
    user: session ? session.user : null,
    settings,
    deviceId,
    status: getCurrentStatus(),
    syncState: runtime.syncState,
    lastError: runtime.lastError,
    lastSyncAt: runtime.lastSyncAt,
    sessionStartedAt: session ? new Date(runtime.sessionStartedAt).toISOString() : null,
    activeSeconds: Math.floor(runtime.activeMs / 1000),
    idleSeconds: Math.floor(runtime.idleMs / 1000),
    trackedSeconds: getTrackedSeconds(),
    queuedHeartbeats: store.getState().pendingHeartbeats.length
  });

  return {
    start() {
      persisted = store.getState();
      settings = { ...DEFAULT_SETTINGS, ...persisted.settings };
      session = persisted.session;
      deviceId = persisted.deviceId || deviceId;
      screenshotQueue = normalizeScreenshotQueue(persisted.pendingScreenshots);

      persistState();
      setAutoLaunch(settings.launchAtLogin);
      bindPowerEvents();
      resetRuntime();

      evaluationHandle = setInterval(evaluateTime, EVALUATION_INTERVAL_MS);
      flushHandle = setInterval(flush, Math.max(10, Number(settings.heartbeatIntervalSeconds) || 10) * 1000);
      screenshotHandle = setInterval(captureScreenshot, SCREENSHOT_INTERVAL_MS);
      screenshotFlushHandle = setInterval(flushScreenshots, SCREENSHOT_FLUSH_INTERVAL_MS);
      if (session) {
        void flushScreenshots();
        // Validate the persisted session by refreshing the token.
        // If it fails, keep the old session and try again on next flush.
        refreshSession()
          .then(() => announcePresence('ACTIVE', !runtime.locked))
          .catch(() => announcePresence('ACTIVE', !runtime.locked).catch(() => undefined));
      }
      emitChange();
    },

    stop() {
      if (evaluationHandle) {
        clearInterval(evaluationHandle);
        evaluationHandle = null;
      }

      if (flushHandle) {
        clearInterval(flushHandle);
        flushHandle = null;
      }

      if (screenshotHandle) {
        clearInterval(screenshotHandle);
        screenshotHandle = null;
      }

      if (screenshotFlushHandle) {
        clearInterval(screenshotFlushHandle);
        screenshotFlushHandle = null;
      }
    },

    async login({ loginId, password, apiBaseUrl }) {
      if (apiBaseUrl) {
        settings.apiBaseUrl = normalizeApiBaseUrl(apiBaseUrl);
      }

      const normalizedLoginId = String(loginId || '').trim().toUpperCase();
      const response = await api.login(normalizedLoginId, password);
      session = {
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        user: response.user
      };
      settings.launchAtLogin = true;
      persistState();
      setAutoLaunch(true);
      resetRuntime();
      await announcePresence('ACTIVE', true);
      void captureScreenshot();
      emitChange();
      return getSnapshot();
    },

    async logout() {
      evaluateTime();
      await flush().catch(() => undefined);

      if (session) {
        await announcePresence('OFFLINE', false);
        await api.logout(session.refreshToken).catch(() => undefined);
      }

      session = null;
      setPendingHeartbeats([]);
      saveScreenshotQueue([]);
      persistState();
      resetRuntime();
      emitChange();
      return getSnapshot();
    },

    updateSettings(nextSettings) {
      settings = {
        ...settings,
        ...nextSettings,
        apiBaseUrl: normalizeApiBaseUrl(nextSettings.apiBaseUrl || settings.apiBaseUrl),
        idleTimeoutSeconds: Math.max(60, Number(nextSettings.idleTimeoutSeconds) || settings.idleTimeoutSeconds)
      };

      persistState();
      setAutoLaunch(settings.launchAtLogin);

      if (flushHandle) {
        clearInterval(flushHandle);
      }

      flushHandle = setInterval(flush, Math.max(10, Number(settings.heartbeatIntervalSeconds) || 10) * 1000);
      emitChange();
      return getSnapshot();
    },

    getSnapshot,
    shouldShowWindowOnLaunch: () => !session,
    flush
  };
};

module.exports = {
  createTrackerAgent
};
