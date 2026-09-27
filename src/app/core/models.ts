/**
 * Tipos do domínio — espelham exatamente os payloads devolvidos pelo backend
 * `recrutamento-api` (fonte de verdade: `README.md` §5 + os DTOs do backend).
 *
 * Nada aqui é inventado: se um campo é `null` no backend, ele é `| null` aqui.
 */

// ---------------------------------------------------------------------------
// Enums (mesmos valores do `prisma/schema.prisma`)
// ---------------------------------------------------------------------------

export const JOB_STATUS = ['DRAFT', 'OPEN', 'PAUSED', 'FILLED', 'CLOSED', 'CANCELED'] as const;
export type JobStatus = (typeof JOB_STATUS)[number];

export const APPLICATION_STATUS = [
  'PENDING',
  'UNDER_REVIEW',
  'INTERVIEW',
  'OFFERED',
  'HIRED',
  'REJECTED',
  'WITHDRAWN',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUS)[number];

export const INTERVIEW_STATUS = ['SCHEDULED', 'COMPLETED', 'CANCELED', 'RESCHEDULED', 'NO_SHOW'] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUS)[number];

export const DOCUMENT_TYPE = ['RESUME', 'COVER_LETTER', 'CERTIFICATE', 'OTHER'] as const;
export type DocumentType = (typeof DOCUMENT_TYPE)[number];

export type RoleName = 'CANDIDATE' | 'RECRUITER' | 'ADMIN' | (string & {});

// ---------------------------------------------------------------------------
// Paginação (envelope usado por TODAS as listagens do backend)
// ---------------------------------------------------------------------------

export interface Paginated<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
}

export interface ListQuery {
  page?: number;
  limit?: number;
  /** Direção da ordenação (o campo é fixo por listagem no backend). */
  sortOrder?: 'asc' | 'desc';
}

// ---------------------------------------------------------------------------
// Auth / User
// ---------------------------------------------------------------------------

/** `user` devolvido por /auth/login, /auth/register e /auth/refresh. */
export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: RoleName;
}

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

/** Item de `GET /users` (USER_SUMMARY_SELECT — nunca traz `password`). */
export interface UserSummary {
  id: number;
  name: string;
  email: string;
  isActive: boolean;
  roleId: number;
  companyId: number | null;
  createdAt: string;
  role: { name: RoleName };
}

// ---------------------------------------------------------------------------
// Company
// ---------------------------------------------------------------------------

export interface Company {
  id: number;
  name: string;
  cnpj: string | null;
  description: string | null;
  isActive: boolean;
  cep: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  createdAt: string;
  updatedAt: string;
  /** Presente só quando o provedor de CEP estava fora do ar na gravação. */
  addressWarning?: string;
}

export interface CompanyStats {
  companyId: number;
  jobs: { total: number; byStatus: Record<JobStatus, number> };
  applications: {
    total: number;
    byStatus: Record<ApplicationStatus, number>;
    /** Fração (0..1) ou `null` quando ainda não há candidaturas. */
    conversionRate: number | null;
    avgTimeToHireDays: number | null;
  };
}

// ---------------------------------------------------------------------------
// Job
// ---------------------------------------------------------------------------

export interface JobCompanyRef {
  id: number;
  name: string;
}

/** Vaga na vitrine pública (`GET /jobs`) — sem `companyId`/`createdById`/`filledCount`. */
export interface PublicJob {
  id: number;
  title: string;
  description: string;
  isRemote: boolean;
  salaryMin: number | null;
  salaryMax: number | null;
  vacancies: number;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  company: JobCompanyRef;
}

/** Vaga lida por usuário autenticado (`GET /jobs/:id`, `GET /jobs/mine`). */
export interface ScopedJob extends PublicJob {
  companyId: number;
  createdById: number;
  filledCount: number;
}

// ---------------------------------------------------------------------------
// Candidate profile
// ---------------------------------------------------------------------------

/** Payload completo (dono/ADMIN, ou recrutador com candidatura UNDER_REVIEW+). */
export interface CandidateProfileFull {
  id: number;
  name: string;
  headline: string | null;
  summary: string | null;
  phone: string | null;
  cep: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  skills: string[];
  addressWarning?: string;
}

/** Payload reduzido (recrutador com candidatura PENDING/REJECTED/WITHDRAWN). */
export interface CandidateProfileReduced {
  id: number;
  name: string;
  headline: string | null;
  skills: string[];
}

export type CandidateProfile = CandidateProfileFull | CandidateProfileReduced;

export function isFullProfile(profile: CandidateProfile): profile is CandidateProfileFull {
  return 'summary' in profile;
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

/** Resposta de `POST /documents`. */
export interface UploadedDocument {
  id: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

/** Item de `GET /documents/me`. */
export interface DocumentSummary extends UploadedDocument {
  type: DocumentType;
  originalName: string;
  createdAt: string;
}

/** `resumeDocument` embutido numa candidatura. */
export interface ApplicationDocumentRef {
  id: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------

export interface ApplicationJobRef {
  id: number;
  title: string;
  companyId: number;
  status: JobStatus;
  vacancies: number;
  filledCount: number;
}

/** Candidatura completa (dono/ADMIN, ou recrutador com status UNDER_REVIEW+). */
export interface ApplicationFull {
  id: number;
  jobId: number;
  candidateId: number;
  status: ApplicationStatus;
  coverLetter: string | null;
  resumeDocumentId: number | null;
  createdAt: string;
  updatedAt: string;
  job: ApplicationJobRef;
  candidate: { id: number; name: string };
  resumeDocument: ApplicationDocumentRef | null;
}

/** Candidatura reduzida (recrutador enquanto o status é PENDING). */
export interface ApplicationReduced {
  id: number;
  jobId: number;
  status: ApplicationStatus;
  coverLetter: string | null;
  resumeDocument: ApplicationDocumentRef | null;
  createdAt: string;
  candidate: { id: number; name: string; headline: string | null; skills: string[] };
}

export type Application = ApplicationFull | ApplicationReduced;

export function isFullApplication(application: Application): application is ApplicationFull {
  return 'job' in application;
}

// ---------------------------------------------------------------------------
// Interview
// ---------------------------------------------------------------------------

export interface Interview {
  id: number;
  applicationId: number;
  interviewerId: number | null;
  scheduledAt: string;
  durationMinutes: number | null;
  isRemote: boolean;
  location: string | null;
  meetingLink: string | null;
  status: InterviewStatus;
  feedback: string | null;
  previousInterviewId: number | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Roles / permissions (RBAC dinâmico)
// ---------------------------------------------------------------------------

export interface Permission {
  id: number;
  key: string;
  description: string | null;
}

export interface Role {
  id: number;
  name: RoleName;
  description: string | null;
  isSystem: boolean;
  permissions: Permission[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// CEP (integração externa, exposta pelo backend em GET /cep/:cep)
// ---------------------------------------------------------------------------

export interface CepLookup {
  street: string | null;
  city: string | null;
  state: string | null;
}
