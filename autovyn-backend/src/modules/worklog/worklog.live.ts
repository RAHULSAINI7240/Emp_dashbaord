import { EventEmitter } from 'events';
import { WorkActivityStatus } from '@prisma/client';

export type WorklogPresenceStatus = 'ACTIVE' | 'IDLE' | 'OFFLINE';

export interface WorklogPresence {
  userId: string;
  status: WorklogPresenceStatus;
  editor: string;
  deviceId?: string;
  isFocused: boolean;
  updatedAt: string;
  recordedAt: string | null;
}

class WorklogLiveState {
  private readonly emitter = new EventEmitter();
  private readonly presenceByUser = new Map<string, WorklogPresence>();

  getPresence(userId: string): WorklogPresence | undefined {
    return this.presenceByUser.get(userId);
  }

  subscribe(listener: (presence: WorklogPresence) => void): () => void {
    this.emitter.on('presence', listener);
    return () => {
      this.emitter.off('presence', listener);
    };
  }

  updatePresence(input: {
    userId: string;
    status: WorklogPresenceStatus;
    editor: string;
    deviceId?: string;
    isFocused: boolean;
    recordedAt?: string | null;
  }): WorklogPresence {
    const nextPresence: WorklogPresence = {
      userId: input.userId,
      status: input.status,
      editor: input.editor,
      deviceId: input.deviceId,
      isFocused: input.isFocused,
      recordedAt: input.recordedAt ?? null,
      updatedAt: new Date().toISOString()
    };

    this.presenceByUser.set(input.userId, nextPresence);
    this.emitter.emit('presence', nextPresence);
    return nextPresence;
  }

  updateFromHeartbeat(input: {
    userId: string;
    status: WorkActivityStatus;
    editor: string;
    deviceId?: string;
    isFocused: boolean;
    recordedAt: Date;
  }): WorklogPresence {
    return this.updatePresence({
      userId: input.userId,
      status: input.status === 'ACTIVE' && input.isFocused ? 'ACTIVE' : 'IDLE',
      editor: input.editor,
      deviceId: input.deviceId,
      isFocused: input.isFocused,
      recordedAt: input.recordedAt.toISOString()
    });
  }
}

export const worklogLiveState = new WorklogLiveState();
