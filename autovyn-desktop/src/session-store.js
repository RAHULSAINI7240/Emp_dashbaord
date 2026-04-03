'use strict';

const fs = require('fs');
const path = require('path');
const { safeStorage } = require('electron');
const { DEFAULT_API_BASE_URL } = require('./app-config');

const DEFAULT_SETTINGS = {
  apiBaseUrl: DEFAULT_API_BASE_URL,
  idleTimeoutSeconds: 60,
  heartbeatIntervalSeconds: 10,
  launchAtLogin: true
};

const DEFAULT_STATE = {
  deviceId: null,
  session: null,
  settings: DEFAULT_SETTINGS,
  pendingHeartbeats: []
};

const mergeState = (state) => ({
  ...DEFAULT_STATE,
  ...state,
  settings: {
    ...DEFAULT_SETTINGS,
    ...(state && state.settings ? state.settings : {})
  },
  pendingHeartbeats: Array.isArray(state && state.pendingHeartbeats) ? state.pendingHeartbeats : []
});

const encodePayload = (value) => {
  const serialized = JSON.stringify(value);

  if (safeStorage.isEncryptionAvailable()) {
    return {
      encrypted: true,
      value: safeStorage.encryptString(serialized).toString('base64')
    };
  }

  return {
    encrypted: false,
    value: Buffer.from(serialized, 'utf8').toString('base64')
  };
};

const decodePayload = (payload) => {
  if (!payload || typeof payload.value !== 'string') {
    return DEFAULT_STATE;
  }

  const raw = Buffer.from(payload.value, 'base64');
  const text = payload.encrypted && safeStorage.isEncryptionAvailable()
    ? safeStorage.decryptString(raw)
    : raw.toString('utf8');

  return mergeState(JSON.parse(text));
};

const createSessionStore = (app) => {
  const filePath = path.join(app.getPath('userData'), 'agent-state.json');

  const ensureDirectory = () => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  };

  const readState = () => {
    try {
      ensureDirectory();
      if (!fs.existsSync(filePath)) {
        return mergeState();
      }

      const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return decodePayload(payload);
    } catch {
      return mergeState();
    }
  };

  const writeState = (nextState) => {
    ensureDirectory();
    fs.writeFileSync(filePath, JSON.stringify(encodePayload(mergeState(nextState)), null, 2), 'utf8');
  };

  return {
    getState() {
      return readState();
    },

    updateState(mutator) {
      const current = readState();
      const next = typeof mutator === 'function' ? mutator(current) : mutator;
      const merged = mergeState(next);
      writeState(merged);
      return merged;
    },

    clear() {
      writeState(mergeState());
    }
  };
};

module.exports = {
  DEFAULT_SETTINGS,
  createSessionStore
};
