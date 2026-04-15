import { Component } from '@angular/core';
import { NgFor } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-modal-sheet',
  imports: [NgFor, RouterLink, MatDialogModule, MatIconModule],
  templateUrl: './modal-sheet.component.html',
  styleUrl: './modal-sheet.component.scss'
})
export class ModalSheetComponent {
  actions = [
    { label: 'Dashboard', icon: 'space_dashboard', link: '/employee/dashboard' },
    { label: 'My Profile', icon: 'person', link: '/employee/profile' },
    { label: 'Autovyn Cal', icon: 'calendar_month', link: '/employee/timesheet' },
    { label: 'Timesheet', icon: 'assignment', link: '/employee/work-timesheet' },
    { label: 'Credentials', icon: 'key', link: '/employee/credentials' },
    { label: 'Policies', icon: 'verified_user', link: '/employee/policies' },
    { label: 'Holiday', icon: 'event_available', link: '/employee/holiday' },
    { label: 'My Project', icon: 'workspaces', link: '/employee/projects' },
    { label: 'Employee Connect', icon: 'groups', link: '/employee/employee-connect' }
  ];

  constructor(public dialogRef: MatDialogRef<ModalSheetComponent>) {}
}
