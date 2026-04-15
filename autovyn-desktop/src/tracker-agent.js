'use strict';

const crypto = require('crypto');
const os = require('os');
const { powerMonitor, desktopCapturer, screen } = require('electron');
const { ApiError, createApiClient, normalizeApiBaseUrl } = require('./api-client');
const { DEFAULT_SETTINGS } = require('./session-store');

const MIN_HEARTBEAT_SECONDS = 10;
const MAX_HEARTBEAT_SECONDS = 600;
const EVALUATION_INTERVAL_MS = 5000;
const SCREENSHOT_INTERVAL_MS = 5 * 60 * 1000;

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
  let refreshPromise = null;
  let powerEventsBound = false;

  const api = createApiClient(() => settings.apiBaseUrl);

  const persistState = () => {
    persisted = store.updateState((current) => ({
      ...current,
      deviceId,
      session,
      settings,
      pendingHeartbeats: Array.isArray(current.pendingHeartbeats) ? current.pendingHeartbeats : []
    }));
  };

  const setPendingHeartbeats = (payloads) => {
    persisted = store.updateState((current) => ({
      ...current,
      deviceId,
      session,
      settings,
      pendingHeartbeats: payloads
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
          throw new Error('Session expired. Please sign in again.');
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

  const captureAndUploadScreenshot = async () => {
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
          width: Math.round(width * scaleFactor * 0.5),
          height: Math.round(height * scaleFactor * 0.5)
        }
      });

      if (!sources.length) {
        return;
      }

      const thumbnail = sources[0].thumbnail;
      if (thumbnail.isEmpty()) {
        return;
      }

      const jpegBuffer = thumbnail.toJPEG(60);
      const dataUrl = `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;

      const payload = {
        imageData: dataUrl,
        deviceId,
        capturedAt: new Date().toISOString()
      };

      const trySend = async () => {
        await api.postScreenshot(session.accessToken, payload);
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
    } catch {
      // Silently ignore screenshot capture/upload failures.
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

      persistState();
      setAutoLaunch(settings.launchAtLogin);
      bindPowerEvents();
      resetRuntime();

      evaluationHandle = setInterval(evaluateTime, EVALUATION_INTERVAL_MS);
      flushHandle = setInterval(flush, Math.max(10, Number(settings.heartbeatIntervalSeconds) || 10) * 1000);
      screenshotHandle = setInterval(captureAndUploadScreenshot, SCREENSHOT_INTERVAL_MS);
      if (session) {
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
      void captureAndUploadScreenshot();
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
