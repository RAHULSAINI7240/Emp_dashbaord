import * as vscode from 'vscode';
import { ApiService, AuthenticatedEmployee } from './apiService';

const ACCESS_TOKEN_KEY = 'autovyn.auth.accessToken';
const REFRESH_TOKEN_KEY = 'autovyn.auth.refreshToken';
const EMPLOYEE_KEY = 'autovyn.auth.employee';

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  employee: AuthenticatedEmployee;
}

export class AuthService {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly apiService: ApiService
  ) {}

  async getSession(): Promise<AuthSession | undefined> {
    const accessToken = await this.context.secrets.get(ACCESS_TOKEN_KEY);
    const refreshToken = await this.context.secrets.get(REFRESH_TOKEN_KEY);
    const employee = this.context.globalState.get<AuthenticatedEmployee>(EMPLOYEE_KEY);

    if (!accessToken || !refreshToken || !employee?.employeeId) {
      return undefined;
    }

    return { accessToken, refreshToken, employee };
  }

  async refreshSession(existingSession?: AuthSession): Promise<AuthSession | undefined> {
    const session = existingSession ?? (await this.getSession());
    if (!session) {
      return undefined;
    }

    try {
      const response = await this.apiService.refreshSession(session.refreshToken);
      const employee = {
        ...session.employee,
        ...response.user,
        employeeId: response.user.employeeId ?? session.employee.employeeId
      };

      const nextSession = {
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        employee
      };

      await this.persistSession(nextSession);
      return nextSession;
    } catch {
      return undefined;
    }
  }

  async ensureLoggedIn(): Promise<AuthSession | undefined> {
    const existing = await this.getSession();
    if (existing) {
      return existing;
    }

    return this.login();
  }

  async login(): Promise<AuthSession | undefined> {
    const employeeId = await vscode.window.showInputBox({
      title: 'Autovyn Login',
      prompt: 'Enter your Autovyn Employee ID',
      placeHolder: 'VYN098',
      ignoreFocusOut: true,
      validateInput(value) {
        return value.trim().length >= 3 ? undefined : 'Employee ID must be at least 3 characters.';
      }
    });

    if (!employeeId) {
      return undefined;
    }

    const password = await vscode.window.showInputBox({
      title: 'Autovyn Login',
      prompt: 'Enter your Autovyn password',
      password: true,
      ignoreFocusOut: true,
      validateInput(value) {
        return value.trim().length > 0 ? undefined : 'Password is required.';
      }
    });

    if (!password) {
      return undefined;
    }

    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Autovyn login',
        cancellable: false
      },
      async () => {
        const normalizedEmployeeId = employeeId.trim().toUpperCase();
        const response = await this.apiService.loginEmployee(normalizedEmployeeId, password);
        const employee = {
          ...response.user,
          employeeId: response.user.employeeId ?? normalizedEmployeeId
        };
        const session = {
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
          employee
        };

        await this.persistSession(session);

        vscode.window.showInformationMessage(`Autovyn logged in as ${employee.employeeId}.`);

        return session;
      }
    );
  }

  async logout(): Promise<void> {
    const session = await this.getSession();
    if (session) {
      try {
        await this.apiService.logout(session.refreshToken);
      } catch {
        // Ignore logout transport failures so local cleanup always completes.
      }
    }

    await this.clearStoredSession();
  }

  private async persistSession(session: AuthSession): Promise<void> {
    await this.context.secrets.store(ACCESS_TOKEN_KEY, session.accessToken);
    await this.context.secrets.store(REFRESH_TOKEN_KEY, session.refreshToken);
    await this.context.globalState.update(EMPLOYEE_KEY, session.employee);
  }

  private async clearStoredSession(): Promise<void> {
    await this.context.secrets.delete(ACCESS_TOKEN_KEY);
    await this.context.secrets.delete(REFRESH_TOKEN_KEY);
    await this.context.globalState.update(EMPLOYEE_KEY, undefined);
  }
}
