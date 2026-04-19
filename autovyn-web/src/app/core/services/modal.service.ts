import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { AgentInactiveDialogComponent } from '../../shared/components/agent-inactive-dialog/agent-inactive-dialog.component';
import { ModalSheetComponent } from '../../shared/components/modal-sheet/modal-sheet.component';

@Injectable({ providedIn: 'root' })
export class ModalService {
  constructor(private readonly dialog: MatDialog) {}

  openAddons(): void {
    this.dialog.open(ModalSheetComponent, {
      panelClass: 'sheet-dialog-panel',
      autoFocus: false,
      width: '520px',
      maxWidth: '96vw'
    });
  }

  openAgentInactiveNotice(loginId?: string): void {
    this.dialog.open(AgentInactiveDialogComponent, {
      autoFocus: false,
      width: '480px',
      maxWidth: '94vw',
      panelClass: 'agent-inactive-dialog-panel',
      data: { loginId }
    });
  }
}
