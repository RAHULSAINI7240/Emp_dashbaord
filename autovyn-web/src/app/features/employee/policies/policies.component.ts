import { Component } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { PolicyData, PolicyService } from '../../../core/services/policy.service';

interface PolicySection {
  title: string;
  icon: string;
  points: string[];
}

@Component({
  selector: 'app-policies',
  imports: [NgIf, NgFor, MatIconModule],
  templateUrl: './policies.component.html',
  styleUrls: ['./policies.component.scss']
})
export class PoliciesComponent {
  policy: PolicyData | null = null;
  sections: PolicySection[] = [];

  constructor(private readonly policyService: PolicyService) {
    this.policyService.getPolicies().subscribe((data) => {
      this.policy = data;
      this.sections = this.buildSections(data);
    });
  }

  private buildSections(policy: PolicyData | null): PolicySection[] {
    return [
      {
        title: 'Attendance Policy',
        icon: 'fact_check',
        points: this.toPoints(
          policy?.attendancePolicy,
          [
            'Daily attendance must be captured with punch in and punch out.',
            'Standard required work duration is 8 hours 30 minutes.',
            'Late marking applies when login is after approved shift timing.',
            'Photo capture and location evidence remain part of attendance verification.'
          ]
        )
      },
      {
        title: 'Leave Policy',
        icon: 'event_available',
        points: this.toPoints(
          policy?.leavePolicy,
          [
            'Leave requests must be submitted through the portal before approval.',
            'Approved leave is reflected in attendance and reporting views.',
            'Managers and HR review leave requests according to business rules.'
          ]
        )
      },
      {
        title: 'Employee Policy',
        icon: 'policy',
        points: [
          'Employees must keep project, attendance, and profile data accurate and updated.',
          'Assigned credentials and project access are for authorized work only.',
          'Monthly productivity, attendance, and policy compliance remain visible to reporting managers and admin.',
          'Holiday, attendance, and leave workflows follow company portal records.'
        ]
      }
    ];
  }

  private toPoints(value: string | undefined, fallback: string[]): string[] {
    const normalized = (value ?? '')
      .split(/\n+/)
      .map((item) => item.replace(/^[\s\-•\d.]+/, '').trim())
      .filter(Boolean);
    return normalized.length ? normalized : fallback;
  }
}
