import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type IconName =
  | 'globe'
  | 'pin'
  | 'money'
  | 'users'
  | 'clock'
  | 'search'
  | 'file'
  | 'inbox'
  | 'paperclip'
  | 'building'
  | 'user'
  | 'compass'
  | 'shield'
  | 'calendar'
  | 'check';

/**
 * Ícones em SVG inline (traço, `currentColor`) — sem emoji e sem dependência
 * externa de fonte/CDN. Mesma linguagem visual do logo no header/rodapé.
 */
const PATHS: Record<IconName, string> = {
  globe:
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 0c2.5 2.6 4 6.1 4 10s-1.5 7.4-4 10m0-20c-2.5 2.6-4 6.1-4 10s1.5 7.4 4 10M2 12h20',
  pin: 'M12 21s-7-5.1-7-11a7 7 0 0 1 14 0c0 5.9-7 11-7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  money: 'M3 7h18v10H3V7Zm4 5h.01m4 0h6',
  users:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-14v6l4 2',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M9 13h6M9 17h6',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2m3.45-6h13.1L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6l3.45-6Z',
  paperclip:
    'm21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48',
  building: 'M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m12-12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  compass: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm4-14-2.5 6.5L7 17l2.5-6.5L16 8Z',
  shield: 'M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z',
  calendar: 'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  check: 'M20 6 9 17l-5-5',
};

@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.9"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path [attr.d]="path()" />
    </svg>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        vertical-align: -0.15em;
      }
    `,
  ],
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly size = input<number>(15);

  protected readonly path = (): string => PATHS[this.name()];
}
