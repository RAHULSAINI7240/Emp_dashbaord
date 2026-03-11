import * as vscode from 'vscode';
import { ActivityTracker } from './activityTracker';
import { ApiService } from './apiService';
import { AuthService } from './authService';

let tracker: ActivityTracker | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const apiService = new ApiService();
  const authService = new AuthService(context, apiService);

  tracker = new ActivityTracker(authService, apiService);
  await tracker.initialize();

  context.subscriptions.push(
    tracker,
    vscode.commands.registerCommand('autovyn.login', async () => {
      try {
        const loggedIn = await tracker?.login();
        if (!loggedIn) {
          vscode.window.showWarningMessage('Autovyn login was cancelled.');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Login failed.';
        vscode.window.showErrorMessage(`Autovyn login failed: ${message}`);
      }
    }),
    vscode.commands.registerCommand('autovyn.logout', async () => {
      try {
        await tracker?.logout();
        vscode.window.showInformationMessage('Autovyn logged out.');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Logout failed.';
        vscode.window.showErrorMessage(`Autovyn logout failed: ${message}`);
      }
    }),
    vscode.commands.registerCommand('autovyn.showActivitySummary', async () => {
      if (!tracker) {
        vscode.window.showWarningMessage('Autovyn tracker is not initialized.');
        return;
      }

      try {
        const summary = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Autovyn summary',
            cancellable: false
          },
          () => tracker!.getDetailedSummaryMarkdown()
        );

        const document = await vscode.workspace.openTextDocument({
          language: 'markdown',
          content: summary
        });

        await vscode.window.showTextDocument(document, {
          preview: false,
          viewColumn: vscode.ViewColumn.Beside
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Summary generation failed.';
        vscode.window.showErrorMessage(`Autovyn summary failed: ${message}`);
      }
    })
  );

  const session = await authService.getSession();
  if (!session) {
    const choice = await vscode.window.showInformationMessage(
      'Autovyn requires login before activity tracking can start.',
      'Login'
    );

    if (choice === 'Login') {
      try {
        await tracker.login();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Login failed.';
        vscode.window.showErrorMessage(`Autovyn login failed: ${message}`);
      }
    }
  }
}

export async function deactivate(): Promise<void> {
  if (!tracker) {
    return;
  }

  await tracker.flushActivity();
  tracker.dispose();
  tracker = undefined;
}
