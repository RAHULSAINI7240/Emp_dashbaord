import { Component } from '@angular/core';
import { AsyncPipe, NgFor } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { combineLatest, map, Observable, startWith } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { User } from '../../../shared/models/user.model';

@Component({
  selector: 'app-employee-connect',
  imports: [AsyncPipe, NgFor, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  templateUrl: './employee-connect.component.html',
  styleUrl: './employee-connect.component.scss'
})
export class EmployeeConnectComponent {
  filters;
  team$: Observable<User[]>;
  cityOptions$: Observable<string[]>;
  filtered$: Observable<User[]>;

  constructor(private readonly fb: FormBuilder, private readonly authService: AuthService) {
    this.filters = this.fb.group({ search: [''], city: [''], workMode: [''] });
    this.team$ = this.authService.getTeamMembers();
    this.cityOptions$ = this.team$.pipe(
      map((list) =>
        [...new Set(list.map((item) => item.city).filter(Boolean))].sort((a, b) => a.localeCompare(b))
      )
    );
    this.filtered$ = this.applyFilter();
  }

  private applyFilter(): Observable<User[]> {
    return combineLatest([
      this.team$,
      this.filters.valueChanges.pipe(startWith(this.filters.getRawValue()))
    ]).pipe(
      map(([list, form]) =>
        list.filter((u) => {
          const search = (form.search ?? '').toString().trim().toLowerCase();
          const city = (form.city ?? '').toString();
          const workMode = (form.workMode ?? '').toString();

          const matchSearch =
            !search ||
            u.name.toLowerCase().includes(search) ||
            (u.designation ?? '').toLowerCase().includes(search) ||
            (u.email ?? '').toLowerCase().includes(search) ||
            (u.mobile ?? '').toLowerCase().includes(search) ||
            (u.employeeId ?? '').toLowerCase().includes(search) ||
            (u.adminId ?? '').toLowerCase().includes(search);
          const matchCity = !city || u.city === city;
          const matchWork = !workMode || u.workMode === workMode;
          return matchSearch && matchCity && matchWork;
        })
      )
    );
  }

  callUser(user: User): void {
    if (!user.mobile) return;
    window.location.href = `tel:${user.mobile}`;
  }

  emailUser(user: User): void {
    if (!user.email) return;
    const subject = encodeURIComponent('Autovyn Connect');
    window.location.href = `mailto:${user.email}?subject=${subject}`;
  }
}
