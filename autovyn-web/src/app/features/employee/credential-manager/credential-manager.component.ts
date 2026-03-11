import { Component } from '@angular/core';
import { DatePipe, NgFor, NgIf } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { combineLatest, map } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { CredentialManagerService } from '../../../core/services/credential-manager.service';
import { ToastService } from '../../../core/services/toast.service';
import { ManagedCredential, CredentialInput } from '../../../shared/models/credential.model';
import { User } from '../../../shared/models/user.model';
import { MatIconModule } from '@angular/material/icon';

interface CredentialView extends ManagedCredential {
  ownerName: string;
  ownerCode: string;
}

@Component({
  selector: 'app-credential-manager',
  imports: [NgFor, NgIf, DatePipe, ReactiveFormsModule, MatIconModule],
  templateUrl: './credential-manager.component.html',
  styleUrl: './credential-manager.component.scss'
})
export class CredentialManagerComponent {
  readonly form;
  credentials: CredentialView[] = [];
  employeeOptions: User[] = [];
  currentUser: User | null = null;
  selectedOwnerFilter = 'ALL';
  searchTerm = '';
  editingId: string | null = null;
  revealMap: Record<string, boolean> = {};
  saving = false;
  editorOpen = false;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly credentialManagerService: CredentialManagerService,
    private readonly toastService: ToastService
  ) {
    this.form = this.fb.group({
      ownerUserId: ['', Validators.required],
      systemName: ['', [Validators.required, Validators.minLength(2)]],
      credentialLabel: ['', [Validators.required, Validators.minLength(2)]],
      loginId: ['', Validators.required],
      password: ['', Validators.required],
      accessUrl: [''],
      notes: ['']
    });

    combineLatest([
      this.authService.currentUser$,
      this.authService.getUsers(),
      this.credentialManagerService.credentials$
    ])
      .pipe(
        map(([currentUser, users, credentials]) => {
          this.credentialManagerService.ensureDefaults(users);
          const employeeOptions = [...users].sort((a, b) => a.name.localeCompare(b.name));
          const userMap = new Map(employeeOptions.map((user) => [user.id, user]));
          const visible = currentUser?.roles.includes('HR') || currentUser?.roles.includes('ADMIN')
            ? credentials
            : credentials.filter((item) => item.ownerUserId === currentUser?.id);

          return {
            currentUser,
            employeeOptions,
            credentials: visible.map((item) => {
              const owner = userMap.get(item.ownerUserId);
              return {
                ...item,
                ownerName: owner?.name ?? 'Unknown user',
                ownerCode: owner?.employeeId || owner?.adminId || owner?.id || item.ownerUserId
              };
            })
          };
        })
      )
      .subscribe(({ currentUser, employeeOptions, credentials }) => {
        this.currentUser = currentUser;
        this.employeeOptions = employeeOptions;
        this.credentials = credentials;

        if (this.canManage && !this.editingId && !this.form.value.ownerUserId) {
          this.form.patchValue({ ownerUserId: employeeOptions[0]?.id ?? '' });
        }
      });
  }

  get canManage(): boolean {
    return Boolean(this.currentUser?.roles.includes('HR') || this.currentUser?.roles.includes('ADMIN'));
  }

  get filteredCredentials(): CredentialView[] {
    return this.credentials.filter((item) => {
      const matchesOwner = this.selectedOwnerFilter === 'ALL' || item.ownerUserId === this.selectedOwnerFilter;
      const haystack = `${item.systemName} ${item.credentialLabel} ${item.loginId} ${item.ownerName}`.toLowerCase();
      const matchesSearch = !this.searchTerm.trim() || haystack.includes(this.searchTerm.trim().toLowerCase());
      return matchesOwner && matchesSearch;
    });
  }

  get totalCredentials(): number {
    return this.filteredCredentials.length;
  }

  get systemCount(): number {
    return new Set(this.filteredCredentials.map((item) => item.systemName.toLowerCase())).size;
  }

  get ownerCount(): number {
    return new Set(this.filteredCredentials.map((item) => item.ownerUserId)).size;
  }

  updateSearch(term: string): void {
    this.searchTerm = term;
  }

  updateOwnerFilter(ownerUserId: string): void {
    this.selectedOwnerFilter = ownerUserId;
  }

  submit(): void {
    if (!this.canManage) {
      this.toastService.show('Only HR can create or update credentials.', 'error');
      return;
    }

    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const payload: CredentialInput = {
      ownerUserId: value.ownerUserId ?? '',
      systemName: value.systemName ?? '',
      credentialLabel: value.credentialLabel ?? '',
      loginId: value.loginId ?? '',
      password: value.password ?? '',
      accessUrl: value.accessUrl ?? '',
      notes: value.notes ?? ''
    };

    this.saving = true;
    const request$ = this.editingId
      ? this.credentialManagerService.update(this.editingId, payload)
      : this.credentialManagerService.create(payload);

    request$.subscribe((result) => {
      this.saving = false;
      if (!result) {
        this.toastService.show('Unable to save credential.', 'error');
        return;
      }
      this.toastService.show(this.editingId ? 'Credential updated.' : 'Credential created.', 'success');
      this.resetForm();
      this.editorOpen = false;
    });
  }

  openCreateDialog(): void {
    if (!this.canManage) return;
    this.resetForm();
    this.editorOpen = true;
  }

  startEdit(item: CredentialView): void {
    if (!this.canManage) return;

    this.editingId = item.id;
    this.editorOpen = true;
    this.form.patchValue({
      ownerUserId: item.ownerUserId,
      systemName: item.systemName,
      credentialLabel: item.credentialLabel,
      loginId: item.loginId,
      password: item.password,
      accessUrl: item.accessUrl ?? '',
      notes: item.notes ?? ''
    });
  }

  remove(item: CredentialView): void {
    if (!this.canManage) {
      this.toastService.show('Only HR can delete credentials.', 'error');
      return;
    }

    this.credentialManagerService.delete(item.id).subscribe((deleted) => {
      if (!deleted) {
        this.toastService.show('Unable to delete credential.', 'error');
        return;
      }
      if (this.editingId === item.id) {
        this.resetForm();
      }
      this.toastService.show('Credential deleted.', 'success');
    });
  }

  resetForm(): void {
    this.editingId = null;
    this.form.reset({
      ownerUserId: this.employeeOptions[0]?.id ?? '',
      systemName: '',
      credentialLabel: '',
      loginId: '',
      password: '',
      accessUrl: '',
      notes: ''
    });
  }

  closeEditor(): void {
    if (this.saving) return;
    this.editorOpen = false;
    this.resetForm();
  }

  toggleReveal(id: string): void {
    this.revealMap[id] = !this.revealMap[id];
  }

  maskedPassword(password: string): string {
    return '•'.repeat(Math.max(password.length, 8));
  }

  copyValue(value: string, label: string): void {
    if (!value) {
      this.toastService.show(`No ${label.toLowerCase()} to copy.`, 'error');
      return;
    }

    const copied = this.tryClipboardCopy(value);
    if (!copied) {
      this.toastService.show(`Unable to copy ${label.toLowerCase()}.`, 'error');
      return;
    }

    this.toastService.show(`${label} copied.`, 'success');
  }

  private tryClipboardCopy(value: string): boolean {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value);
      return true;
    }

    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  }
}
