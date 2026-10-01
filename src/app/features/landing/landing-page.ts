import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/ui/icon';
import { Hero3dPanelComponent } from './hero-3d-panel';

/**
 * Porta de entrada do produto (equivalente ao `index.htm` do Glassdoor).
 *
 * Mostra a proposta de valor e os caminhos de entrada/registro; o conteúdo
 * real (vagas, candidaturas, painéis) só é liberado depois do login — decisão
 * de produto: quem explora vagas, empresas e salários precisa de conta.
 *
 * Sem dado inventado: nenhum número/statística fake, só a proposta do produto.
 */
@Component({
  selector: 'app-landing-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, Hero3dPanelComponent],
  template: `
    <section class="hero">
      <div class="container hero__inner">
        <div class="hero__copy">
          <span class="hero__eyebrow">Plataforma de recrutamento</span>
          <h1>
            O encontro certo entre
            <span class="hero__highlight">quem procura</span>
            e
            <span class="hero__highlight">quem contrata</span>
          </h1>
          <p class="hero__subtitle">
            Vagas reais, candidatura em poucos cliques e acompanhamento de cada etapa do processo — da triagem à
            entrevista. Do outro lado, um painel completo para as empresas gerenciarem suas contratações.
          </p>

          <div class="hero__actions">
            <a class="btn btn--primary btn--lg" routerLink="/auth/register">Criar conta gratuita</a>
            <a class="btn btn--lg" routerLink="/auth/login">Já tenho conta</a>
            <a class="btn btn--ghost btn--lg" routerLink="/jobs">Ver vagas abertas</a>
          </div>

          <p class="hero__note">
            As vagas abertas são públicas. Para se candidatar, acompanhar processos e ver os painéis da empresa, entre
            ou crie a sua conta — leva menos de um minuto.
          </p>
        </div>

        <div class="hero__panel">
          <app-hero-3d-panel />
        </div>
      </div>
    </section>

    <section class="container section">
      <h2 class="section__title">Um produto, três jornadas</h2>
      <div class="grid grid--3">
        <article class="card journey">
          <span class="journey__icon" aria-hidden="true"><app-icon name="user" [size]="24" /></span>
          <h3>Para candidatos</h3>
          <p>
            Vitrine de vagas com busca, candidatura com carta de apresentação e currículo anexado, status de cada
            processo em tempo real e entrevistas agendadas num só lugar.
          </p>
        </article>

        <article class="card journey">
          <span class="journey__icon" aria-hidden="true"><app-icon name="building" [size]="24" /></span>
          <h3>Para empresas</h3>
          <p>
            Publique vagas, receba candidaturas, avalie perfis no ritmo do seu funil, agende entrevistas e acompanhe
            indicadores de conversão e tempo de contratação.
          </p>
        </article>

        <article class="card journey">
          <span class="journey__icon" aria-hidden="true"><app-icon name="shield" [size]="24" /></span>
          <h3>Com governança</h3>
          <p>
            Papéis e permissões configuráveis, gestão de usuários e empresas com endereço validado por CEP — cada
            pessoa vê exatamente o que o seu papel permite.
          </p>
        </article>
      </div>
    </section>

    <section class="steps-band">
      <div class="container">
        <h2 class="section__title">Como funciona</h2>
        <ol class="steps">
          <li>
            <span class="steps__num">1</span>
            <div>
              <strong>Crie a sua conta</strong>
              <p>Candidatos se registram em segundos; empresas são administradas pela equipe da plataforma.</p>
            </div>
          </li>
          <li>
            <span class="steps__num">2</span>
            <div>
              <strong>Explore ou publique</strong>
              <p>Candidatos navegam pela vitrine e se candidatam; recrutadores publicam vagas e avaliam pessoas.</p>
            </div>
          </li>
          <li>
            <span class="steps__num">3</span>
            <div>
              <strong>Acompanhe até o fim</strong>
              <p>Status, entrevistas e feedback fluem pelas etapas do processo, com histórico completo.</p>
            </div>
          </li>
        </ol>
      </div>
    </section>

  `,
  styles: [
    `
      .hero {
        background:
          radial-gradient(900px 420px at 12% -10%, rgb(47 85 72 / 12%), transparent 60%),
          var(--color-bg);
        border-bottom: 1px solid var(--color-border);
        padding-block: var(--space-7);
      }

      .hero__inner {
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
        gap: var(--space-6);
        align-items: center;
      }

      .hero__eyebrow {
        display: inline-block;
        font-size: 0.6875rem;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--color-primary);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-pill);
        padding: 6px 14px;
        margin-bottom: var(--space-4);
      }

      .hero h1 {
        font-size: 2.6rem;
        line-height: 1.12;
        letter-spacing: -0.03em;
        font-weight: 800;
      }

      .hero__highlight {
        color: var(--color-accent);
      }

      .hero__subtitle {
        color: var(--color-text-muted);
        font-size: 1.05rem;
        max-width: 56ch;
        margin-block: var(--space-4);
      }

      .hero__actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-3);
      }

      .btn--lg {
        padding: 12px 22px;
        min-height: 46px;
        font-size: 0.95rem;
      }

      .hero__note {
        margin-top: var(--space-4);
        font-size: 0.8125rem;
        color: var(--color-text-subtle);
        max-width: 52ch;
      }

      .hero__panel {
        display: grid;
        place-items: center;
        min-height: 520px;
      }

      .section {
        padding-block: var(--space-7);
      }

      .section__title {
        font-size: 1.5rem;
        margin-bottom: var(--space-5);
        letter-spacing: -0.02em;
      }

      .journey {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .journey__icon {
        color: var(--color-accent);
      }

      .journey p {
        color: var(--color-text-muted);
        margin: 0;
        font-size: 0.9rem;
      }

      .steps-band {
        background: var(--color-primary);
        padding-block: var(--space-7);
      }

      .steps-band .section__title {
        color: #fff;
      }

      .steps {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--space-5);
      }

      .steps li {
        display: flex;
        gap: var(--space-3);
        align-items: flex-start;
      }

      .steps__num {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        flex: none;
        border-radius: 50%;
        background: var(--color-highlight);
        color: #182420;
        font-family: var(--font-display);
        font-weight: 700;
      }

      .steps strong {
        color: #fff;
      }

      .steps p {
        margin: 4px 0 0;
        color: rgb(255 255 255 / 75%);
        font-size: 0.875rem;
      }

      @media (max-width: 900px) {
        .hero__inner {
          grid-template-columns: minmax(0, 1fr);
        }

        .hero__panel {
          display: none;
        }

        .steps {
          grid-template-columns: minmax(0, 1fr);
        }

        .hero h1 {
          font-size: 1.9rem;
        }
      }
    `,
  ],
})
export class LandingPageComponent {}
