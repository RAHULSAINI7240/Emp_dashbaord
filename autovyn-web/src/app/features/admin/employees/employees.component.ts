import { Component } from '@angular/core';
import { AsyncPipe, NgFor, NgIf } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { combineLatest, map, Observable, startWith } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { AgentLiveStatus, AgentStatusService } from '../../../core/services/agent-status.service';
import { AuthService } from '../../../core/services/auth.service';
import { User } from '../../../shared/models/user.model';

interface EmployeeListItem extends User {
  agentActive: boolean;
  agentLiveStatus: AgentLiveStatus;
}

@Component({
  selector: 'app-employees',
  imports: [AsyncPipe, NgFor, NgIf, RouterLink, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatIconModule],
  templateUrl: './employees.component.html',
  styleUrl: './employees.component.scss'
})
export class EmployeesComponent {
  search;
  filtered$: Observable<EmployeeListItem[]>;

  constructor(
    private readonly fb: FormBuilder,
    private readonly agentStatusService: AgentStatusService,
    private readonly authService: AuthService
  ) {
    this.search = this.fb.control('');
    const users$ = combineLatest([this.authService.getUsers(), this.agentStatusService.getTeamStatusMap()]).pipe(
      map(([users, statusMap]) =>
        users
          .filter((u) => !u.roles.includes('ADMIN'))
          .map((user) => this.decorateUser(user, statusMap))
      )
    );

    this.filtered$ = combineLatest([users$, this.search.valueChanges.pipe(startWith(''))]).pipe(
      map(([users, value]) =>
        users.filter((u) => {
          const query = (value || '').toLowerCase().trim();
          if (!query) return true;
          return (
            u.name.toLowerCase().includes(query) ||
            u.designation.toLowerCase().includes(query) ||
            (u.employeeId ?? '').toLowerCase().includes(query) ||
            (u.adminId ?? '').toLowerCase().includes(query) ||
            (u.email ?? '').toLowerCase().includes(query) ||
            (u.mobile ?? '').includes(query) ||
            (u.agentActive ? 'agent active' : 'agent inactive').includes(query)
          );
        })
      )
    );
  }

  private decorateUser(user: User, statusMap: Map<string, AgentLiveStatus>): EmployeeListItem {
    const agentLiveStatus = statusMap.get(user.id) ?? 'OFFLINE';
    return {
      ...user,
      agentLiveStatus,
      agentActive: this.agentStatusService.isAgentActive(agentLiveStatus)
    };
  }
}
