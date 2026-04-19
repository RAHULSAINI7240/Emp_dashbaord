import { Component } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NgFor } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { ToastComponent } from '../../../shared/components/toast/toast.component';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, NgFor, MatFormFieldModule, MatInputModule, MatIconModule, MatButtonModule, ToastComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  form;
  hidePassword = true;
  submitting = false;
  featurePills = ['Role Based Login', 'Attendance + Projects', 'Realtime Insights'];

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly toastService: ToastService,
    private readonly router: Router
  ) {
    this.form = this.fb.group({
      userId: ['', Validators.required],
      password: ['', Validators.required]
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastService.show('Login ID and password are required.', 'error');
      return;
    }
    if (this.submitting) return;
    this.submitting = true;
    const userId = this.form.value.userId || '';
    const password = this.form.value.password || '';
    this.authService.login(userId, password).subscribe({
      next: (user) => {
        this.submitting = false;
        if (!user) {
          this.toastService.show('Unable to login. Please verify your credentials.', 'error');
          return;
        }
        this.toastService.show(`Welcome ${user.name}`, 'success');
        this.router.navigateByUrl(this.authService.getDefaultRoute());
      },
      error: (error: unknown) => {
        this.submitting = false;
        const message = error instanceof Error ? error.message : 'Unable to login. Please try again.';
        this.toastService.show(message, 'error');
      }
    });
  }
}
