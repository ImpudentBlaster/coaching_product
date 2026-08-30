export type User = {
  id: string; email: string; role: 'PLATFORM_ADMIN' | 'COACH' | 'CLIENT';
  displayName: string; businessName: string | null;
  approvalStatus: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'; createdAt: string;
};

export type ClientRelationship = {
  id: string; coachId: string; clientId: string; status: User['approvalStatus'];
  rejectionReason: string | null; createdAt: string; client: User;
};

export type Invitation = {
  id: string; coachId: string; email: string; expiresAt: string; usedAt: string | null;
  revokedAt: string | null; createdAt: string; status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
};

export type AdminOverview = {
  totalCoaches: number; pendingCoaches: number; approvedCoaches: number;
  suspendedCoaches: number; totalClients: number; pendingClients: number;
};

export type AuditEvent = {
  id: string; action: string; entityType: string; entityId: string;
  actorEmail: string | null; subjectEmail: string | null;
  metadata: Record<string, unknown>; createdAt: string;
};

export type Exercise = { id:string;name:string;bodyPart:string;equipment:string;target:string;secondaryMuscles:string[];instructions:string[];gifAvailable:boolean };
export type WorkoutTemplate = { id:string;name:string;description:string;archived_at:string|null;exercises:Array<{exerciseId:string;name:string;position:number;sets:number;repetitions:number|null;durationSeconds:number|null;restSeconds:number;targetRpe:number|null;tempo:string|null;notes:string|null;instructions?:string[];gifAvailable?:boolean}> };
export type Program = { id:string;name:string;description:string;status:'DRAFT'|'PUBLISHED'|'ARCHIVED';days:Array<{templateId:string;templateName:string;dayLabel:string;position:number}> };
export type ProgramAssignment = { id:string;programId:string;snapshot:{name:string;description:string;days:Array<{dayLabel:string;name:string;exercises:WorkoutTemplate['exercises']}>};assignedAt:string };

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3000/api/v1';
let accessToken: string | null = null;
let refreshRequest: Promise<void> | null = null;

export function setAccessToken(token: string | null): void { accessToken = token; }

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await send(path, init);
  if (response.status === 401 && !path.startsWith('/auth/')) {
    refreshRequest ??= refreshAccessToken().finally(() => { refreshRequest = null; });
    await refreshRequest;
    response = await send(path, init);
  }
  const text = await response.text();
  const body = text ? JSON.parse(text) as T & { message?: string } : undefined;
  if (!response.ok) throw new Error(body?.message ?? 'Request failed');
  return body as T;
}

async function send(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('content-type', 'application/json');
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  return fetch(`${apiUrl}${path}`, { ...init, headers, credentials: 'include' });
}

async function refreshAccessToken(): Promise<void> {
  const response = await fetch(`${apiUrl}/auth/refresh`, { method: 'POST', credentials: 'include' });
  if (!response.ok) { accessToken = null; throw new Error('Your session expired. Please sign in again.'); }
  const result = await response.json() as { accessToken: string };
  accessToken = result.accessToken;
}
