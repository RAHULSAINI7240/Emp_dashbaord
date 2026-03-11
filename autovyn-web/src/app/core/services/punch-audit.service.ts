import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, map } from 'rxjs';
import { PunchAuditLocation, PunchAuditLog, PunchAuditUpsertInput } from '../../shared/models/punch-audit.model';
import { StorageUtil } from '../../shared/utils/storage.util';

const PUNCH_AUDIT_KEY = 'autovyn_punch_audit';

@Injectable({ providedIn: 'root' })
export class PunchAuditService {
  private readonly officeAnchor = { lat: 12.9716, lng: 77.5946 };
  private readonly officeRadiusKm = 2;
  private readonly state = new BehaviorSubject<Record<string, PunchAuditLog[]>>(this.readState());

  getAllLogs(): Observable<PunchAuditLog[]> {
    return this.state.asObservable().pipe(
      map((state) =>
        Object.values(state)
          .flat()
          .sort((a, b) => {
            const aKey = `${a.date}_${a.punchIn ?? ''}`;
            const bKey = `${b.date}_${b.punchIn ?? ''}`;
            return bKey.localeCompare(aKey);
          })
      )
    );
  }

  upsertFromAttendanceLog(
    employeeId: string,
    employeeName: string,
    input: PunchAuditUpsertInput
  ): void {
    const state = this.state.value;
    const list = [...(state[employeeId] ?? [])];
    const existingIndex = list.findIndex((item) => item.date === input.date);
    const previous = existingIndex > -1 ? list[existingIndex] : undefined;

    const next: PunchAuditLog = {
      id: previous?.id ?? `${employeeId}_${input.date}`,
      employeeId,
      employeeName,
      date: input.date,
      mode: input.mode,
      punchIn: input.punchIn,
      punchOut: input.punchOut,
      workMinutes: input.workMinutes,
      lateByMinutes: input.lateByMinutes,
      inLocation: input.inLocation ? this.withLocationType(input.inLocation, input.mode) : previous?.inLocation,
      outLocation: input.outLocation ? this.withLocationType(input.outLocation, input.mode) : previous?.outLocation,
      faceVerified: input.faceVerified,
      faceScanType: input.faceScanType,
      punchInPhoto: input.punchInPhoto ?? previous?.punchInPhoto
    };

    if (existingIndex > -1) {
      list[existingIndex] = next;
    } else {
      list.push(next);
    }

    state[employeeId] = list.sort((a, b) => a.date.localeCompare(b.date));
    this.persist(state);
    this.state.next({ ...state });
  }

  private withLocationType(
    location: Omit<PunchAuditLocation, 'locationType'>,
    mode: 'OFFICE' | 'HOME'
  ): PunchAuditLocation {
    if (mode === 'HOME') {
      return { ...location, locationType: 'HOME_ZONE' };
    }
    const km = this.distanceKm(location.lat, location.lng, this.officeAnchor.lat, this.officeAnchor.lng);
    return { ...location, locationType: km <= this.officeRadiusKm ? 'OFFICE_ZONE' : 'REMOTE_ZONE' };
  }

  private distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const rad = (value: number) => (value * Math.PI) / 180;
    const dLat = rad(lat2 - lat1);
    const dLng = rad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 6371 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  private readState(): Record<string, PunchAuditLog[]> {
    return StorageUtil.read<Record<string, PunchAuditLog[]>>(PUNCH_AUDIT_KEY, {});
  }

  private persist(state: Record<string, PunchAuditLog[]>): void {
    StorageUtil.write(PUNCH_AUDIT_KEY, state);
  }
}
