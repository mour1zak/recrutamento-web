import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { apiKeyInterceptor } from '../../../core/http/api-key.interceptor';
import { authInterceptor } from '../../../core/http/auth.interceptor';
import { ProfilePageComponent } from './profile-page';

@Component({ selector: 'app-stub', template: 'stub' })
class StubComponent {}

@Component({
  selector: 'app-outlet-host',
  imports: [RouterOutlet],
  template: `<div id="root-host"><router-outlet /></div>`,
})
class OutletHostComponent {}

const url = (path: string) => `${environment.apiUrl}/${path}`;

function candidateSession(): void {
  localStorage.setItem(
    'recrutamento.session',
    JSON.stringify({
      user: { id: 3, name: 'Candidato Um', email: 'candidato@recrutamento.test', role: 'CANDIDATE' },
      accessToken: 'token-candidato',
      refreshToken: 'refresh-candidato',
    }),
  );
}

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    TestBed.flushEffects();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  TestBed.flushEffects();
}

function textOf(fixture: { nativeElement: HTMLElement }): string {
  return fixture.nativeElement.textContent as string;
}

/**
 * Regressão do bug real: o form de upload usava (ngSubmit) sem diretiva de
 * form, então o clique em "Enviar documento" fazia o submit DEFAULT do browser
 * (reload + scroll pro topo) e o POST /documents nunca saía — nada na tela,
 * nada no banco.
 */
describe('Upload de currículo (profile-page)', () => {
  let controller: HttpTestingController;
  let router: Router;
  let host: { nativeElement: HTMLElement };

  beforeEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    candidateSession();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiKeyInterceptor, authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'candidate/profile', component: ProfilePageComponent },
          { path: 'jobs', component: StubComponent },
        ]),
      ],
    });
    controller = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  async function render() {
    const fixture = TestBed.createComponent(OutletHostComponent);
    fixture.autoDetectChanges();
    host = fixture as unknown as typeof host;
    await router.navigateByUrl('/candidate/profile');
    await settle();
    // perfil inexistente (404) + lista de documentos vazia
    controller
      .expectOne(url('candidates/me'))
      .flush({ statusCode: 404, reason: 'candidate_profile_not_found', message: 'x' }, { status: 404, statusText: 'Not Found' });
    controller.expectOne(url('documents/me')).flush([]);
    await settle();
    return fixture;
  }

  function chooseFile(input: HTMLInputElement, file: File): void {
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
  }

  it('enviar documento faz POST /documents (sem reload da página) e lista na hora', async () => {
    await render();

    const file = new File(['pdf-bytes'], 'curriculo.pdf', { type: 'application/pdf' });
    chooseFile(host.nativeElement.querySelector('#documentFile') as HTMLInputElement, file);
    await settle();

    // preview local aparece antes do envio
    expect(textOf(host)).toContain('curriculo.pdf');
    expect(textOf(host)).toContain('Pré-visualização local');

    const form = host.nativeElement.querySelector('form.upload') as HTMLFormElement;
    const submitEvent = new Event('submit', { cancelable: true, bubbles: true });
    let defaultPrevented = false;
    form.addEventListener('submit', (event) => {
      defaultPrevented = event.defaultPrevented;
    });

    const buttons = [...host.nativeElement.querySelectorAll('form.upload button')] as HTMLButtonElement[];
    const button = buttons.find((element) => element.textContent?.includes('Enviar documento')) as HTMLButtonElement;
    button.click();
    await settle();

    // O submit default PRECISA estar prevenido (senão reload + scroll pro topo).
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    expect(defaultPrevented).toBe(true);

    const upload = controller.expectOne(url('documents'));
    expect(upload.request.method).toBe('POST');
    const body = upload.request.body as FormData;
    expect(body.get('type')).toBe('RESUME');
    expect((body.get('file') as File).name).toBe('curriculo.pdf');
    upload.flush(
      { id: 21, filename: 'stored.pdf', mimeType: 'application/pdf', sizeBytes: 8 },
      { status: 201, statusText: 'Created' },
    );
    await settle();

    controller.expectOne(url('documents/me')).flush([
      {
        id: 21,
        type: 'RESUME',
        filename: 'stored.pdf',
        originalName: 'curriculo.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 8,
        createdAt: '2026-09-28T12:00:00.000Z',
      },
    ]);
    await settle();

    expect(textOf(host)).toContain('enviado — já está na lista');
    expect(textOf(host)).toContain('curriculo.pdf');
    expect(textOf(host)).toContain('Currículo');
  });

  it('erro de upload mantém o arquivo selecionado para retry', async () => {
    await render();

    const file = new File(['x'], 'curriculo.pdf', { type: 'application/pdf' });
    chooseFile(host.nativeElement.querySelector('#documentFile') as HTMLInputElement, file);
    await settle();

    const buttons = [...host.nativeElement.querySelectorAll('form.upload button')] as HTMLButtonElement[];
    const button = buttons.find((element) => element.textContent?.includes('Enviar documento')) as HTMLButtonElement;
    button.click();

    controller
      .expectOne(url('documents'))
      .flush({ statusCode: 500, error: 'Internal Server Error' }, { status: 500, statusText: 'Internal Server Error' });
    await settle();

    expect(textOf(host)).toContain('O servidor falhou ao processar a requisição');
    // arquivo continua selecionado (retry sem repescar)
    expect(textOf(host)).toContain('Selecionado: curriculo.pdf');
  });
});
