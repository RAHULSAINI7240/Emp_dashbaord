export interface ManagedCredential {
  id: string;
  ownerUserId: string;
  systemName: string;
  credentialLabel: string;
  loginId: string;
  password: string;
  accessUrl?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
}

export interface CredentialInput {
  ownerUserId: string;
  systemName: string;
  credentialLabel: string;
  loginId: string;
  password: string;
  accessUrl?: string;
  notes?: string;
}
