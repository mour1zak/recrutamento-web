import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { catchError, materialize, of, take } from 'rxjs';
import { ApiError } from '../../../core/api-error';
import { AuthService } from '../../../core/auth/auth.service';
import { DOCUMENT_TYPE_LABEL, formatBytes, formatDateTime, maskPhone } from '../../../core/format';
import type { CandidateProfileFull, DocumentSummary, DocumentType } from '../../../core/models';
import { DOCUMENT_TYPE } from '../../../core/models';
import { CandidateProfileService } from '../../../core/services/candidate-profile.service';
import {
  ACCEPT_ATTRIBUTE,
  DocumentsService,
  MAX_UPLOAD_BYTES,
  openBlobInNewTab,
  validateUpload,
} from '../../../core/services/documents.service';
import { ToastService } from '../../../core/toast.service';
import { CepFieldComponent, CepFieldState } from '../../../shared/forms/cep-field';

/** Object URL local + versão "confiável" para o sanitizer do Angular. */
interface PreviewState {
  raw: string;
  trusted: ReturnType<DomSanitizer['bypassSecurityTrustResourceUrl']>;
}
import { AlertComponent } from '../../../shared/ui/alert';
import { EmptyStateComponent } from '../../../shared/ui/empty-state';
import { LoadingComponent } from '../../../shared/ui/loading';

/**
 * Perfil do candidato (`GET`/`PATCH /candidates/me`) + documentos
 * (`POST /documents`, `GET /documents/me`).
 *
 * Detalhes de contrato que a tela respeita:
 * - `GET /candidates/me` devolve `404 candidate_profile_not_found` enquanto o
 *   perfil não existe → tratado como "primeiro acesso", com o formulário em
 *   branco (o `PATCH` é upsert e cria o perfil);
 * - `street`/`city`/`state` NUNCA são enviados: o backend resolve o endereço a
 *   partir do `cep` (integração ViaCEP) e pode devolver `addressWarning` quando
 *   o provedor estava indisponível — exibido como aviso amarelo, sem bloquear;
 * - upload aceita PDF/DOC/DOCX até 5 MB (validado aqui antes do envio, com as
 *   mesmas mensagens do backend).
 */
@Component({
  selector: 'app-profile-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, AlertComponent, CepFieldComponent, EmptyStateComponent, LoadingComponent],
  template: `
    <div class="container page container--narrow">
      <div class="page-header">
        <div class="page-header__titles">
          <h1>Meu perfil</h1>
          <p class="page-header__subtitle mb-0">
            Estes dados aparecem para os recrutadores das vagas às quais você se candidata — o nível de detalhe que eles
            veem depende do estágio de cada candidatura.
          </p>
        </div>
      </div>

      @if (justRegistered()) {
        <div class="mb-4">
          <app-alert
            kind="success"
            message="Conta criada com sucesso!"
            detail="Complete o perfil e anexe seu currículo para aumentar suas chances."
          />
        </div>
      }

      @if (loading()) {
        <app-loading label="Carregando perfil…" />
      } @else {
        <div class="stack">
          @if (loadError()) {
            <app-alert [message]="loadError()" kind="error" />
          }

          <form class="card form" [formGroup]="form" (ngSubmit)="save()" novalidate>
            <div class="card__header">
              <div>
                <div class="card__title">Dados do candidato</div>
                <div class="card__hint">
                  Nome e email vêm da sua conta ({{ auth.user()?.email }}) e não são editáveis por aqui.
                </div>
              </div>
            </div>

            @if (saveError()) {
              <app-alert [message]="saveError()" kind="error" [detail]="saveErrorDetail()" />
            }
            @if (saveWarning()) {
              <app-alert [message]="saveWarning()" kind="warning" />
            }
            @if (saveSuccess()) {
              <app-alert [message]="saveSuccess()" kind="success" />
            }

            <div class="field">
              <label class="field__label" for="headline">Título profissional</label>
              <input
                id="headline"
                class="input"
                formControlName="headline"
                placeholder="Ex.: Desenvolvedora Back-end Node.js"
              />
              <span class="field__hint"
                >Aparece em destaque na triagem inicial do recrutador (até 160 caracteres).</span
              >
            </div>

            <div class="field">
              <label class="field__label" for="summary">Resumo</label>
              <textarea
                id="summary"
                class="textarea"
                formControlName="summary"
                placeholder="Experiência, formação e o que você busca (até 2000 caracteres)."
              ></textarea>
            </div>

            <div class="form-row">
              <div class="field">
                <label class="field__label" for="phone">Telefone</label>
                <input
                  id="phone"
                  class="input"
                  formControlName="phone"
                  placeholder="(11) 98765-4321"
                  (input)="onPhoneInput($event)"
                />
              </div>

              <app-cep-field
                formControlName="cep"
                (addressChange)="onCepState($event)"
                (blockedChange)="cepBlocked.set($event)"
                inputId="profileCep"
              />
            </div>

            @if (addressPreview(); as preview) {
              <div class="alert alert--info">
                <span class="alert__icon" aria-hidden="true">i</span>
                <div class="alert__body">
                  Endereço resolvido: {{ preview }}
                  <small>O backend confirma e grava o endereço ao salvar o perfil.</small>
                </div>
              </div>
            }

            <div class="field">
              <label class="field__label" for="skillInput">Habilidades</label>
              <div class="input-group">
                <input
                  id="skillInput"
                  class="input"
                  placeholder="Digite e pressione Enter (ex.: NestJS)"
                  (keydown.enter)="addSkill($event)"
                  #skillInput
                />
                <button type="button" class="btn" (click)="addSkillFromInput(skillInput)">Adicionar</button>
              </div>
              <span class="field__hint">Até 30 habilidades, 60 caracteres cada.</span>

              @if (skills().length > 0) {
                <div class="row mt-4" style="gap: 6px">
                  @for (skill of skills(); track skill) {
                    <span class="chip">
                      {{ skill }}
                      <button type="button" (click)="removeSkill(skill)" [attr.aria-label]="'Remover ' + skill">
                        ×
                      </button>
                    </span>
                  }
                </div>
              }
            </div>

            <div class="row row--end">
              <button type="button" class="btn" (click)="resetForm()" [disabled]="saving()">
                Descartar alterações
              </button>
              <button type="submit" class="btn btn--primary" [disabled]="saving() || cepBlocked()">
                @if (saving()) {
                  <span class="spinner" aria-hidden="true"></span>
                  Salvando…
                } @else {
                  Salvar perfil
                }
              </button>
            </div>
            @if (cepBlocked()) {
              <span class="field__error">Corrija o CEP antes de salvar (o backend rejeitaria o CEP inexistente).</span>
            }
          </form>

          <!-- ----------------------------------------------------------------
               Documentos
               ---------------------------------------------------------------- -->
          <section class="card">
            <div class="card__header">
              <div>
                <div class="card__title">Currículos e documentos</div>
                <div class="card__hint">
                  PDF, DOC ou DOCX até 5 MB. Só o documento anexado a uma candidatura fica visível ao recrutador dela.
                </div>
              </div>
            </div>

            <form class="upload" (ngSubmit)="upload($event)" novalidate>
              <div class="field">
                <label class="field__label" for="documentType">Tipo</label>
                <select
                  id="documentType"
                  class="select"
                  [value]="uploadType()"
                  (change)="uploadType.set($any($event.target).value)"
                >
                  @for (type of documentTypes; track type) {
                    <option [value]="type">{{ typeLabel(type) }}</option>
                  }
                </select>
              </div>

              <div class="field">
                <label class="field__label" for="documentFile">Arquivo</label>
                <input
                  id="documentFile"
                  class="input"
                  type="file"
                  [accept]="acceptAttribute"
                  (change)="onFileSelected($event)"
                />
                <span class="field__hint">
                  @if (selectedFile(); as file) {
                    Selecionado: {{ file.name }} · {{ size(file.size) }}
                  } @else {
                    Nenhum arquivo selecionado.
                  }
                </span>
              </div>

              @if (selectedFile(); as file) {
                <div class="doc-preview">
                  <div class="row row--between">
                    <div class="doc-preview__meta">
                      <span class="doc-preview__icon" aria-hidden="true">{{ file.type === 'application/pdf' ? '📄' : '📃' }}</span>
                      <div>
                        <div class="strong">{{ file.name }}</div>
                        <div class="cell-sub">{{ size(file.size) }} · {{ file.type || 'tipo não informado' }}</div>
                      </div>
                    </div>
                    <button type="button" class="btn btn--sm btn--ghost" (click)="clearSelectedFile()">Remover</button>
                  </div>
                  @if (previewUrl(); as preview) {
                    <iframe
                      class="doc-preview__frame"
                      [src]="preview.trusted"
                      title="Pré-visualização do arquivo selecionado"
                    ></iframe>
                    <span class="field__hint">Pré-visualização local (o arquivo ainda não foi enviado).</span>
                  } @else {
                    <span class="field__hint">
                      A pré-visualização no navegador existe para PDF; DOC/DOCX você confere após enviar, em "Baixar"/"Ver".
                    </span>
                  }
                </div>
              }

              <button type="submit" class="btn btn--primary" [disabled]="uploading() || !selectedFile()">
                @if (uploading()) {
                  <span class="spinner" aria-hidden="true"></span>
                  Enviando…
                } @else {
                  Enviar documento
                }
              </button>
            </form>

            @if (uploadError()) {
              <div class="mt-4"><app-alert [message]="uploadError()" kind="error" /></div>
            }

            <hr class="divider" />

            @if (documentsLoading()) {
              <app-loading label="Carregando documentos…" />
            } @else if (documents().length > 0) {
              <div class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Arquivo</th>
                      <th>Tipo</th>
                      <th>Tamanho</th>
                      <th>Enviado em</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (document of documents(); track document.id) {
                      <tr [class.row--flash]="document.id === lastUploadedId()">
                        <td class="cell-title truncate">{{ document.originalName }}</td>
                        <td>{{ typeLabel(document.type) }}</td>
                        <td class="nowrap">{{ size(document.sizeBytes) }}</td>
                        <td class="nowrap">{{ date(document.createdAt) }}</td>
                        <td class="actions">
                          <div class="btn-group" style="justify-content: flex-end">
                            @if (document.mimeType === 'application/pdf') {
                              <button type="button" class="btn btn--sm" (click)="view(document)">Ver</button>
                            }
                            <button type="button" class="btn btn--sm" (click)="download(document)">Baixar</button>
                          </div>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <app-empty-state
                icon="📎"
                title="Nenhum documento enviado"
                description="Anexe seu currículo para poder vinculá-lo às suas candidaturas."
              />
            }
          </section>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .upload {
        display: grid;
        grid-template-columns: 220px minmax(0, 1fr) auto;
        gap: var(--space-4);
        align-items: end;
      }

      .doc-preview {
        grid-column: 1 / -1;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        padding: var(--space-3) var(--space-4);
        background: var(--color-surface-alt);
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .doc-preview__meta {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        min-width: 0;
      }

      .doc-preview__icon {
        font-size: 1.4rem;
      }

      .doc-preview__frame {
        width: 100%;
        height: 260px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        background: #fff;
      }

      @media (max-width: 720px) {
        .upload {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    `,
  ],
})
export class ProfilePageComponent {
  private readonly profileService = inject(CandidateProfileService);
  private readonly documentsService = inject(DocumentsService);
  private readonly toasts = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  protected readonly auth = inject(AuthService);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly documentTypes = DOCUMENT_TYPE;
  protected readonly acceptAttribute = ACCEPT_ATTRIBUTE;

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly profile = signal<CandidateProfileFull | null>(null);
  protected readonly justRegistered = signal(false);

  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly saveErrorDetail = signal<string | null>(null);
  protected readonly saveWarning = signal<string | null>(null);
  protected readonly saveSuccess = signal<string | null>(null);

  protected readonly skills = signal<string[]>([]);
  protected readonly cepBlocked = signal(false);
  protected readonly addressPreview = signal<string | null>(null);

  protected readonly documents = signal<DocumentSummary[]>([]);
  protected readonly documentsLoading = signal(true);
  protected readonly selectedFile = signal<File | null>(null);
  protected readonly previewUrl = signal<PreviewState | null>(null);
  protected readonly lastUploadedId = signal<number | null>(null);
  protected readonly uploading = signal(false);
  protected readonly uploadError = signal<string | null>(null);
  protected readonly uploadType = signal<DocumentType>('RESUME');

  protected readonly form = inject(NonNullableFormBuilder).group({
    headline: ['', [Validators.maxLength(160)]],
    summary: ['', [Validators.maxLength(2000)]],
    phone: ['', [Validators.maxLength(30)]],
    cep: ['', [Validators.pattern(/^\d{5}-?\d{3}$/)]],
  });

  constructor() {
    this.route.queryParamMap.pipe(take(1)).subscribe((params) => {
      this.justRegistered.set(params.get('new') === '1');
    });

    this.loadProfile();
    this.loadDocuments();
  }

  // -------------------------------------------------------------------------
  // Perfil
  // -------------------------------------------------------------------------

  private loadProfile(): void {
    this.loading.set(true);
    this.profileService
      .getMine()
      .pipe(take(1), materialize())
      .subscribe((notification) => {
        // `materialize` também emite a notificação de COMPLETE ao final do
        // fluxo: sem ignorá-la, um carregamento BEM-SUCEDIDO terminaria no
        // ramo de erro e mostraria "não foi possível carregar" à toa.
        if (notification.kind === 'C') return;
        this.loading.set(false);

        if (notification.kind === 'N' && notification.value) {
          this.profile.set(notification.value);
          this.loadError.set(null);
          this.fillForm(notification.value);
          return;
        }

        const apiError = notification.error as ApiError | undefined;
        // 404 = perfil ainda não criado (o PATCH é upsert): formulário em branco.
        if (apiError?.status === 404) {
          this.profile.set(null);
          this.loadError.set(null);
          this.form.reset({ headline: '', summary: '', phone: '', cep: '' });
          this.skills.set([]);
          return;
        }
        this.loadError.set(apiError?.message ?? 'Não foi possível carregar o perfil.');
      });
  }

  private fillForm(profile: CandidateProfileFull): void {
    this.form.patchValue({
      headline: profile.headline ?? '',
      summary: profile.summary ?? '',
      phone: profile.phone ?? '',
      cep: profile.cep ?? '',
    });
    this.skills.set([...(profile.skills ?? [])]);
    this.addressPreview.set(
      profile.street || profile.city ? [profile.street, profile.city, profile.state].filter(Boolean).join(' — ') : null,
    );
  }

  protected resetForm(): void {
    const profile = this.profile();
    if (profile) {
      this.fillForm(profile);
    } else {
      this.form.reset({ headline: '', summary: '', phone: '', cep: '' });
      this.skills.set([]);
      this.addressPreview.set(null);
    }
    this.saveError.set(null);
    this.saveWarning.set(null);
    this.saveSuccess.set(null);
    this.cepBlocked.set(false);
  }

  protected onPhoneInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const masked = maskPhone(input.value);
    input.value = masked;
    this.form.controls.phone.setValue(masked);
  }

  protected onCepState(state: CepFieldState | null): void {
    if (!state) {
      this.addressPreview.set(null);
      return;
    }
    const preview = [state.street, state.city, state.state].filter(Boolean).join(' — ');
    this.addressPreview.set(preview || null);
  }

  protected addSkill(event: Event): void {
    event.preventDefault();
    const input = event.target as HTMLInputElement;
    this.pushSkill(input.value);
    input.value = '';
  }

  protected addSkillFromInput(input: HTMLInputElement): void {
    this.pushSkill(input.value);
    input.value = '';
    input.focus();
  }

  private pushSkill(raw: string): void {
    const skill = raw.trim().replace(/\s+/g, ' ');
    if (!skill) return;

    if (skill.length > 60) {
      this.toasts.error('Habilidade longa demais', 'O limite é de 60 caracteres por item.');
      return;
    }
    const current = this.skills();
    if (current.length >= 30) {
      this.toasts.error('Limite de habilidades atingido', 'O backend aceita no máximo 30 itens.');
      return;
    }
    if (current.some((item) => item.toLowerCase() === skill.toLowerCase())) {
      this.toasts.info('Esta habilidade já está na lista.');
      return;
    }
    this.skills.set([...current, skill]);
  }

  protected removeSkill(skill: string): void {
    this.skills.set(this.skills().filter((item) => item !== skill));
  }

  protected save(): void {
    if (this.saving()) return;

    if (this.cepBlocked()) {
      this.saveError.set('CEP não encontrado, verifique e tente novamente.');
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.saveError.set('Confira os campos destacados antes de salvar.');
      return;
    }

    const value = this.form.getRawValue();
    this.saving.set(true);
    this.saveError.set(null);
    this.saveErrorDetail.set(null);
    this.saveWarning.set(null);
    this.saveSuccess.set(null);

    this.profileService
      .updateMine({
        headline: value.headline?.trim() ?? '',
        summary: value.summary?.trim() ?? '',
        phone: value.phone?.trim() ?? '',
        cep: value.cep?.trim() || null,
        skills: this.skills(),
      })
      .pipe(take(1))
      .subscribe({
        next: (profile) => {
          this.saving.set(false);
          this.profile.set(profile);
          this.fillForm(profile);
          this.saveSuccess.set('Perfil salvo.');
          if (profile.addressWarning) {
            this.saveWarning.set(profile.addressWarning);
          }
          this.toasts.success('Perfil atualizado.');
        },
        error: (error: ApiError) => {
          this.saving.set(false);
          this.saveError.set(error.message);
          this.saveErrorDetail.set(error.fieldErrors?.join(' • ') ?? null);
        },
      });
  }

  // -------------------------------------------------------------------------
  // Documentos
  // -------------------------------------------------------------------------

  private loadDocuments(): void {
    this.documentsLoading.set(true);
    this.documentsService
      .listMine()
      .pipe(
        take(1),
        catchError(() => of<DocumentSummary[]>([])),
      )
      .subscribe((documents) => {
        this.documents.set(documents);
        this.documentsLoading.set(false);
      });
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.uploadError.set(null);
    if (!file) {
      this.releasePreview();
      this.selectedFile.set(null);
      return;
    }

    const validation = validateUpload(file);
    this.releasePreview();
    if (!validation.ok) {
      this.selectedFile.set(null);
      this.uploadError.set(validation.message ?? 'Arquivo inválido.');
      input.value = '';
      return;
    }
    this.selectedFile.set(file);
    // Preview 100% local (object URL): o candidato vê o que vai enviar antes
    // de gastar o upload — e o PDF abre embutido, como nas plataformas do mercado.
    if (file.type === 'application/pdf') {
      const raw = URL.createObjectURL(file);
      // iframe[src] é ResourceURL: o sanitizador do Angular não aceita blob:
      // por padrão, e aqui a origem é 100% local (arquivo que o usuário acabou
      // de escolher), então o bypass é seguro e documentado.
      this.previewUrl.set({ raw, trusted: this.sanitizer.bypassSecurityTrustResourceUrl(raw) });
    }
  }

  protected clearSelectedFile(): void {
    this.releasePreview();
    this.selectedFile.set(null);
    this.uploadError.set(null);
    const input = document.getElementById('documentFile') as HTMLInputElement | null;
    if (input) input.value = '';
  }

  private releasePreview(): void {
    const current = this.previewUrl();
    if (current) URL.revokeObjectURL(current.raw);
    this.previewUrl.set(null);
  }

  protected upload(event: Event): void {
    event.preventDefault();
    const file = this.selectedFile();
    if (!file || this.uploading()) return;

    const validation = validateUpload(file);
    if (!validation.ok) {
      this.uploadError.set(validation.message ?? 'Arquivo inválido.');
      return;
    }

    this.uploading.set(true);
    this.uploadError.set(null);

    this.documentsService
      .upload(file, this.uploadType())
      .pipe(take(1))
      .subscribe({
        next: (uploaded) => {
          this.uploading.set(false);
          this.lastUploadedId.set(uploaded.id);
          this.releasePreview();
          this.selectedFile.set(null);
          this.toasts.success('Documento enviado.', 'Ele já aparece na lista abaixo, pronto para ser anexado.');
          this.loadDocuments();
          const input = document.getElementById('documentFile') as HTMLInputElement | null;
          if (input) input.value = '';
        },
        error: (error: ApiError) => {
          // Em erro o arquivo CONTINUA selecionado: o candidato corrige e
          // tenta de novo sem precisar repescar o arquivo.
          this.uploading.set(false);
          this.uploadError.set(error.message);
        },
      });
  }

  /** Abre o PDF enviado no navegador (blob autenticado → nova aba). */
  protected view(document: DocumentSummary): void {
    this.documentsService
      .fetch(document.id, document.originalName)
      .pipe(take(1))
      .subscribe({
        next: (result) => {
          openBlobInNewTab(result.blob);
          this.toasts.info('Abrindo o documento em uma nova aba.');
        },
        error: (error: ApiError) => this.toasts.error(error.message),
      });
  }

  protected download(document: DocumentSummary): void {
    this.documentsService
      .download(document.id, document.originalName)
      .pipe(take(1))
      .subscribe({
        next: () => this.toasts.success('Download iniciado.'),
        error: (error: ApiError) => this.toasts.error(error.message),
      });
  }

  // -------------------------------------------------------------------------
  // Apresentação
  // -------------------------------------------------------------------------

  protected typeLabel(type: DocumentType): string {
    return DOCUMENT_TYPE_LABEL[type] ?? type;
  }

  protected size(bytes: number): string {
    return formatBytes(bytes);
  }

  protected date(iso: string): string {
    return formatDateTime(iso);
  }

  /** Exibido no hint do campo de arquivo. */
  protected readonly maxUploadMb = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
}
