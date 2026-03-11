import { Component } from '@angular/core';
import { NgIf } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { User } from '../../../shared/models/user.model';

@Component({
  selector: 'app-profile',
  imports: [NgIf],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent {
  readonly maxPhotoBytes = 2 * 1024 * 1024;
  isUploading = false;

  constructor(
    public readonly authService: AuthService,
    private readonly toastService: ToastService
  ) {}

  get currentUser(): User | null {
    return this.authService.getCurrentUserSnapshot();
  }

  onPhotoSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.toastService.show('Please choose an image file only.', 'error');
      target.value = '';
      return;
    }

    if (file.size > this.maxPhotoBytes) {
      this.toastService.show('Max image size is 2MB.', 'error');
      target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) return;
      this.isUploading = true;
      this.authService.updateMyProfilePhoto(result).subscribe((updated) => {
        this.isUploading = false;
        if (!updated) {
          this.toastService.show('Unable to update profile photo.', 'error');
          return;
        }
        this.toastService.show('Profile photo updated.', 'success');
      });
    };

    reader.onerror = () => {
      this.toastService.show('Failed to read image.', 'error');
      this.isUploading = false;
    };

    reader.readAsDataURL(file);
    target.value = '';
  }
}
