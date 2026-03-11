import { Component } from '@angular/core';
import { AsyncPipe, NgFor, NgIf } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { combineLatest, map, Observable, startWith } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { User } from '../../../shared/models/user.model';

@Component({
  selector: 'app-employees',
  imports: [AsyncPipe, NgFor, NgIf, RouterLink, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatIconModule],
  templateUrl: './employees.component.html',
  styleUrl: './employees.component.scss'
})
export class EmployeesComponent {
  search;
  users$: Observable<User[]>;
  filtered$: Observable<User[]>;

  constructor(private readonly fb: FormBuilder, private readonly authService: AuthService) {
    this.search = this.fb.control('');
    this.users$ = this.authService.getUsers().pipe(
      map((users) => users.filter((u) => !u.roles.includes('ADMIN')))
    );
    this.filtered$ = combineLatest([this.users$, this.search.valueChanges.pipe(startWith(''))]).pipe(
      map(([users, value]) =>
        users.filter((u) => {
          const query = (value || '').toLowerCase().trim();
          if (!query) return true;
          return (
            u.name.toLowerCase().includes(query) ||
            u.designation.toLowerCase().includes(query) ||
            (u.email ?? '').toLowerCase().includes(query) ||
            (u.mobile ?? '').includes(query)
          );
        })
      )
    );
  }
}
