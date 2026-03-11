import { Component } from '@angular/core';
import { NgFor } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { AuthService } from '../../../core/services/auth.service';
import { ArsService } from '../../../core/services/ars.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-ars-request',
  imports: [NgFor, ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  templateUrl: './ars-request.component.html',
  styleUrl: './ars-request.component.scss'
})
export class ArsRequestComponent {
  readonly todayKey = new Date().toISOString().slice(0, 10);
  readonly requestTips = [
    'ARS is for missing or incorrect punch records, not planned leave.',
    'Use a clear reason so approvers can verify the attendance correction quickly.',
    'The system routes the request to the configured approver based on your reporting setup.'
  ];
  readonly missingTypeCards = [
    {
      value: 'MISSING_PUNCH_IN',
      title: 'Missing Punch In',
      copy: 'Use this when your day started but the entry punch did not get recorded.'
    },
    {
      value: 'MISSING_PUNCH_OUT',
      title: 'Missing Punch Out',
      copy: 'Use this when you finished work but the exit punch is missing.'
    },
    {
      value: 'BOTH',
      title: 'Both Punches Missing',
      copy: 'Use this only when both in and out attendance markers are unavailable.'
    }
  ] as const;
  form;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly arsService: ArsService,
    private readonly toastService: ToastService
  ) {
    this.form = this.fb.group({
      date: ['', Validators.required],
      missingType: ['MISSING_PUNCH_IN', Validators.required],
      reason: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(500)]],
      approverId: ['']
    });
  }

  get missingTypeLabel(): string {
    const value = this.form.getRawValue().missingType;
    return this.missingTypeCards.find((item) => item.value === value)?.title ?? 'Missing Punch In';
  }

  get requestDateLabel(): string {
    const value = this.form.getRawValue().date;
    if (!value) return 'Not selected';

    const [year, month, day] = value.split('-').map((item) => Number(item));
    return new Date(year, (month || 1) - 1, day || 1).toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  get reasonLength(): number {
    return (this.form.getRawValue().reason || '').trim().length;
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const user = this.authService.getCurrentUserSnapshot();
    if (!user) return;
    const value = this.form.getRawValue();
    if ((value.date || '') > this.todayKey) {
      this.toastService.show('ARS request date cannot be in the future.', 'error');
      return;
    }
    this.arsService
      .create({
        employeeId: user.id,
        approverId: value.approverId || '',
        date: value.date || '',
        missingType: value.missingType as any,
        reason: value.reason || ''
      })
      .subscribe(() => {
        this.toastService.show('ARS request submitted', 'success');
        this.form.reset({ date: '', missingType: 'MISSING_PUNCH_IN', reason: '', approverId: '' });
      });
  }
}
