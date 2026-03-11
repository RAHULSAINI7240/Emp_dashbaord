import { Component, inject } from '@angular/core';
import { NgFor } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ProjectItem, ProjectPerson, ProjectService, SaveProjectInput } from '../../../core/services/project.service';
import { ToastService } from '../../../core/services/toast.service';

export interface ProjectEditorDialogData {
  project?: ProjectItem;
  assignableUsers: ProjectPerson[];
}

@Component({
  selector: 'app-project-editor-dialog',
  imports: [
    NgFor,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './project-editor-dialog.component.html',
  styleUrl: './project-editor-dialog.component.scss'
})
export class ProjectEditorDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<ProjectEditorDialogComponent>);
  private readonly projectService = inject(ProjectService);
  private readonly toastService = inject(ToastService);
  readonly data = inject<ProjectEditorDialogData>(MAT_DIALOG_DATA);

  readonly form = this.fb.group({
    name: [this.data.project?.name ?? '', [Validators.required, Validators.minLength(2)]],
    client: [this.data.project?.client ?? '', [Validators.required, Validators.minLength(2)]],
    category: [this.data.project?.category ?? 'Frontend', Validators.required],
    status: [this.data.project?.status ?? 'Active', Validators.required],
    teamName: [this.data.project?.teamName ?? ''],
    frontendStack: [this.data.project?.frontendStack ?? 'Angular'],
    backendStack: [this.data.project?.backendStack ?? ''],
    qaSummary: [this.data.project?.qaSummary ?? ''],
    supportSummary: [this.data.project?.supportSummary ?? ''],
    summary: [this.data.project?.summary ?? '', [Validators.required, Validators.minLength(10)]],
    modulesText: [this.data.project?.modules.join('\n') ?? ''],
    highlightsText: [this.data.project?.highlights.join('\n') ?? ''],
    memberIds: [this.data.project?.members.map((member) => member.id) ?? <string[]>[], Validators.required]
  });

  isSaving = false;

  get isEditMode(): boolean {
    return !!this.data.project;
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastService.show('Please fill the project details correctly.', 'error');
      return;
    }

    const raw = this.form.getRawValue();
    const payload: SaveProjectInput = {
      name: raw.name ?? '',
      client: raw.client ?? '',
      category: raw.category ?? '',
      status: raw.status ?? '',
      teamName: raw.teamName ?? '',
      frontendStack: raw.frontendStack ?? '',
      backendStack: raw.backendStack ?? '',
      qaSummary: raw.qaSummary ?? '',
      supportSummary: raw.supportSummary ?? '',
      summary: raw.summary ?? '',
      modules: this.parseLines(raw.modulesText),
      highlights: this.parseLines(raw.highlightsText),
      memberIds: raw.memberIds ?? []
    };

    this.isSaving = true;
    const request$ = this.data.project
      ? this.projectService.update(this.data.project.id, payload)
      : this.projectService.create(payload);

    request$.subscribe((project) => {
      this.isSaving = false;
      if (!project) {
        this.toastService.show('Could not save project. Please try again.', 'error');
        return;
      }

      this.toastService.show(this.isEditMode ? 'Project updated successfully.' : 'Project created successfully.', 'success');
      this.dialogRef.close(project.id);
    });
  }

  private parseLines(value: string | null | undefined): string[] {
    return (value ?? '')
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item, index, all) => all.indexOf(item) === index);
  }
}
