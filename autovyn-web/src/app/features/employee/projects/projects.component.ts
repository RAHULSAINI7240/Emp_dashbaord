import { Component } from '@angular/core';
import { DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { ProjectItem, ProjectPerson, ProjectService } from '../../../core/services/project.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ProjectEditorDialogComponent } from './project-editor-dialog.component';

@Component({
  selector: 'app-projects',
  imports: [NgFor, NgIf, NgClass, DatePipe, MatIconModule, EmptyStateComponent],
  templateUrl: './projects.component.html',
  styleUrl: './projects.component.scss'
})
export class ProjectsComponent {
  projects: ProjectItem[] = [];
  assignableUsers: ProjectPerson[] = [];
  expandedProjectId: string | null = null;
  canManage = false;

  get activeProjectCount(): number {
    return this.projects.filter((project) => project.status.toLowerCase() === 'active').length;
  }

  get teamRunProjectCount(): number {
    return this.projects.filter((project) => project.members.length > 1).length;
  }

  constructor(
    private readonly projectService: ProjectService,
    private readonly dialog: MatDialog
  ) {
    this.loadWorkspace();
  }

  toggleDetails(projectId: string): void {
    this.expandedProjectId = this.expandedProjectId === projectId ? null : projectId;
  }

  isExpanded(projectId: string): boolean {
    return this.expandedProjectId === projectId;
  }

  openCreateDialog(): void {
    if (!this.canManage) return;
    this.dialog
      .open(ProjectEditorDialogComponent, {
        width: '960px',
        maxWidth: '96vw',
        panelClass: 'project-editor-dialog-panel',
        data: { assignableUsers: this.assignableUsers }
      })
      .afterClosed()
      .subscribe((projectId?: string) => {
        if (!projectId) return;
        this.loadWorkspace();
        this.expandedProjectId = projectId;
      });
  }

  editProject(project: ProjectItem): void {
    if (!this.canManage) return;
    this.dialog
      .open(ProjectEditorDialogComponent, {
        width: '960px',
        maxWidth: '96vw',
        panelClass: 'project-editor-dialog-panel',
        data: { project, assignableUsers: this.assignableUsers }
      })
      .afterClosed()
      .subscribe((projectId?: string) => {
        if (!projectId) return;
        this.loadWorkspace();
        this.expandedProjectId = projectId;
      });
  }

  trackByProject(_: number, project: ProjectItem): string {
    return project.id;
  }

  private loadWorkspace(): void {
    this.projectService.getWorkspace().subscribe((workspace) => {
      this.projects = workspace.items;
      this.assignableUsers = workspace.assignableUsers;
      this.canManage = workspace.canManage;
    });
  }
}
