import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface CommentDialogData {
  title: string;
  submitLabel: string;
  required?: boolean;
}

@Component({
  selector: 'app-comment-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  templateUrl: './comment-dialog.component.html',
  styleUrl: './comment-dialog.component.scss'
})
export class CommentDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<CommentDialogComponent>);
  readonly data = inject<CommentDialogData>(MAT_DIALOG_DATA);

  readonly form = this.fb.group({
    comment: ['', this.data.required ? Validators.required : []]
  });

  submit(): void {
    this.dialogRef.close((this.form.value.comment || '').trim());
  }
}
