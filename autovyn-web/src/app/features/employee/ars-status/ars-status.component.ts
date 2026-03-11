import { Component } from '@angular/core';
import { AsyncPipe, NgFor } from '@angular/common';
import { ArsService } from '../../../core/services/ars.service';
import { AuthService } from '../../../core/services/auth.service';
import { Observable } from 'rxjs';
import { ARSRequest } from '../../../shared/models/ars.model';

@Component({
  selector: 'app-ars-status',
  imports: [AsyncPipe, NgFor],
  templateUrl: './ars-status.component.html',
  styleUrl: './ars-status.component.scss'
})
export class ArsStatusComponent {
  requests$: Observable<ARSRequest[]>;

  constructor(private readonly arsService: ArsService, private readonly authService: AuthService) {
    this.requests$ = this.arsService.getByEmployee(this.authService.getCurrentUserSnapshot()?.id || '');
  }
}
