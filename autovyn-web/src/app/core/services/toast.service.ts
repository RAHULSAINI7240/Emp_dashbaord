import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ToastMessage {
  text: string;
  type: 'success' | 'error' | 'info';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly toastSubject = new BehaviorSubject<ToastMessage | null>(null);
  readonly toast$ = this.toastSubject.asObservable();

  show(text: string, type: ToastMessage['type'] = 'info'): void {
    this.toastSubject.next({ text, type });
    setTimeout(() => this.toastSubject.next(null), 2800);
  }
}
