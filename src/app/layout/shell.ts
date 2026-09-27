import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './header';
import { FooterComponent } from './footer';
import { ToastContainerComponent } from './toast-container';

/** Casca do site: cabeçalho fixo, conteúdo roteado, rodapé e toasts globais. */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HeaderComponent, FooterComponent, ToastContainerComponent, RouterOutlet],
  template: `
    <app-header />
    <main class="shell-main" id="conteudo">
      <router-outlet />
    </main>
    <app-footer />
    <app-toast-container />
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
      }

      .shell-main {
        flex: 1;
      }
    `,
  ],
})
export class ShellComponent {}
