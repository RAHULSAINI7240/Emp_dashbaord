import * as path from 'path';
import * as vscode from 'vscode';
import { ApiRequestError, ApiService, WorklogHeartbeatPayload, WorklogSummaryEmployee } from './apiService';
import { AuthService, AuthSession } from './authService';
import { buildOllamaPrompt, buildSummaryMarkdown, LocalActivitySnapshot } from './summaryFormatter';

type ActivityStatus = 'tracking' | 'active' | 'idle' | 'loggedOut' | 'reconnect';

interface TrackerState {
  sessionStart: number;
  activeTimeMs: number;
  idleTimeMs: number;
  pendingActiveTimeMs: number;
  pendingIdleTimeMs: number;
  filesEdited: Set<string>;
  eventCounts: Record<string, number>;
  lastActivityAt: number;
  lastEvaluationAt: number;
  isWindowFocused: boolean;
}

interface HeartbeatBatch {
  payloads: WorklogHeartbeatPayload[];
  sentActiveTimeMs: number;
  sentIdleTimeMs: number;
}

const LIVE_EVALUATION_MS = 5_000;
const HEARTBEAT_FLUSH_MS = 10_000;
const MIN_HEARTBEAT_SECONDS = 10;
const MAX_HEARTBEAT_SECONDS = 600;
const RECONNECT_RETRY_MS = 30_000;

export class ActivityTracker implements vscode.Disposable {
  private readonly statusBarItem: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];
  private state: TrackerState;
  private authSession: AuthSession | undefined;
  private timerHandle: NodeJS.Timeout | undefined;
  private senderHandle: NodeJS.Timeout | undefined;
  private sending = false;
  private reauthRequired = false;
  private lastSyncAt: number | undefined;
  private reconnectWarningShown = false;
  private lastReconnectAttemptAt = 0;
  private refreshPromise: Promise<AuthSession | undefined> | undefined;

  constructor(
    private readonly authService: AuthService,
    private readonly apiService: ApiService
  ) {
    const now = Date.now();
    this.state = {
      sessionStart: now,
      activeTimeMs: 0,
      idleTimeMs: 0,
      pendingActiveTimeMs: 0,
      pendingIdleTimeMs: 0,
      filesEdited: new Set<string>(),
      eventCounts: this.createInitialEventCounts(),
      lastActivityAt: now,
      lastEvaluationAt: now,
      isWindowFocused: vscode.window.state.focused
    };

    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBarItem.command = 'autovyn.showActivitySummary';
    this.statusBarItem.show();
    this.setStatus('loggedOut');
  }

  async initialize(): Promise<void> {
    this.authSession = await this.authService.getSession();
    this.registerEventListeners();
    this.startLoops();
    this.refreshStatusBar();
  }

  async login(): Promise<boolean> {
    this.authSession = await this.authService.login();
    if (!this.authSession) {
      this.refreshStatusBar();
      return false;
    }

    this.reauthRequired = false;
    this.lastSyncAt = undefined;
    this.reconnectWarningShown = false;
    this.resetSessionClock();
    this.refreshStatusBar();
    return true;
  }

  async ensureLoggedIn(): Promise<boolean> {
    this.authSession = await this.authService.ensureLoggedIn();
    if (this.authSession) {
      this.reauthRequired = false;
      this.reconnectWarningShown = false;
    }
    this.refreshStatusBar();
    return Boolean(this.authSession);
  }

  async logout(): Promise<void> {
    await this.flushActivity();
    await this.authService.logout();
    this.authSession = undefined;
    this.reauthRequired = false;
    this.lastSyncAt = undefined;
    this.reconnectWarningShown = false;
    this.resetSessionClock();
    this.refreshStatusBar();
  }

  async getDetailedSummaryMarkdown(): Promise<string> {
    this.evaluateTime();
    let remoteSummary: WorklogSummaryEmployee | undefined;
    try {
      remoteSummary = await this.fetchWorklogSummary();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown backend summary error.';
      console.error('Autovyn backend summary failed:', message);
    }

    const localSnapshot = this.buildLocalSnapshot();

    let aiSummary: string | undefined;
    if (this.apiService.getSummaryProvider() === 'ollama') {
      try {
        aiSummary = await this.apiService.generateSummaryWithOllama(buildOllamaPrompt(localSnapshot, remoteSummary));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown Ollama error.';
        console.error('Autovyn summary generation failed:', message);
        aiSummary = 'AI summary is unavailable right now. Verify that Ollama is running locally and the configured model is installed.';
      }
    }

    return buildSummaryMarkdown(localSnapshot, remoteSummary, aiSummary);
  }

  dispose(): void {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
    }

    if (this.senderHandle) {
      clearInterval(this.senderHandle);
    }

    vscode.Disposable.from(this.statusBarItem, ...this.disposables).dispose();
  }

  private registerEventListeners(): void {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        this.recordActivity('textChange', { document: event.document, trackFile: true });
      }),
      vscode.workspace.onDidSaveTextDocument((document) => {
        this.recordActivity('save', { document, trackFile: true });
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        this.recordActivity('activeEditor', { document: editor?.document });
      }),
      vscode.window.onDidChangeTextEditorSelection((event) => {
        this.recordActivity('selection', { document: event.textEditor.document });
      }),
      vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
        this.recordActivity('visibleRange', { document: event.textEditor.document });
      }),
      vscode.workspace.onDidOpenTextDocument((document) => {
        this.recordActivity('openDocument', { document });
      }),
      vscode.window.onDidChangeActiveTerminal(() => {
        this.recordActivity('activeTerminal');
      }),
      vscode.workspace.onDidCreateFiles((event) => {
        this.recordUris('createFiles', event.files);
      }),
      vscode.workspace.onDidRenameFiles((event) => {
        this.recordUris(
          'renameFiles',
          event.files.map((entry) => entry.newUri)
        );
      }),
      vscode.workspace.onDidDeleteFiles((event) => {
        this.recordUris('deleteFiles', event.files);
      }),
      vscode.window.onDidChangeWindowState((windowState) => {
        this.evaluateTime();
        this.state.isWindowFocused = windowState.focused;
        this.incrementEvent('windowFocus');
        if (windowState.focused) {
          this.state.lastActivityAt = Date.now();
        }
        this.refreshStatusBar();
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          event.affectsConfiguration('autovyn.idleTimeout') ||
          event.affectsConfiguration('autovyn.apiUrl') ||
          event.affectsConfiguration('autovyn.summaryProvider') ||
          event.affectsConfiguration('autovyn.ollamaUrl') ||
          event.affectsConfiguration('autovyn.ollamaModel')
        ) {
          this.refreshStatusBar();
        }
      })
    );
  }

  private startLoops(): void {
    this.timerHandle = setInterval(() => {
      this.evaluateTime();
      this.refreshStatusBar();
    }, LIVE_EVALUATION_MS);

    this.senderHandle = setInterval(() => {
      void this.flushActivity();
    }, HEARTBEAT_FLUSH_MS);
  }

  private createInitialEventCounts(): Record<string, number> {
    return {
      textChange: 0,
      save: 0,
      activeEditor: 0,
      selection: 0,
      visibleRange: 0,
      openDocument: 0,
      activeTerminal: 0,
      createFiles: 0,
      renameFiles: 0,
      deleteFiles: 0,
      windowFocus: 0
    };
  }

  private recordActivity(
    eventName: string,
    options?: {
      document?: vscode.TextDocument;
      trackFile?: boolean;
    }
  ): void {
    this.evaluateTime();
    this.incrementEvent(eventName);
    this.state.lastActivityAt = Date.now();

    if (options?.trackFile && options.document && !options.document.isUntitled) {
      this.state.filesEdited.add(options.document.fileName);
    }

    this.refreshStatusBar();
  }

  private recordUris(eventName: string, uris: readonly vscode.Uri[]): void {
    this.evaluateTime();
    this.incrementEvent(eventName);
    this.state.lastActivityAt = Date.now();

    uris.forEach((uri) => {
      if (uri.scheme === 'file') {
        this.state.filesEdited.add(uri.fsPath);
      }
    });

    this.refreshStatusBar();
  }

  private incrementEvent(eventName: string): void {
    this.state.eventCounts[eventName] = (this.state.eventCounts[eventName] ?? 0) + 1;
  }

  private resetSessionClock(): void {
    const now = Date.now();
    this.state = {
      ...this.state,
      sessionStart: now,
      activeTimeMs: 0,
      idleTimeMs: 0,
      pendingActiveTimeMs: 0,
      pendingIdleTimeMs: 0,
      filesEdited: new Set<string>(),
      eventCounts: this.createInitialEventCounts(),
      lastActivityAt: now,
      lastEvaluationAt: now,
      isWindowFocused: vscode.window.state.focused
    };
  }

  private evaluateTime(): void {
    const now = Date.now();
    const elapsedMs = now - this.state.lastEvaluationAt;
    if (elapsedMs <= 0) {
      return;
    }

    const idleTimeoutMs = this.apiService.getIdleTimeoutMs();
    const idleStartAt = this.state.lastActivityAt + idleTimeoutMs;
    const effectivelyIdle = !this.authSession || !this.state.isWindowFocused || now >= idleStartAt;

    if (effectivelyIdle) {
      this.trackIdle(elapsedMs);
    } else if (idleStartAt > this.state.lastEvaluationAt && idleStartAt < now) {
      const activeMs = idleStartAt - this.state.lastEvaluationAt;
      const idleMs = now - idleStartAt;
      this.trackActive(activeMs);
      this.trackIdle(idleMs);
    } else {
      this.trackActive(elapsedMs);
    }

    this.state.lastEvaluationAt = now;
  }

  private getCurrentStatus(): ActivityStatus {
    if (!this.authSession) {
      return 'loggedOut';
    }

    if (this.reauthRequired) {
      return 'reconnect';
    }

    const idleTimeoutMs = this.apiService.getIdleTimeoutMs();
    if (!this.state.isWindowFocused || Date.now() - this.state.lastActivityAt >= idleTimeoutMs) {
      return 'idle';
    }

    return this.getTotalEventCount() > 0 ? 'active' : 'tracking';
  }

  private setStatus(status: ActivityStatus): void {
    const statusText: Record<ActivityStatus, string> = {
      active: 'Autovyn: Active',
      idle: 'Autovyn: Idle',
      tracking: 'Autovyn: Tracking',
      reconnect: 'Autovyn: Reconnect Needed',
      loggedOut: 'Autovyn: Login Required'
    };

    this.statusBarItem.text = statusText[status];
  }

  private refreshStatusBar(): void {
    this.setStatus(this.getCurrentStatus());
    const syncState = this.reauthRequired ? 'Reconnect required' : 'Connected';
    const lastSync = this.lastSyncAt ? new Date(this.lastSyncAt).toLocaleTimeString() : 'pending';
    const summary = `Workspace: ${this.getWorkspaceName()} | Active ${this.getActiveTimeSeconds()}s | Idle ${this.getIdleTimeSeconds()}s | Sync ${syncState} | Last sync ${lastSync}`;
    this.statusBarItem.tooltip = summary;
  }

  private getWorkspaceName(): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return 'no-workspace';
    }

    return workspaceFolder.name || path.basename(workspaceFolder.uri.fsPath);
  }

  private getSessionDurationSeconds(): number {
    return Math.floor((Date.now() - this.state.sessionStart) / 1000);
  }

  private getActiveTimeSeconds(): number {
    return Math.floor(this.state.activeTimeMs / 1000);
  }

  private getIdleTimeSeconds(): number {
    return Math.floor(this.state.idleTimeMs / 1000);
  }

  private trackActive(durationMs: number): void {
    this.state.activeTimeMs += durationMs;
    this.state.pendingActiveTimeMs += durationMs;
  }

  private trackIdle(durationMs: number): void {
    this.state.idleTimeMs += durationMs;
    this.state.pendingIdleTimeMs += durationMs;
  }

  private buildHeartbeatBatch(): HeartbeatBatch {
    if (!this.authSession) {
      return {
        payloads: [],
        sentActiveTimeMs: 0,
        sentIdleTimeMs: 0
      };
    }

    this.evaluateTime();

    const recordedAt = new Date().toISOString();
    const activeBatch = this.buildHeartbeatPayloads(this.state.pendingActiveTimeMs, 'ACTIVE', recordedAt);
    const idleBatch = this.buildHeartbeatPayloads(this.state.pendingIdleTimeMs, 'INACTIVE', recordedAt);

    return {
      payloads: [...activeBatch.payloads, ...idleBatch.payloads],
      sentActiveTimeMs: activeBatch.sentTimeMs,
      sentIdleTimeMs: idleBatch.sentTimeMs
    };
  }

  private buildHeartbeatPayloads(
    pendingTimeMs: number,
    status: 'ACTIVE' | 'INACTIVE',
    recordedAt: string
  ): { payloads: WorklogHeartbeatPayload[]; sentTimeMs: number } {
    const payloads: WorklogHeartbeatPayload[] = [];
    let remainingMs = pendingTimeMs;
    let wholeSeconds = Math.floor(remainingMs / 1000);
    let sentTimeMs = 0;

    while (wholeSeconds >= MIN_HEARTBEAT_SECONDS) {
      const durationSeconds = Math.min(wholeSeconds, MAX_HEARTBEAT_SECONDS);
      payloads.push({
        status,
        durationSeconds,
        recordedAt,
        deviceId: vscode.env.machineId,
        editor: 'vscode',
        isFocused: this.state.isWindowFocused
      });
      remainingMs -= durationSeconds * 1000;
      sentTimeMs += durationSeconds * 1000;
      wholeSeconds = Math.floor(remainingMs / 1000);
    }

    return { payloads, sentTimeMs };
  }

  async flushActivity(): Promise<void> {
    if (this.sending || !this.authSession) {
      return;
    }

    if (this.reauthRequired) {
      const restored = await this.restoreSession();
      if (!restored) {
        return;
      }
    }

    const heartbeatBatch = this.buildHeartbeatBatch();
    if (!heartbeatBatch.payloads.length) {
      return;
    }

    this.sending = true;

    try {
      const synced = await this.sendHeartbeatBatch(heartbeatBatch.payloads);
      if (!synced) {
        return;
      }

      this.state.pendingActiveTimeMs = Math.max(0, this.state.pendingActiveTimeMs - heartbeatBatch.sentActiveTimeMs);
      this.state.pendingIdleTimeMs = Math.max(0, this.state.pendingIdleTimeMs - heartbeatBatch.sentIdleTimeMs);
      this.lastSyncAt = Date.now();
      this.reauthRequired = false;
      this.reconnectWarningShown = false;
      this.refreshStatusBar();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Autovyn activity sync failed:', message);
    } finally {
      this.sending = false;
    }
  }

  private getTotalEventCount(): number {
    return Object.values(this.state.eventCounts).reduce((total, count) => total + count, 0);
  }

  private buildLocalSnapshot(): LocalActivitySnapshot {
    const employee = this.authSession?.employee;

    return {
      employeeId: employee?.employeeId ?? null,
      employeeName: employee?.name ?? 'Not logged in',
      role: employee?.role ?? 'Unknown',
      workspace: this.getWorkspaceName(),
      status: this.getCurrentStatus().toUpperCase(),
      sessionStartedAt: new Date(this.state.sessionStart).toLocaleString(),
      sessionDurationSeconds: this.getSessionDurationSeconds(),
      activeSeconds: this.getActiveTimeSeconds(),
      idleSeconds: this.getIdleTimeSeconds(),
      filesEdited: Array.from(this.state.filesEdited)
        .sort((left, right) => left.localeCompare(right))
        .map((filePath) => this.formatFileReference(filePath)),
      eventCounts: { ...this.state.eventCounts },
      isFocused: this.state.isWindowFocused,
      needsReconnect: this.reauthRequired,
      lastSyncAt: this.lastSyncAt ? new Date(this.lastSyncAt).toLocaleString() : undefined
    };
  }

  private formatFileReference(filePath: string): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.find((folder) => filePath.startsWith(folder.uri.fsPath));
    if (!workspaceFolder) {
      return path.basename(filePath);
    }

    return path.relative(workspaceFolder.uri.fsPath, filePath) || path.basename(filePath);
  }

  private async fetchWorklogSummary(): Promise<WorklogSummaryEmployee | undefined> {
    return this.withSessionRetry(
      (session) => this.apiService.getTodayWorklogSummary(session.accessToken, session.employee.id),
      true
    );
  }

  private async sendHeartbeatBatch(payloads: WorklogHeartbeatPayload[]): Promise<boolean> {
    const result = await this.withSessionRetry(async (session) => {
      for (const heartbeat of payloads) {
        await this.apiService.postWorklogHeartbeat(session.accessToken, heartbeat);
      }
      return true;
    });

    return result === true;
  }

  private async withSessionRetry<T>(
    action: (session: AuthSession) => Promise<T>,
    forceReconnect = false
  ): Promise<T | undefined> {
    if (!this.authSession) {
      return undefined;
    }

    if (this.reauthRequired) {
      const restored = await this.restoreSession(forceReconnect);
      if (!restored || !this.authSession) {
        return undefined;
      }
    }

    try {
      return await action(this.authSession);
    } catch (error) {
      if (error instanceof ApiRequestError && error.statusCode === 401) {
        const restored = await this.restoreSession(true);
        if (restored && this.authSession) {
          return action(this.authSession);
        }
      }

      throw error;
    }
  }

  private async restoreSession(force = false): Promise<boolean> {
    if (!this.authSession) {
      return false;
    }

    const now = Date.now();
    if (!force && now - this.lastReconnectAttemptAt < RECONNECT_RETRY_MS) {
      return false;
    }

    this.lastReconnectAttemptAt = now;
    const refreshedSession = await this.refreshSessionSilently();
    if (refreshedSession) {
      this.authSession = refreshedSession;
      this.reauthRequired = false;
      this.reconnectWarningShown = false;
      this.refreshStatusBar();
      return true;
    }

    this.reauthRequired = true;
    this.refreshStatusBar();

    if (!this.reconnectWarningShown) {
      this.reconnectWarningShown = true;
      void vscode.window.showWarningMessage(
        'Autovyn could not refresh your session. Tracking is paused until the connection is restored or you log in again.'
      );
    }

    return false;
  }

  private async refreshSessionSilently(): Promise<AuthSession | undefined> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.authService
      .refreshSession(this.authSession)
      .then((session) => {
        if (!session) {
          return undefined;
        }

        this.authSession = session;
        return session;
      })
      .finally(() => {
        this.refreshPromise = undefined;
      });

    return this.refreshPromise;
  }
}
