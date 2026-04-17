import { EventEmitter } from 'events';

export interface LiveScreenshot {
  id: string;
  userId: string;
  imageData: string;
  deviceId: string | null;
  capturedAt: string;
}

class ScreenshotsLiveState {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  subscribe(listener: (items: LiveScreenshot[]) => void): () => void {
    this.emitter.on('screenshots', listener);
    return () => {
      this.emitter.off('screenshots', listener);
    };
  }

  publish(items: LiveScreenshot[]): void {
    if (!items.length) {
      return;
    }

    this.emitter.emit('screenshots', items);
  }
}

export const screenshotsLiveState = new ScreenshotsLiveState();
