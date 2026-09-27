import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, homePathForRole } from '../auth/auth.service';
import { PermissionsService, PermissionKey } from '../auth/permissions.service';
import type { RoleName } from '../models';

/**
 * Guards funcionais (padrão Angular moderno — sem classe `AuthGuard`).
 *
 * `authGuard`            → exige sessão; sem ela, manda pro login guardando o returnUrl.
 * `roleGuard(...roles)`  → exige sessão E papel na lista; caso contrário, volta pra home do usuário.
 * `canActivatePermission(key)` → espelho client-side do RBAC: esconde/bloqueia
 *   a rota de uma ação que o backend responderia com `403` (o briefing pede
 *   exatamente isso: "idealmente o 403 nem deveria aparecer").
 * `guestGuard`           → rotas de login/cadastro: quem já está logado vai pra sua home.
 */

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) return true;

  const current = router.getCurrentNavigation()?.extractedUrl.toString() ?? router.url;
  return router.createUrlTree(['/auth/login'], {
    queryParams: { returnUrl: current === '/' ? undefined : current },
  });
};

export function roleGuard(...roles: RoleName[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.isAuthenticated()) {
      const current = router.getCurrentNavigation()?.extractedUrl.toString() ?? router.url;
      return router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: current } });
    }

    const role = auth.role();
    if (role && roles.includes(role)) return true;

    // Logado, mas em área que não é a dele: volta pra home do próprio papel
    // (mensagem explicativa fica por conta do layout/toast).
    return router.createUrlTree([auth.homePath()]);
  };
}

export function permissionGuard(permission: PermissionKey): CanActivateFn {
  return () => {
    const permissions = inject(PermissionsService);
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.isAuthenticated()) {
      return router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: router.url } });
    }
    if (permissions.can(permission)) return true;
    return router.createUrlTree([auth.homePath()]);
  };
}

/**
 * Porta de entrada: visitante vê a landing; quem já tem sessão vai direto
 * para a home do próprio papel (não faz sentido mostrar vitrine de marketing
 * para quem já está dentro do produto).
 */
export const homeIfAuthedGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) {
    return router.createUrlTree([homePathForRole(auth.role())]);
  }
  return true;
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) return true;
  return router.createUrlTree([auth.homePath()]);
};

/**
 * Guarda o `returnUrl` de forma padronizada (usado pelos componentes de auth
 * após o login, incluindo o redirecionamento por papel).
 */
export function readReturnUrl(query: Record<string, unknown>, fallback: string): string {
  const value = query['returnUrl'];
  if (typeof value !== 'string' || value === '') return fallback;
  // Só caminhos internos: evita open-redirect via `?returnUrl=https://evil.tld`.
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}
