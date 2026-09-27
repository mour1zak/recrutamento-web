import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { translateApiError } from './api-error';

function httpError(status: number, body: unknown, statusText = 'Error'): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    statusText,
    error: body,
    headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
    url: 'http://localhost:3000/x',
  });
}

/**
 * Mapa "erro do backend → texto na UI" pedido no briefing.
 *
 * Cada caso aqui é um contrato real do backend (README §5/§6): o `reason`
 * machine-readable quando existe, a mensagem em pt-BR quando não existe, e as
 * duas regras de produto — 404 nunca vira "sem permissão" e 403 idealmente nem
 * chega a acontecer (a UI esconde a ação).
 */
describe('translateApiError — mapa de erros da UI', () => {
  it('409 candidatura_duplicada → "Você já se candidatou a esta vaga."', () => {
    const error = translateApiError(
      httpError(409, {
        statusCode: 409,
        error: 'Conflict',
        reason: 'candidatura_duplicada',
        message: 'Já existe uma candidatura sua para esta vaga.',
      }),
    );

    expect(error.status).toBe(409);
    expect(error.reason).toBe('candidatura_duplicada');
    expect(error.message).toBe('Você já se candidatou a esta vaga.');
  });

  it('404 (fora do escopo) → "não encontrado", nunca "sem permissão"', () => {
    const error = translateApiError(
      httpError(404, {
        statusCode: 404,
        error: 'Not Found',
        reason: 'company_not_found',
        message: 'Empresa não encontrada.',
      }),
    );

    expect(error.status).toBe(404);
    expect(error.message).toBe('Empresa não encontrada.');
    expect(error.message.toLowerCase()).not.toContain('permiss');
  });

  it('404 sem reason conhecido cai no genérico "Não encontrado."', () => {
    const error = translateApiError(httpError(404, { statusCode: 404, error: 'Not Found' }));
    expect(error.message).toBe('Não encontrado.');
  });

  it('400 cep_nao_encontrado → mensagem pedida no briefing', () => {
    const error = translateApiError(
      httpError(400, {
        statusCode: 400,
        error: 'Bad Request',
        reason: 'cep_nao_encontrado',
        message: 'CEP informado não existe.',
      }),
    );
    expect(error.message).toBe('CEP não encontrado, verifique e tente novamente.');
  });

  it('502 servico_cep_indisponivel → permite continuar com endereço em branco', () => {
    const error = translateApiError(
      httpError(502, {
        statusCode: 502,
        error: 'Bad Gateway',
        reason: 'servico_cep_indisponivel',
        message: 'Não foi possível consultar o CEP agora.',
      }),
    );
    expect(error.message).toContain('você pode continuar');
    expect(error.message).toContain('endereço fica em branco');
  });

  it('403 permission_denied → mensagem neutra de permissão', () => {
    const error = translateApiError(
      httpError(403, {
        statusCode: 403,
        error: 'Forbidden',
        reason: 'permission_denied',
        message: 'Você não tem permissão para executar esta ação.',
      }),
    );
    expect(error.message).toBe('Você não tem permissão para executar esta ação.');
  });

  it('401 → texto canônico de sessão expirada (detalhe interno fica em detail)', () => {
    const error = translateApiError(
      httpError(401, { statusCode: 401, error: 'Unauthorized', message: 'JWT expirado.' }),
    );
    expect(error.message).toContain('Sessão expirada');
    expect(error.detail).toBe('JWT expirado.');
  });

  it('401 sem corpo também tem mensagem útil', () => {
    const error = translateApiError(httpError(401, null));
    expect(error.message).toContain('Sessão expirada');
  });

  it('400 de validação de DTO traz os erros campo a campo', () => {
    const error = translateApiError(
      httpError(400, {
        statusCode: 400,
        error: 'Bad Request',
        message: ['email must be an email', 'password must be longer than or equal to 8 characters'],
      }),
    );

    expect(error.fieldErrors).toHaveLength(2);
    expect(error.fieldErrors?.[0]).toContain('email must be an email');
    expect(error.message).toContain('Verifique os dados');
  });

  it('409 de regra de negócio conhecida do módulo de vagas', () => {
    expect(translateApiError(httpError(409, { reason: 'job_not_fully_filled', message: 'x' })).message).toContain(
      'todas as posições',
    );
    expect(translateApiError(httpError(409, { reason: 'no_vacancies_left', message: 'x' })).message).toContain(
      'Não há mais vagas',
    );
    expect(translateApiError(httpError(409, { reason: 'application_ja_encerrada', message: 'x' })).message).toContain(
      'já foi encerrada',
    );
    expect(translateApiError(httpError(400, { reason: 'invalid_status_transition', message: 'x' })).message).toContain(
      'não é permitida',
    );
  });

  it('erros de upload de documento', () => {
    expect(translateApiError(httpError(400, { reason: 'mime_type_invalido', message: 'x' })).message).toContain(
      'PDF, DOC ou DOCX',
    );
    expect(
      translateApiError(httpError(400, { reason: 'arquivo_excede_tamanho_maximo', message: 'x' })).message,
    ).toContain('5 MB');
    expect(translateApiError(httpError(400, { reason: 'arquivo_ausente', message: 'x' })).message).toContain(
      'Selecione um arquivo',
    );
  });

  it('RBAC: concorrência ao salvar permissões é retryável e diz isso', () => {
    expect(translateApiError(httpError(409, { reason: 'concorrencia_transacao', message: 'x' })).message).toContain(
      'Tente salvar de novo',
    );
    expect(translateApiError(httpError(409, { reason: 'sem_papel_com_role_manage', message: 'x' })).message).toContain(
      'Pelo menos um papel',
    );
  });

  it('status 0 (API fora do ar / CORS) orienta verificar o backend', () => {
    const error = translateApiError(
      new HttpErrorResponse({ status: 0, error: null, url: 'http://localhost:3000/jobs' }),
    );
    expect(error.status).toBe(0);
    expect(error.message).toContain('localhost:3000');
  });

  it('erro que não é HttpErrorResponse não quebra a UI', () => {
    expect(translateApiError(new TypeError('boom')).message).toContain('Erro inesperado');
    expect(translateApiError('texto').detail).toBe('texto');
  });
});
