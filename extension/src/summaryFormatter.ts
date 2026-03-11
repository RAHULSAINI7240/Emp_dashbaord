import { WorklogSummaryEmployee } from './apiService';

export interface LocalActivitySnapshot {
  employeeId: string | null;
  employeeName: string;
  role: string;
  workspace: string;
  status: string;
  sessionStartedAt: string;
  sessionDurationSeconds: number;
  activeSeconds: number;
  idleSeconds: number;
  filesEdited: string[];
  eventCounts: Record<string, number>;
  isFocused: boolean;
  needsReconnect: boolean;
  lastSyncAt?: string;
}

const formatDuration = (totalSeconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const toList = (items: string[], fallback: string): string =>
  items.length ? items.map((item) => `- ${item}`).join('\n') : `- ${fallback}`;

const buildNarrative = (snapshot: LocalActivitySnapshot, remote?: WorklogSummaryEmployee): string => {
  const productivity = remote?.productivityPercent;
  const editedFiles = snapshot.filesEdited.length;
  const focusState = snapshot.isFocused ? 'focused in VS Code' : 'running in background';
  const reconnectState = snapshot.needsReconnect ? 'Session needs reconnection before sync can resume.' : 'Session sync is healthy.';

  const parts = [
    `${snapshot.employeeName} is currently ${snapshot.status.toLowerCase()} and ${focusState}.`,
    `This session has tracked ${formatDuration(snapshot.activeSeconds)} active time and ${formatDuration(snapshot.idleSeconds)} idle time.`,
    editedFiles > 0 ? `${editedFiles} file(s) have been touched in the current workspace.` : 'No file edits have been captured yet in this session.',
    typeof productivity === 'number'
      ? `Today's backend-tracked productivity is ${productivity}% across ${formatDuration(remote?.totalTrackedSeconds ?? 0)}.`
      : 'Backend productivity summary is not available right now.',
    reconnectState
  ];

  return parts.join(' ');
};

export const buildSummaryMarkdown = (
  snapshot: LocalActivitySnapshot,
  remote?: WorklogSummaryEmployee,
  aiSummary?: string
): string => {
  const topFiles = snapshot.filesEdited.slice(0, 8);
  const eventLines = Object.entries(snapshot.eventCounts)
    .sort(([, left], [, right]) => right - left)
    .map(([name, count]) => `- ${name}: ${count}`);

  const remoteDaily = remote?.daily?.length
    ? remote.daily
        .map(
          (day) =>
            `- ${day.date}: active ${formatDuration(day.activeSeconds)}, idle ${formatDuration(day.inactiveSeconds)}, productivity ${day.productivityPercent}%`
        )
        .join('\n')
    : '- No backend daily buckets available yet.';

  const summarySections = [
    `# Autovyn Activity Summary`,
    ``,
    `## Employee`,
    `- Employee ID: ${snapshot.employeeId ?? 'Not available'}`,
    `- Name: ${snapshot.employeeName}`,
    `- Role: ${snapshot.role}`,
    `- Workspace: ${snapshot.workspace}`,
    `- Current status: ${snapshot.status}`,
    `- Window focus: ${snapshot.isFocused ? 'Focused' : 'Background'}`,
    `- Session started: ${snapshot.sessionStartedAt}`,
    snapshot.lastSyncAt ? `- Last successful sync: ${snapshot.lastSyncAt}` : `- Last successful sync: Not yet synced`,
    `- Sync state: ${snapshot.needsReconnect ? 'Reconnect required' : 'Connected'}`,
    ``,
    `## Session Metrics`,
    `- Session duration: ${formatDuration(snapshot.sessionDurationSeconds)}`,
    `- Active time: ${formatDuration(snapshot.activeSeconds)}`,
    `- Idle time: ${formatDuration(snapshot.idleSeconds)}`,
    `- Files edited: ${snapshot.filesEdited.length}`,
    ``,
    `## Activity Narrative`,
    buildNarrative(snapshot, remote),
    ``,
    `## Files`,
    toList(topFiles, 'No edited files captured yet.'),
    ``,
    `## Event Counts`,
    eventLines.length ? eventLines.join('\n') : '- No activity events captured yet.',
    ``,
    `## Backend Worklog`,
    remote
      ? [
          `- Live status: ${remote.liveStatus}`,
          `- Active today: ${formatDuration(remote.activeSeconds)}`,
          `- Idle today: ${formatDuration(remote.inactiveSeconds)}`,
          `- Total tracked today: ${formatDuration(remote.totalTrackedSeconds)}`,
          `- Productivity today: ${remote.productivityPercent}%`,
          `- Last heartbeat: ${remote.lastHeartbeatAt ?? 'Not available'}`
        ].join('\n')
      : '- Backend worklog summary unavailable.',
    ``,
    `## Daily Buckets`,
    remoteDaily
  ];

  if (aiSummary) {
    summarySections.push('', '## AI Summary', aiSummary.trim());
  }

  return summarySections.join('\n');
};

export const buildOllamaPrompt = (snapshot: LocalActivitySnapshot, remote?: WorklogSummaryEmployee): string => {
  return [
    'You are summarizing a software developer activity report from a VS Code extension.',
    'Write a concise, professional summary in 4 to 6 sentences.',
    'Focus on current status, productivity, active vs idle split, files touched, and whether attention is needed.',
    'Do not invent facts that are not present.',
    '',
    `Employee ID: ${snapshot.employeeId ?? 'unknown'}`,
    `Employee Name: ${snapshot.employeeName}`,
    `Role: ${snapshot.role}`,
    `Workspace: ${snapshot.workspace}`,
    `Current Status: ${snapshot.status}`,
    `Focused: ${snapshot.isFocused}`,
    `Reconnect Required: ${snapshot.needsReconnect}`,
    `Session Duration Seconds: ${snapshot.sessionDurationSeconds}`,
    `Session Active Seconds: ${snapshot.activeSeconds}`,
    `Session Idle Seconds: ${snapshot.idleSeconds}`,
    `Files Edited Count: ${snapshot.filesEdited.length}`,
    `Files Edited: ${snapshot.filesEdited.join(', ') || 'none'}`,
    `Event Counts: ${JSON.stringify(snapshot.eventCounts)}`,
    `Backend Summary: ${remote ? JSON.stringify(remote) : 'unavailable'}`
  ].join('\n');
};
