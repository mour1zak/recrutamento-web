import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Componente raiz: apenas o outlet. Todo o chrome (header/rodapé/toasts) vive
 * no `ShellComponent`, que é o pai de todas as rotas.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class App {}
