import { NgIf } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface AgentInactiveDialogData {
  loginId?: string;
}

@Component({
  selector: 'app-agent-inactive-dialog',
  imports: [NgIf, MatDialogModule, MatIconModule, MatButtonModule],
  templateUrl: './agent-inactive-dialog.component.html',
  styleUrl: './agent-inactive-dialog.component.scss'
})
export class AgentInactiveDialogComponent {
  constructor(
    public readonly dialogRef: MatDialogRef<AgentInactiveDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public readonly data: AgentInactiveDialogData
  ) {}
}
