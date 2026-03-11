import { Component } from '@angular/core';
import { AsyncPipe, NgFor, NgIf } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDialog } from '@angular/material/dialog';
import { LeaveService } from '../../../core/services/leave.service';
import { AuthService } from '../../../core/services/auth.service';
import { LeaveRequest } from '../../../shared/models/leave.model';
import { combineLatest, map, Observable, startWith } from 'rxjs';
import { User } from '../../../shared/models/user.model';
import { ToastService } from '../../../core/services/toast.service';
import { CommentDialogComponent } from '../../../shared/components/comment-dialog/comment-dialog.component';

@Component({
  selector: 'app-leave-approvals',
  imports: [
    AsyncPipe,
    NgFor,
    NgIf,
    ReactiveFormsModule,
    MatTabsModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule
  ],
  templateUrl: './leave-approvals.component.html',
  styleUrl: './leave-approvals.component.scss'
})
export class LeaveApprovalsComponent {
  filters;
  requests$: Observable<LeaveRequest[]>;
  users$: Observable<User[]>;
  filtered$: Observable<LeaveRequest[]>;
  nameMap: Record<string, string> = {};

  constructor(
    private readonly fb: FormBuilder,
    private readonly leaveService: LeaveService,
    private readonly authService: AuthService,
    private readonly toastService: ToastService,
    private readonly dialog: MatDialog
  ) {
    this.filters = this.fb.group({
      query: [''],
      employeeId: [''],
      type: [''],
      status: ['ALL']
    });
    this.requests$ = this.leaveService.getByApprover(this.authService.getCurrentUserSnapshot()?.id || '');
    this.users$ = this.authService.getUsers().pipe(
      map((users) => users.filter((u) => u.roles.includes('EMPLOYEE'))),
      map((users) => {
        this.nameMap = users.reduce(
          (acc, user) => {
            acc[user.id] = user.name;
            return acc;
          },
          {} as Record<string, string>
        );
        return users;
      })
    );
    this.filtered$ = combineLatest([
      this.requests$,
      this.filters.valueChanges.pipe(startWith(this.filters.getRawValue()))
    ]).pipe(
      map(([requests, filters]) =>
        requests.filter((req) => {
          const query = (filters.query || '').toLowerCase();
          const queryMatch =
            !query ||
            req.reason.toLowerCase().includes(query) ||
            (this.nameMap[req.employeeId] || '').toLowerCase().includes(query);
          const employeeMatch = !filters.employeeId || req.employeeId === filters.employeeId;
          const typeMatch = !filters.type || req.type === filters.type;
          const statusMatch = filters.status === 'ALL' || req.status === filters.status;
          return queryMatch && employeeMatch && typeMatch && statusMatch;
        })
      )
    );
  }

  act(id: string, status: 'APPROVED' | 'DECLINED'): void {
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
        this.leaveService.updateStatus(id, status, comment);
        this.toastService.show(`Leave request ${status.toLowerCase()}`, status === 'APPROVED' ? 'success' : 'info');
      });
  }

  nameOf(employeeId: string): string {
    return this.nameMap[employeeId] || employeeId;
  }
}
