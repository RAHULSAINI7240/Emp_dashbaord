import { Component } from '@angular/core';
import { AsyncPipe, CommonModule, DatePipe, DecimalPipe, NgFor, NgIf } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { LeaveService } from '../../../core/services/leave.service';
import { ArsService } from '../../../core/services/ars.service';
import { combineLatest, map, Observable, startWith } from 'rxjs';
import { LeaveRequest } from '../../../shared/models/leave.model';
import { ARSRequest } from '../../../shared/models/ars.model';
import { AuthService } from '../../../core/services/auth.service';
import { PunchAuditService } from '../../../core/services/punch-audit.service';
import { FaceScanType, PunchAuditLog, PunchLocationType } from '../../../shared/models/punch-audit.model';
import { User } from '../../../shared/models/user.model';
import { ToastService } from '../../../core/services/toast.service';
import { CommentDialogComponent } from '../../../shared/components/comment-dialog/comment-dialog.component';

@Component({
  selector: 'app-admin-approvals',
  imports: [
    CommonModule,
    AsyncPipe,
    DatePipe,
    DecimalPipe,
    NgFor,
    NgIf,
    ReactiveFormsModule,
    MatTabsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule
  ],
  templateUrl: './approvals.component.html',
  styleUrl: './approvals.component.scss'
})
export class AdminApprovalsComponent {
  leave$!: Observable<LeaveRequest[]>;
  ars$!: Observable<ARSRequest[]>;
  users$!: Observable<User[]>;
  punchAudit$!: Observable<PunchAuditLog[]>;
  leaveFiltered$!: Observable<LeaveRequest[]>;
  arsFiltered$!: Observable<ARSRequest[]>;
  punchAuditFiltered$!: Observable<PunchAuditLog[]>;
  leaveFilters;
  arsFilters;
  punchFilters;
  userNames: Record<string, string> = {};

  constructor(
    private readonly fb: FormBuilder,
    private readonly leaveService: LeaveService,
    private readonly arsService: ArsService,
    private readonly punchAuditService: PunchAuditService,
    private readonly authService: AuthService,
    private readonly toastService: ToastService,
    private readonly dialog: MatDialog
  ) {
    this.leaveFilters = this.fb.group({
      query: [''],
      employeeId: [''],
      status: ['ALL']
    });
    this.arsFilters = this.fb.group({
      query: [''],
      employeeId: [''],
      status: ['ALL']
    });
    this.punchFilters = this.fb.group({
      query: [''],
      employeeId: [''],
      locationType: ['ALL'],
      scanType: ['ALL']
    });
    this.leave$ = this.leaveService.requests$;
    this.ars$ = this.arsService.requests$;
    this.punchAudit$ = this.punchAuditService.getAllLogs();
    this.users$ = this.authService.getUsers().pipe(
      map((users) => {
        this.userNames = users.reduce(
          (acc, user) => {
            acc[user.id] = user.name;
            return acc;
          },
          {} as Record<string, string>
        );
        return users.filter((u) => !u.roles.includes('ADMIN'));
      })
    );
    this.leaveFiltered$ = combineLatest([
      this.leave$,
      this.leaveFilters.valueChanges.pipe(startWith(this.leaveFilters.getRawValue()))
    ]).pipe(
      map(([items, f]) =>
        items.filter((item) => {
          const query = (f.query || '').toLowerCase().trim();
          const queryMatch =
            !query ||
            item.reason.toLowerCase().includes(query) ||
            this.nameOf(item.employeeId).toLowerCase().includes(query);
          const empMatch = !f.employeeId || item.employeeId === f.employeeId;
          const statusMatch = f.status === 'ALL' || item.status === f.status;
          return queryMatch && empMatch && statusMatch;
        })
      )
    );
    this.arsFiltered$ = combineLatest([this.ars$, this.arsFilters.valueChanges.pipe(startWith(this.arsFilters.getRawValue()))]).pipe(
      map(([items, f]) =>
        items.filter((item) => {
          const query = (f.query || '').toLowerCase().trim();
          const queryMatch =
            !query ||
            item.reason.toLowerCase().includes(query) ||
            this.nameOf(item.employeeId).toLowerCase().includes(query);
          const empMatch = !f.employeeId || item.employeeId === f.employeeId;
          const statusMatch = f.status === 'ALL' || item.status === f.status;
          return queryMatch && empMatch && statusMatch;
        })
      )
    );
    this.punchAuditFiltered$ = combineLatest([
      this.punchAudit$,
      this.punchFilters.valueChanges.pipe(startWith(this.punchFilters.getRawValue()))
    ]).pipe(
      map(([items, f]) =>
        items.filter((item) => {
          const query = (f.query || '').toLowerCase().trim();
          const queryMatch =
            !query ||
            item.employeeName.toLowerCase().includes(query) ||
            item.date.toLowerCase().includes(query) ||
            this.locationTypeLabel(item.inLocation?.locationType).toLowerCase().includes(query);
          const empMatch = !f.employeeId || item.employeeId === f.employeeId;
          const locationMatch = f.locationType === 'ALL' || item.inLocation?.locationType === f.locationType;
          const scanMatch = f.scanType === 'ALL' || item.faceScanType === f.scanType;
          return queryMatch && empMatch && locationMatch && scanMatch;
        })
      )
    );
  }

  leaveAction(id: string, status: 'APPROVED' | 'DECLINED'): void {
    this.dialog
      .open(CommentDialogComponent, {
        width: '420px',
        data: {
          title: `${status === 'APPROVED' ? 'Approve' : 'Decline'} Leave Request`,
          submitLabel: 'Submit'
        }
      })
      .afterClosed()
      .subscribe((comment: string | undefined) => {
        if (comment === undefined) return;
        this.leaveService.updateStatus(id, status, comment || 'Admin action');
        this.toastService.show(`Leave request ${status.toLowerCase()}`, status === 'APPROVED' ? 'success' : 'info');
      });
  }

  arsAction(id: string, status: 'APPROVED' | 'DECLINED'): void {
    this.dialog
      .open(CommentDialogComponent, {
        width: '420px',
        data: {
          title: `${status === 'APPROVED' ? 'Approve' : 'Decline'} ARS Request`,
          submitLabel: 'Submit'
        }
      })
      .afterClosed()
      .subscribe((comment: string | undefined) => {
        if (comment === undefined) return;
        this.arsService.updateStatus(id, status, comment || 'Admin action');
        this.toastService.show(`ARS request ${status.toLowerCase()}`, status === 'APPROVED' ? 'success' : 'info');
      });
  }

  nameOf(id: string): string {
    return this.userNames[id] || id;
  }

  statusIcon(status: string): string {
    if (status === 'APPROVED') return 'check_circle';
    if (status === 'DECLINED') return 'cancel';
    if (status === 'EXPIRED') return 'schedule';
    return 'hourglass_top';
  }

  scanTypeLabel(scanType: FaceScanType): string {
    if (scanType === 'FACE_DETECTOR') return 'Face Detector';
    if (scanType === 'CAMERA_ONLY') return 'Camera Only';
    return 'Simulated';
  }

  locationTypeLabel(locationType?: PunchLocationType): string {
    if (locationType === 'OFFICE_ZONE') return 'Office Zone';
    if (locationType === 'HOME_ZONE') return 'Home Zone';
    if (locationType === 'REMOTE_ZONE') return 'Remote Zone';
    return 'Unknown';
  }
}
