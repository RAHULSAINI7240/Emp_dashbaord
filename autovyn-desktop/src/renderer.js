'use strict';

const runtimeConfig = {
  defaultApiBaseUrl: 'http://localhost:3001'
};

const elements = {
  loginCard: document.getElementById('loginCard'),
  statusCard: document.getElementById('statusCard'),
  messageBanner: document.getElementById('messageBanner'),
  loginForm: document.getElementById('loginForm'),
  settingsForm: document.getElementById('settingsForm'),
  loginButton: document.getElementById('loginButton'),
  logoutButton: document.getElementById('logoutButton'),
  apiBaseUrl: document.getElementById('apiBaseUrl'),
  employeeId: document.getElementById('employeeId'),
  password: document.getElementById('password'),
  settingsApiBaseUrl: document.getElementById('settingsApiBaseUrl'),
  idleTimeoutSeconds: document.getElementById('idleTimeoutSeconds'),
  launchAtLogin: document.getElementById('launchAtLogin'),
  statusPill: document.getElementById('statusPill'),
  syncPill: document.getElementById('syncPill'),
  statusSubtitle: document.getElementById('statusSubtitle'),
  trackedValue: document.getElementById('trackedValue'),
  activeValue: document.getElementById('activeValue'),
  idleValue: document.getElementById('idleValue'),
  lastSyncValue: document.getElementById('lastSyncValue'),
  userValue: document.getElementById('userValue'),
  deviceValue: document.getElementById('deviceValue'),
  queueValue: document.getElementById('queueValue')
};

const toDuration = (totalSeconds) => {
  const safe = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const showMessage = (text, tone) => {
  elements.messageBanner.textContent = text;
  elements.messageBanner.className = `banner ${tone || 'info'}`;
};

const hideMessage = () => {
  elements.messageBanner.className = 'banner hidden';
  elements.messageBanner.textContent = '';
};

const getDefaultApiBaseUrl = () => runtimeConfig.defaultApiBaseUrl || 'http://localhost:3001';

const render = (state) => {
  const settings = state.settings || {};
  const user = state.user || {};
  const loggedIn = Boolean(state.loggedIn);

  elements.loginCard.classList.toggle('hidden', loggedIn);
  elements.statusCard.classList.toggle('hidden', !loggedIn);

  elements.apiBaseUrl.value = settings.apiBaseUrl || getDefaultApiBaseUrl();
  elements.settingsApiBaseUrl.value = settings.apiBaseUrl || getDefaultApiBaseUrl();
  elements.idleTimeoutSeconds.value = String(settings.idleTimeoutSeconds || 60);
  elements.launchAtLogin.checked = Boolean(settings.launchAtLogin);

  elements.statusPill.textContent = state.status || 'SIGNED_OUT';
  elements.syncPill.textContent = state.syncState || 'SIGNED_OUT';
  elements.statusPill.dataset.state = String(state.status || 'SIGNED_OUT').toLowerCase();
  elements.syncPill.dataset.state = String(state.syncState || 'SIGNED_OUT').toLowerCase();

  elements.statusSubtitle.textContent = loggedIn
    ? `Logged in as ${user.name || user.employeeId || 'Employee'} and tracking in the background.`
    : 'Sign in to start the background agent.';
  elements.trackedValue.textContent = toDuration(state.trackedSeconds);
  elements.activeValue.textContent = toDuration(state.activeSeconds);
  elements.idleValue.textContent = toDuration(state.idleSeconds);
  elements.lastSyncValue.textContent = state.lastSyncAt ? new Date(state.lastSyncAt).toLocaleString() : 'Not yet';
  elements.userValue.textContent = loggedIn ? `${user.name || '-'} (${user.employeeId || 'no employee id'})` : '-';
  elements.deviceValue.textContent = state.deviceId || '-';
  elements.queueValue.textContent = String(state.queuedHeartbeats || 0);

  if (state.lastError) {
    showMessage(state.lastError, 'danger');
  }
};

const refresh = async () => {
  const state = await window.autovynAgent.getState();
  render(state);
  if (!state.lastError) {
    hideMessage();
  }
};

const initializeConfig = async () => {
  try {
    const config = await window.autovynAgent.getConfig();
    runtimeConfig.defaultApiBaseUrl = String(config && config.defaultApiBaseUrl ? config.defaultApiBaseUrl : getDefaultApiBaseUrl());
  } catch {
    runtimeConfig.defaultApiBaseUrl = getDefaultApiBaseUrl();
  }
};

elements.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideMessage();
  elements.loginButton.disabled = true;

  try {
    const state = await window.autovynAgent.login({
      apiBaseUrl: elements.apiBaseUrl.value,
      employeeId: elements.employeeId.value,
      password: elements.password.value
    });
    elements.password.value = '';
    render(state);
    showMessage('Login successful. The desktop agent is now tracking in the background.', 'success');
  } catch (error) {
    showMessage(error && error.message ? error.message : 'Login failed.', 'danger');
  } finally {
    elements.loginButton.disabled = false;
  }
});

elements.logoutButton.addEventListener('click', async () => {
  hideMessage();

  try {
    const state = await window.autovynAgent.logout();
    render(state);
    showMessage('Logged out. Background tracking has stopped.', 'info');
  } catch (error) {
    showMessage(error && error.message ? error.message : 'Logout failed.', 'danger');
  }
});

elements.settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideMessage();

  try {
    const state = await window.autovynAgent.updateSettings({
      apiBaseUrl: elements.settingsApiBaseUrl.value,
      idleTimeoutSeconds: Number(elements.idleTimeoutSeconds.value),
      launchAtLogin: elements.launchAtLogin.checked
    });
    render(state);
    showMessage('Settings saved successfully.', 'success');
  } catch (error) {
    showMessage(error && error.message ? error.message : 'Could not save settings.', 'danger');
  }
});

setInterval(() => {
  void refresh();
}, 1500);

void initializeConfig().then(refresh);
