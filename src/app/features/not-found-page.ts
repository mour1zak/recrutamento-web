import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyStateComponent } from '../shared/ui/empty-state';

/** 404 — rota inexistente (o wildcard do roteador cai aqui). */
@Component({
  selector: 'app-not-found-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, EmptyStateComponent],
  template: `
    <div class="container page">
      <app-empty-state
        icon="compass"
        title="Página não encontrada"
        description="O endereço que você tentou abrir não existe neste aplicativo."
      >
        <div class="btn-group">
          <a class="btn btn--primary" routerLink="/jobs">Ver vagas abertas</a>
          <a class="btn" routerLink="/">Voltar ao início</a>
        </div>
      </app-empty-state>
    </div>
  `,
})
export class NotFoundPageComponent {}
