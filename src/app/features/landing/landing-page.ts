import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

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
  imports: [RouterLink],
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
          </div>

          <p class="hero__note">
            Para explorar as vagas abertas, acompanhe suas candidaturas e veja os painéis da empresa, entre ou crie a
            sua conta — leva menos de um minuto.
          </p>
        </div>

        <div class="hero__panel" aria-hidden="true">
          <div class="mock">
            <div class="mock__bar">
              <span></span><span></span><span></span>
            </div>
            <div class="mock__row mock__row--title"></div>
            <div class="mock__row"></div>
            <div class="mock__row mock__row--short"></div>
            <div class="mock__chips">
              <span class="chip">Em análise</span>
              <span class="chip chip--ok">Entrevista</span>
              <span class="chip chip--ok">Contratado</span>
            </div>
            <div class="mock__row"></div>
            <div class="mock__row mock__row--short"></div>
          </div>
        </div>
      </div>
    </section>

    <section class="container section">
      <h2 class="section__title">Um produto, três jornadas</h2>
      <div class="grid grid--3">
        <article class="card journey">
          <span class="journey__icon" aria-hidden="true">🧑‍💻</span>
          <h3>Para candidatos</h3>
          <p>
            Vitrine de vagas com busca, candidatura com carta de apresentação e currículo anexado, status de cada
            processo em tempo real e entrevistas agendadas num só lugar.
          </p>
        </article>

        <article class="card journey">
          <span class="journey__icon" aria-hidden="true">🏢</span>
          <h3>Para empresas</h3>
          <p>
            Publique vagas, receba candidaturas, avalie perfis no ritmo do seu funil, agende entrevistas e acompanhe
            indicadores de conversão e tempo de contratação.
          </p>
        </article>

        <article class="card journey">
          <span class="journey__icon" aria-hidden="true">🛡️</span>
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

    <section class="container section section--cta">
      <div class="card cta">
        <div>
          <h2>Pronto para começar?</h2>
          <p class="muted mb-0">Crie a sua conta de candidato ou entre com a conta da sua empresa.</p>
        </div>
        <div class="btn-group">
          <a class="btn btn--primary" routerLink="/auth/register">Criar conta</a>
          <a class="btn" routerLink="/auth/login">Entrar</a>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      .hero {
        background:
          radial-gradient(900px 420px at 12% -10%, rgb(79 70 229 / 14%), transparent 60%),
          linear-gradient(180deg, #ffffff 0%, var(--color-bg) 100%);
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
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--color-primary-hover);
        background: var(--color-primary-soft);
        border-radius: var(--radius-pill);
        padding: 4px 12px;
        margin-bottom: var(--space-4);
      }

      .hero h1 {
        font-size: 2.4rem;
        line-height: 1.15;
        letter-spacing: -0.03em;
      }

      .hero__highlight {
        color: var(--color-primary);
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
      }

      .mock {
        width: 100%;
        max-width: 380px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-lg);
        padding: var(--space-4);
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      .mock__bar {
        display: flex;
        gap: 6px;
      }

      .mock__bar span {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--color-border-strong);
      }

      .mock__row {
        height: 12px;
        border-radius: var(--radius-pill);
        background: var(--color-surface-alt);
      }

      .mock__row--title {
        height: 18px;
        width: 70%;
        background: var(--color-primary-soft);
      }

      .mock__row--short {
        width: 45%;
      }

      .mock__chips {
        display: flex;
        gap: var(--space-2);
      }

      .chip--ok {
        background: var(--color-success-soft);
        color: var(--color-success);
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
        font-size: 1.6rem;
      }

      .journey p {
        color: var(--color-text-muted);
        margin: 0;
        font-size: 0.9rem;
      }

      .steps-band {
        background: var(--color-surface);
        border-block: 1px solid var(--color-border);
        padding-block: var(--space-7);
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
        background: var(--color-primary);
        color: #fff;
        font-weight: 700;
      }

      .steps p {
        margin: 4px 0 0;
        color: var(--color-text-muted);
        font-size: 0.875rem;
      }

      .section--cta {
        padding-block: var(--space-6) var(--space-7);
      }

      .cta {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-4);
        align-items: center;
        justify-content: space-between;
        background: linear-gradient(120deg, var(--color-primary-soft), #ffffff 65%);
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
