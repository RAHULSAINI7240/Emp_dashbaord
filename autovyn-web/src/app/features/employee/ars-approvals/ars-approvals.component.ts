import { Component } from '@angular/core';
import { AsyncPipe, NgFor } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDialog } from '@angular/material/dialog';
import { ArsService } from '../../../core/services/ars.service';
import { AuthService } from '../../../core/services/auth.service';
import { Observable } from 'rxjs';
import { ARSRequest } from '../../../shared/models/ars.model';
import { CommentDialogComponent } from '../../../shared/components/comment-dialog/comment-dialog.component';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-ars-approvals',
  imports: [AsyncPipe, NgFor, MatButtonModule, MatTabsModule],
  templateUrl: './ars-approvals.component.html',
  styleUrl: './ars-approvals.component.scss'
})
export class ArsApprovalsComponent {
  requests$: Observable<ARSRequest[]>;

  constructor(
    private readonly arsService: ArsService,
    private readonly authService: AuthService,
    private readonly dialog: MatDialog,
    private readonly toastService: ToastService
  ) {
    this.requests$ = this.arsService.getByApprover(this.authService.getCurrentUserSnapshot()?.id || '');
  }

  act(id: string, status: 'APPROVED' | 'DECLINED'): void {
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
        this.arsService.updateStatus(id, status, comment);
        this.toastService.show(`ARS request ${status.toLowerCase()}`, status === 'APPROVED' ? 'success' : 'info');
      });
  }
}
