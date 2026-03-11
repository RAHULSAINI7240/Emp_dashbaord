import { Component } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AnnouncementItem, AnnouncementService } from '../../../core/services/announcement.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-announcements',
  imports: [NgFor, NgIf, ReactiveFormsModule],
  templateUrl: './announcements.component.html',
  styleUrl: './announcements.component.scss'
})
export class AnnouncementsComponent {
  announcements: AnnouncementItem[] = [];
  posting = false;
  showCreateDialog = false;
  readonly form;

  constructor(
    private readonly fb: FormBuilder,
    private readonly announcementService: AnnouncementService,
    private readonly authService: AuthService,
    private readonly toastService: ToastService
  ) {
    this.form = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3)]],
      text: ['', [Validators.required, Validators.minLength(5)]],
      imageUrl: ['']
    });
    this.loadAnnouncements();
  }

  get canCreate(): boolean {
    const current = this.authService.getCurrentUserSnapshot();
    if (!current) return false;
    return current.roles.includes('ADMIN') || current.roles.includes('HR');
  }

  submit(): void {
    if (!this.canCreate) {
      this.toastService.show('Only Admin/HR can publish announcements.', 'error');
      return;
    }
    if (this.form.invalid || this.posting) {
      this.form.markAllAsTouched();
      return;
    }

    this.posting = true;
    const raw = this.form.getRawValue();
    const payload = {
      title: (raw.title ?? '').trim(),
      body: (raw.text ?? '').trim(),
      imageUrl: (raw.imageUrl ?? '').trim() || undefined
    };

    this.announcementService.create(payload).subscribe((created) => {
      this.posting = false;
      if (!created) {
        this.toastService.show('Failed to publish announcement.', 'error');
        return;
      }
      this.toastService.show('Announcement published successfully.', 'success');
      this.closeCreateDialog();
      this.loadAnnouncements();
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

  private loadAnnouncements(): void {
    this.announcementService.list().subscribe((items) => {
      this.announcements = items;
    });
  }
}
