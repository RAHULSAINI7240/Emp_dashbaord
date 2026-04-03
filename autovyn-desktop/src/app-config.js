'use strict';

const buildConfig = require('./build-config.json');

const normalizeDefaultApiBaseUrl = (value) => {
  const normalized = String(value || '').trim();
  return normalized || 'http://localhost:3001';
};

const DEFAULT_API_BASE_URL = normalizeDefaultApiBaseUrl(buildConfig.defaultApiBaseUrl);

module.exports = {
  DEFAULT_API_BASE_URL
};
