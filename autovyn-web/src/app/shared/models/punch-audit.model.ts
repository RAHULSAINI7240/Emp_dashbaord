export type FaceScanType = 'FACE_DETECTOR' | 'CAMERA_ONLY' | 'SIMULATED';

export type PunchLocationType = 'OFFICE_ZONE' | 'HOME_ZONE' | 'REMOTE_ZONE';

export interface PunchAuditLocation {
  lat: number;
  lng: number;
  accuracy: number;
  capturedAt: string;
  locationType: PunchLocationType;
}

export interface PunchAuditLog {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  mode: 'OFFICE' | 'HOME';
  punchIn?: string;
  punchOut?: string;
  workMinutes: number;
  lateByMinutes: number;
  inLocation?: PunchAuditLocation;
  outLocation?: PunchAuditLocation;
  faceVerified: boolean;
  faceScanType: FaceScanType;
  punchInPhoto?: string;
}

export interface PunchAuditUpsertInput {
  date: string;
  mode: 'OFFICE' | 'HOME';
  punchIn?: string;
  punchOut?: string;
  workMinutes: number;
  lateByMinutes: number;
  inLocation?: Omit<PunchAuditLocation, 'locationType'>;
  outLocation?: Omit<PunchAuditLocation, 'locationType'>;
  faceVerified: boolean;
  faceScanType: FaceScanType;
  punchInPhoto?: string;
}
