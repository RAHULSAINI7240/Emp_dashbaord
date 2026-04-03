import * as vscode from 'vscode';

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errorCode?: string
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthenticatedEmployee {
  id: string;
  employeeId: string | null;
  name: string;
  email: string | null;
  role: string;
  department: string | null;
  designation: string | null;
}

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
  errorCode?: string;
}

export interface ActivityPayload {
  employeeId: string;
  activeTime: number;
  idleTime: number;
  sessionDuration: number;
  workspace: string;
  timestamp: number;
  sessionStart: number;
  filesEdited: string[];
  eventCounts: Record<string, number>;
  windowFocused: boolean;
}

export interface WorklogHeartbeatPayload {
  status: 'ACTIVE' | 'INACTIVE';
  durationSeconds: number;
  recordedAt?: string;
  deviceId?: string;
  editor?: string;
  isFocused?: boolean;
}

export interface WorklogSummaryEmployee {
  user: {
    id: string;
    employeeId: string | null;
    adminId?: string | null;
    name: string;
    role: string;
    permissions?: string[];
  };
  activeSeconds: number;
  inactiveSeconds: number;
  totalTrackedSeconds: number;
  productivityPercent: number;
  daily: Array<{
    date: string;
    activeSeconds: number;
    inactiveSeconds: number;
    totalSeconds: number;
    productivityPercent: number;
  }>;
  liveStatus: 'ACTIVE' | 'IDLE' | 'OFFLINE';
  lastHeartbeatAt: string | null;
  lastHeartbeatEditor: string | null;
  lastHeartbeatFocused: boolean | null;
}

interface WorklogSummaryResponse {
  from: string;
  to: string;
  timezoneOffsetMinutes: number;
  totalActiveSeconds: number;
  totalInactiveSeconds: number;
  totalTrackedSeconds: number;
  productivityPercent: number;
  employeeCount: number;
  employees: WorklogSummaryEmployee[];
}

interface OllamaGenerateResponse {
  response?: string;
}

export class ApiService {
  getApiUrl(): string {
    const config = vscode.workspace.getConfiguration('autovyn');
    const configured = config.get<string>('apiUrl', 'http://localhost:3001');
    return configured.replace(/\/+$/, '');
  }

  getIdleTimeoutMs(): number {
    const config = vscode.workspace.getConfiguration('autovyn');
    const idleTimeoutSeconds = config.get<number>('idleTimeout', 300);
    return Math.max(60, idleTimeoutSeconds) * 1000;
  }

  getSummaryProvider(): 'local' | 'ollama' {
    const config = vscode.workspace.getConfiguration('autovyn');
    const provider = config.get<string>('summaryProvider', 'local');
    return provider === 'ollama' ? 'ollama' : 'local';
  }

  getOllamaUrl(): string {
    const config = vscode.workspace.getConfiguration('autovyn');
    return config.get<string>('ollamaUrl', 'http://127.0.0.1:11434/api/generate').trim();
  }

  getOllamaModel(): string {
    const config = vscode.workspace.getConfiguration('autovyn');
    return config.get<string>('ollamaModel', 'llama3.2:3b').trim();
  }

  async loginEmployee(employeeId: string, password: string): Promise<AuthTokens & { user: AuthenticatedEmployee }> {
    const payload = { employeeId, password };
    const endpoints = ['/api/auth/login/employee', '/api/employee/login'];

    let lastError: unknown;
    for (const endpoint of endpoints) {
      try {
        return await this.request<AuthTokens & { user: AuthenticatedEmployee }>(endpoint, {
          method: 'POST',
          body: payload
        });
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }

  async refreshSession(refreshToken: string): Promise<AuthTokens & { user: AuthenticatedEmployee }> {
    return this.request<AuthTokens & { user: AuthenticatedEmployee }>('/api/auth/refresh', {
      method: 'POST',
      body: { refreshToken }
    });
  }

  async logout(refreshToken: string): Promise<void> {
    await this.request('/api/auth/logout', {
      method: 'POST',
      body: { refreshToken }
    });
  }

  async postWorklogHeartbeat(accessToken: string, payload: WorklogHeartbeatPayload): Promise<void> {
    await this.request('/api/worklog/heartbeat', {
      method: 'POST',
      body: payload,
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async getTodayWorklogSummary(accessToken: string, userId: string): Promise<WorklogSummaryEmployee | undefined> {
    const now = new Date();
    const todayKey = [
      now.getFullYear(),
      `${now.getMonth() + 1}`.padStart(2, '0'),
      `${now.getDate()}`.padStart(2, '0')
    ].join('-');

    const response = await this.request<WorklogSummaryResponse>('/api/worklog/summary', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      params: {
        from: todayKey,
        to: todayKey,
        userId,
        timezoneOffsetMinutes: new Date().getTimezoneOffset()
      }
    });

    return response.employees[0];
  }

  async generateSummaryWithOllama(prompt: string): Promise<string> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), 20_000);

    try {
      const response = await fetch(this.getOllamaUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.getOllamaModel(),
          prompt,
          stream: false
        }),
        signal: controller.signal
      });

      const parsed = (await response.json().catch(() => undefined)) as OllamaGenerateResponse | undefined;
      if (!response.ok || !parsed?.response?.trim()) {
        throw new Error(`Ollama summary request failed with status ${response.status}.`);
      }

      return parsed.response.trim();
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private async request<T>(
    endpoint: string,
    options: {
      method: 'GET' | 'POST';
      body?: unknown;
      headers?: Record<string, string>;
      params?: Record<string, string | number | boolean | undefined>;
    }
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), 15000);

    try {
      const url = new URL(`${this.getApiUrl()}${endpoint}`);
      Object.entries(options.params ?? {}).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      });

      const response = await fetch(url.toString(), {
        method: options.method,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      });

      const parsed = (await response.json().catch(() => undefined)) as ApiEnvelope<T> | undefined;
      if (!response.ok) {
        throw new ApiRequestError(
          parsed?.message || `Request failed with status ${response.status}.`,
          response.status,
          parsed?.errorCode
        );
      }

      if (!parsed) {
        throw new Error('Server returned an empty response.');
      }

      return parsed.data;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
