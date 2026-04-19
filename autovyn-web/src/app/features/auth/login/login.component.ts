import { Component } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NgFor } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { firstValueFrom } from 'rxjs';
import { AgentStatusService } from '../../../core/services/agent-status.service';
import { AuthService } from '../../../core/services/auth.service';
import { ModalService } from '../../../core/services/modal.service';
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
    private readonly agentStatusService: AgentStatusService,
    private readonly authService: AuthService,
    private readonly modalService: ModalService,
    private readonly toastService: ToastService,
    private readonly router: Router
  ) {
    this.form = this.fb.group({
      userId: ['', Validators.required],
      password: ['', Validators.required]
    });
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastService.show('Login ID and password are required.', 'error');
      return;
    }
    if (this.submitting) return;
    this.submitting = true;
    const userId = this.form.value.userId || '';
    const password = this.form.value.password || '';
    try {
      const user = await firstValueFrom(this.authService.login(userId, password));
      if (!user) {
        this.toastService.show('Unable to login. Please verify your credentials.', 'error');
        return;
      }

      const shouldWarnAboutAgent = !user.roles.includes('ADMIN') && (await this.shouldWarnAboutInactiveAgent(user.id));
      this.toastService.show(`Welcome ${user.name}`, 'success');
      await this.router.navigateByUrl(this.authService.getDefaultRoute());

      if (shouldWarnAboutAgent) {
        this.modalService.openAgentInactiveNotice(user.employeeId ?? user.adminId);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to login. Please try again.';
      this.toastService.show(message, 'error');
    } finally {
      this.submitting = false;
    }
  }

  private async shouldWarnAboutInactiveAgent(userId: string): Promise<boolean> {
    try {
      const status = await firstValueFrom(this.agentStatusService.getUserStatus(userId));
      return !this.agentStatusService.isAgentActive(status);
    } catch {
      return false;
    }
  }
}
