import type { ApplicationStatus, DocumentType, InterviewStatus, JobStatus } from './models';

/**
 * Vocabulário de UI: rótulos em pt-BR e "tom" visual de cada status.
 * Centralizado para que badge, filtro, funnel e tabela falem a mesma língua.
 */

export type BadgeTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'muted';

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  DRAFT: 'Rascunho',
  OPEN: 'Aberta',
  PAUSED: 'Pausada',
  FILLED: 'Preenchida',
  CLOSED: 'Encerrada',
  CANCELED: 'Cancelada',
};

export const JOB_STATUS_TONE: Record<JobStatus, BadgeTone> = {
  DRAFT: 'neutral',
  OPEN: 'success',
  PAUSED: 'warning',
  FILLED: 'info',
  CLOSED: 'muted',
  CANCELED: 'danger',
};

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  PENDING: 'Em análise',
  UNDER_REVIEW: 'Em avaliação',
  INTERVIEW: 'Entrevista',
  OFFERED: 'Proposta',
  HIRED: 'Contratado',
  REJECTED: 'Recusado',
  WITHDRAWN: 'Desistência',
};

export const APPLICATION_STATUS_TONE: Record<ApplicationStatus, BadgeTone> = {
  PENDING: 'info',
  UNDER_REVIEW: 'warning',
  INTERVIEW: 'warning',
  OFFERED: 'info',
  HIRED: 'success',
  REJECTED: 'danger',
  WITHDRAWN: 'muted',
};

/** Ordem do funil (usada nos indicadores e nos filtros do recrutador). */
export const APPLICATION_FUNNEL: ApplicationStatus[] = ['PENDING', 'UNDER_REVIEW', 'INTERVIEW', 'OFFERED', 'HIRED'];

export const INTERVIEW_STATUS_LABEL: Record<InterviewStatus, string> = {
  SCHEDULED: 'Agendada',
  COMPLETED: 'Concluída',
  CANCELED: 'Cancelada',
  RESCHEDULED: 'Reagendada',
  NO_SHOW: 'Não compareceu',
};

export const INTERVIEW_STATUS_TONE: Record<InterviewStatus, BadgeTone> = {
  SCHEDULED: 'info',
  COMPLETED: 'success',
  CANCELED: 'muted',
  RESCHEDULED: 'warning',
  NO_SHOW: 'danger',
};

export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  RESUME: 'Currículo',
  COVER_LETTER: 'Carta de apresentação',
  CERTIFICATE: 'Certificado',
  OTHER: 'Outro',
};

export const ROLE_LABEL: Record<string, string> = {
  CANDIDATE: 'Candidato',
  RECRUITER: 'Recrutador',
  ADMIN: 'Administrador',
};

export function roleLabel(role: string | null | undefined): string {
  if (!role) return '—';
  return ROLE_LABEL[role] ?? role;
}

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const DATE_TIME = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const DATE = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });

export function formatSalary(min: number | null | undefined, max: number | null | undefined): string {
  if (min == null && max == null) return 'Salário a combinar';
  if (min != null && max != null) return `${BRL.format(min)} – ${BRL.format(max)}`;
  if (min != null) return `A partir de ${BRL.format(min)}`;
  return `Até ${BRL.format(max as number)}`;
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—';
  return BRL.format(value);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : DATE_TIME.format(date);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : DATE.format(date);
}

/** "há 3 dias" — usado em cards da vitrine. */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `há ${days} d`;
  const months = Math.round(days / 30);
  if (months < 12) return `há ${months} mês${months > 1 ? 'es' : ''}`;
  return `há ${Math.round(months / 12)} ano${months >= 24 ? 's' : ''}`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatPercent(rate: number | null | undefined): string {
  if (rate == null) return '—';
  return `${(rate * 100).toFixed(1).replace('.', ',')}%`;
}

export function formatDays(days: number | null | undefined): string {
  if (days == null) return '—';
  const rounded = Math.round(days * 10) / 10;
  return `${String(rounded).replace('.', ',')} dia${rounded === 1 ? '' : 's'}`;
}

// ---------------------------------------------------------------------------
// Máscaras de entrada (CEP / CNPJ / telefone)
// ---------------------------------------------------------------------------

export function maskCep(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export function isCepComplete(value: string): boolean {
  return /^\d{5}-?\d{3}$/.test(value.trim());
}

export function maskCnpj(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12)
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export function isValidCnpj(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return /^\d{14}$/.test(digits);
}

export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

/** `datetime-local` → ISO com timezone do navegador (o backend exige ISO 8601). */
export function toIsoFromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** ISO → valor aceitável por `<input type="datetime-local">`. */
export function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}
