'use strict';

const { DEFAULT_API_BASE_URL } = require('./app-config');
const INVALID_API_BASE_URL_MESSAGE = 'Enter a valid backend URL like http://localhost:3001 or http://localhost:3001/api.';

class ApiError extends Error {
  constructor(message, statusCode, errorCode) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

const normalizePathPrefix = (pathname) => {
  const trimmed = String(pathname || '/').replace(/\/+$/, '') || '/';
  const match = trimmed.match(/^(.*?)(?:\/api(?:\/.*)?$)/i);
  const prefix = match ? (match[1] || '/') : trimmed;
  return prefix === '/' ? '' : prefix.replace(/\/+$/, '');
};

const normalizeApiBaseUrl = (input) => {
  const value = String(input || DEFAULT_API_BASE_URL).trim();

  try {
    const parsed = new URL(value);
    return `${parsed.origin}${normalizePathPrefix(parsed.pathname)}`;
  } catch {
    throw new Error(INVALID_API_BASE_URL_MESSAGE);
  }
};

const request = async (baseUrl, endpoint, options = {}) => {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), options.timeoutMs || 15000);

  try {
    const url = new URL(`${normalizeApiBaseUrl(baseUrl)}${endpoint}`);

    if (options.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, String(value));
        }
      });
    }

    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });

    const parsed = await response.json().catch(() => undefined);
    if (!response.ok) {
      throw new ApiError(
        parsed && parsed.message ? parsed.message : `Request failed with status ${response.status}.`,
        response.status,
        parsed && parsed.errorCode ? parsed.errorCode : undefined
      );
    }

    if (!parsed || typeof parsed !== 'object' || !('data' in parsed)) {
      throw new Error('Server returned an empty response.');
    }

    return parsed.data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error && error.name === 'AbortError') {
      throw new ApiError('Request timed out. Check that the backend is running and reachable.', 408, 'REQUEST_TIMEOUT');
    }

    if (error instanceof TypeError) {
      throw new ApiError('Could not reach the backend. Check the backend URL and whether the server is running.', 503, 'BACKEND_UNREACHABLE');
    }

    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
};

const createApiClient = (getBaseUrl) => ({
  normalizeApiBaseUrl,

  async login(loginId, password) {
    return request(getBaseUrl(), '/api/auth/login', {
      method: 'POST',
      body: {
        loginId,
        password
      }
    });
  },

  async refreshSession(refreshToken) {
    return request(getBaseUrl(), '/api/auth/refresh', {
      method: 'POST',
      body: { refreshToken }
    });
  },

  async logout(refreshToken) {
    return request(getBaseUrl(), '/api/auth/logout', {
      method: 'POST',
      body: { refreshToken }
    });
  },

  async postHeartbeat(accessToken, payload) {
    return request(getBaseUrl(), '/api/worklog/heartbeat', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: payload
    });
  },

  async postPresence(accessToken, payload) {
    return request(getBaseUrl(), '/api/worklog/presence', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: payload
    });
  }
});

module.exports = {
  ApiError,
  DEFAULT_API_BASE_URL,
  createApiClient,
  normalizeApiBaseUrl
};
