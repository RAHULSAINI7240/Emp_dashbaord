import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
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
}
