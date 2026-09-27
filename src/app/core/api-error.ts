import { HttpErrorResponse } from '@angular/common/http';

/**
 * Corpo de erro padronizado do backend.
 *
 * `{ statusCode, error, reason, message }` a partir do módulo Companies;
 * Auth/Users mantêm o formato antigo (sem `reason`); e `400` de validação de
 * DTO vem com `message: string[]` (uma entrada por regra violada).
 */
export interface ApiErrorBody {
  statusCode?: number;
  error?: string;
  reason?: string;
  message?: string | string[];
}

export interface ApiError {
  status: number;
  /** `reason` machine-readable do backend (quando existe). */
  reason?: string;
  /** Mensagem já traduzida para o usuário final (pt-BR). */
  message: string;
  /** Mensagem crua do backend — útil em log/depuração, nunca é o fallback cego. */
  detail?: string;
  /** Erros de validação campo a campo (400 de DTO). */
  fieldErrors?: string[];
}

/**
 * Mapa pedido no briefing: status/reason do backend → texto na UI.
 *
 * Regra geral adotada aqui: `404` nunca vira "sem permissão" (o backend usa
 * 404 de propósito como resposta anti-enumeração), e `403` idealmente nem
 * acontece — a UI esconde a ação conforme o papel do usuário logado
 * (`PermissionsService`); se acontecer, é mensagem neutra.
 */
const REASON_MESSAGES: Record<string, string> = {
  // Candidaturas
  candidatura_duplicada: 'Você já se candidatou a esta vaga.',
  job_not_open: 'Esta vaga não está mais aberta para candidaturas.',
  application_not_in_interview_stage:
    'Para agendar entrevista, mova a candidatura para o estágio "Entrevista" primeiro.',
  application_ja_encerrada: 'Esta candidatura já foi encerrada e não pode mais ser alterada.',
  application_status_changed_concurrently:
    'Outra pessoa acabou de atualizar esta candidatura. Recarregue a lista e tente de novo.',
  no_vacancies_left: 'Não há mais vagas disponíveis para contratação nesta vaga.',
  resume_document_invalido: 'O currículo selecionado é inválido ou não pertence a você.',

  // Vagas
  invalid_status_transition: 'Esta mudança de status não é permitida a partir do status atual.',
  job_not_fully_filled: 'A vaga só pode ser marcada como preenchida quando todas as posições forem contratadas.',
  vacancies_below_filled_count: 'O número de posições não pode ser menor do que o de pessoas já contratadas.',
  job_not_found: 'Vaga não encontrada.',

  // Empresas
  cnpj_duplicado: 'Já existe uma empresa cadastrada com este CNPJ.',
  company_already_inactive: 'Esta empresa já está desativada.',
  company_already_active: 'Esta empresa já está ativa.',
  company_not_found: 'Empresa não encontrada.',

  // CEP (integração externa)
  cep_nao_encontrado: 'CEP não encontrado, verifique e tente novamente.',
  cep_formato_invalido: 'CEP inválido. Use o formato 00000-000.',
  servico_cep_indisponivel:
    'Não foi possível confirmar o endereço agora — você pode continuar, o endereço fica em branco.',

  // Documentos
  arquivo_ausente: 'Selecione um arquivo para enviar.',
  mime_type_invalido: 'Formato não aceito. Envie o currículo em PDF, DOC ou DOCX.',
  arquivo_excede_tamanho_maximo: 'Arquivo grande demais — o limite é 5 MB.',
  document_not_found: 'Documento não encontrado ou sem permissão de acesso.',

  // Usuários / papéis
  usuario_nao_e_recrutador: 'Só é possível vincular empresa a um usuário com papel de recrutador.',
  recrutador_com_vagas_ativas: 'Este recrutador ainda tem vagas ativas e não pode trocar de papel agora.',
  last_active_admin: 'O sistema precisa de pelo menos um administrador ativo.',
  sem_papel_com_role_manage:
    'Pelo menos um papel precisa manter a permissão de gerenciar papéis — ajuste e tente novamente.',
  concorrencia_transacao: 'Outra alteração de permissões estava em andamento. Tente salvar de novo.',
  role_not_found: 'Papel não encontrado.',
  user_not_found: 'Usuário não encontrado.',

  // Entrevista
  interview_not_found: 'Entrevista não encontrada.',
  interview_ja_encerrada: 'Esta entrevista já foi encerrada e não pode mais ser alterada.',

  // Perfis
  candidate_profile_not_found: 'Perfil de candidato não encontrado.',

  // Auth / autorização
  permission_denied: 'Você não tem permissão para executar esta ação.',
  company_id_obrigatorio: 'Informe a empresa dona da vaga.',
};

const STATUS_FALLBACK: Record<number, string> = {
  400: 'Não foi possível processar a requisição. Verifique os dados informados.',
  401: 'Sessão expirada. Entre novamente para continuar.',
  403: 'Você não tem permissão para executar esta ação.',
  404: 'Não encontrado.',
  409: 'Esta ação conflita com o estado atual dos dados.',
  502: 'Serviço externo indisponível no momento. Tente novamente em instantes.',
  503: 'Serviço temporariamente indisponível. Tente novamente em instantes.',
};

function rawMessage(body: ApiErrorBody | null | undefined): string | undefined {
  if (!body || body.message === undefined) return undefined;
  return Array.isArray(body.message) ? body.message.join(' • ') : body.message;
}

/** Converte qualquer falha de HTTP em um `ApiError` pronto para exibição. */
export function translateApiError(error: unknown): ApiError {
  if (error instanceof HttpErrorResponse) {
    const status = error.status;
    const body = (error.error ?? null) as ApiErrorBody | null;
    const reason = body?.reason;
    const fieldErrors = Array.isArray(body?.message) ? (body!.message as string[]) : undefined;

    // 0 = sem resposta do servidor (API desligada, rede caída, CORS bloqueado).
    if (status === 0) {
      return {
        status: 0,
        message: 'Não foi possível falar com a API. Verifique se o backend está rodando em http://localhost:3000.',
        detail: error.message,
      };
    }

    const translated = reason ? REASON_MESSAGES[reason] : undefined;
    if (translated) {
      return { status, reason, message: translated, detail: rawMessage(body), fieldErrors };
    }

    const fromBackend = rawMessage(body);

    // 401 que chegou até o componente significa que a renovação automática já
    // falhou (o interceptor tenta antes): o texto canônico de sessão encerrada
    // é mais útil do que o detalhe interno do backend ("JWT expirado").
    if (status === 401) {
      return { status, reason, message: STATUS_FALLBACK[401] as string, detail: fromBackend, fieldErrors };
    }

    // Sem `reason` conhecido: usa a mensagem do backend quando ela é legível
    // (o backend já responde em pt-BR) e só então cai no texto genérico.
    const looksHumanReadable =
      !!fromBackend && !Array.isArray(body?.message) && fromBackend.length > 3 && !/^Unknown error$/i.test(fromBackend);

    return {
      status,
      reason,
      message: looksHumanReadable ? fromBackend! : (STATUS_FALLBACK[status] ?? 'Algo deu errado. Tente novamente.'),
      detail: fromBackend,
      fieldErrors,
    };
  }

  return {
    status: 0,
    message: 'Erro inesperado no cliente. Tente novamente.',
    detail: error instanceof Error ? error.message : String(error),
  };
}

/** Atalho para componentes que só precisam do texto. */
export function errorMessage(error: unknown): string {
  return translateApiError(error).message;
}
