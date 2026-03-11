import { Component } from '@angular/core';
import { DatePipe, NgFor, NgIf } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HolidayItem, HolidayService } from '../../../core/services/holiday.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-holiday',
  imports: [NgFor, NgIf, DatePipe, ReactiveFormsModule],
  templateUrl: './holiday.component.html',
  styleUrl: './holiday.component.scss'
})
export class HolidayComponent {
  index = 0;
  holidays: HolidayItem[] = [];
  posting = false;
  showCreateDialog = false;
  readonly form;

  constructor(
    private readonly fb: FormBuilder,
    private readonly holidayService: HolidayService,
    private readonly authService: AuthService,
    private readonly toastService: ToastService
  ) {
    this.form = this.fb.group({
      date: ['', Validators.required],
      name: ['', [Validators.required, Validators.minLength(3)]],
      imageUrl: ['']
    });
    this.loadHolidays();
  }

  get canCreate(): boolean {
    const current = this.authService.getCurrentUserSnapshot();
    if (!current) return false;
    return current.roles.includes('ADMIN') || current.roles.includes('HR');
  }

  submit(): void {
    if (!this.canCreate) {
      this.toastService.show('Only Admin/HR can create holiday posts.', 'error');
      return;
    }
    if (this.form.invalid || this.posting) {
      this.form.markAllAsTouched();
      return;
    }
    this.posting = true;
    const raw = this.form.getRawValue();
    const payload = {
      date: (raw.date ?? '').trim(),
      name: (raw.name ?? '').trim(),
      imageUrl: (raw.imageUrl ?? '').trim() || undefined
    };
    this.holidayService.create(payload).subscribe((created) => {
      this.posting = false;
      if (!created) {
        this.toastService.show('Failed to create holiday post.', 'error');
        return;
      }
      this.toastService.show('Holiday post created.', 'success');
      this.closeCreateDialog();
      this.loadHolidays();
    });
  }

  openCreateDialog(): void {
    this.form.reset();
    this.showCreateDialog = true;
  }

  closeCreateDialog(): void {
    this.showCreateDialog = false;
    this.form.reset();
  }

  private loadHolidays(): void {
    this.holidayService.listByYear(new Date().getFullYear()).subscribe((items) => {
      this.holidays = items;
      this.index = 0;
    });
  }

  prev(): void {
    if (!this.holidays.length) return;
    this.index = (this.index - 1 + this.holidays.length) % this.holidays.length;
  }

  next(): void {
    if (!this.holidays.length) return;
    this.index = (this.index + 1) % this.holidays.length;
  }
}
