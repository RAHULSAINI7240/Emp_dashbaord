import { Component } from '@angular/core';
import { NgIf } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { AuthService, RegisterUserInput } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Role, User } from '../../../shared/models/user.model';

@Component({
  selector: 'app-register-user',
  imports: [ReactiveFormsModule, NgIf, MatFormFieldModule, MatInputModule, MatSelectModule, MatIconModule],
  templateUrl: './register-user.component.html',
  styleUrl: './register-user.component.scss'
})
export class RegisterUserComponent {
  readonly form;
  createdUser?: User;
  defaultPassword = '';

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly toastService: ToastService
  ) {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      mobile: ['', [Validators.required, Validators.pattern(/^[0-9]{10,15}$/)]],
      email: ['', [Validators.required, Validators.email]],
      department: ['', Validators.required],
      designation: ['', Validators.required],
      city: ['', Validators.required],
      joiningDate: ['', Validators.required],
      dateOfBirth: [''],
      gender: [''],
      emergencyContact: ['', [Validators.pattern(/^[0-9]{10,15}$/)]],
      address: [''],
      role: ['EMPLOYEE' as Role, Validators.required],
      workMode: ['WFO' as 'WFO' | 'WFH' | 'HYBRID', Validators.required]
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastService.show('Please fill all mandatory fields correctly.', 'error');
      return;
    }
    const value = this.form.getRawValue();
    const payload: RegisterUserInput = {
      name: value.name ?? '',
      mobile: value.mobile ?? '',
      email: value.email ?? '',
      department: value.department ?? '',
      designation: value.designation ?? '',
      city: value.city ?? '',
      joiningDate: value.joiningDate ?? '',
      dateOfBirth: value.dateOfBirth ?? '',
      gender: value.gender ?? '',
      emergencyContact: value.emergencyContact ?? '',
      address: value.address ?? '',
      role: value.role ?? 'EMPLOYEE',
      workMode: value.workMode ?? 'WFO'
    };
    this.authService.registerUser(payload).subscribe((created) => {
      if (!created.user.id || !created.defaultPassword) {
        this.toastService.show('Failed to create user. Check backend connection and permissions.', 'error');
        return;
      }

      this.createdUser = created.user;
      this.defaultPassword = created.defaultPassword;
      this.toastService.show(`User ${created.user.name} created successfully.`, 'success');
      this.form.reset({
        department: '',
        joiningDate: '',
        role: 'EMPLOYEE',
        workMode: 'WFO'
      });
    });
  }
}
