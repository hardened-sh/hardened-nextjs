/**
 * ============================================================
 * Mock de Autenticação
 * ============================================================
 * 
 * Este módulo simula funções de autenticação para a PoC.
 * Em produção, substituir por:
 * - next-auth (Auth.js)
 * - lucia
 * - clerk
 * - Implementação própria com JWT/Sessions
 */

export interface Session {
  user: {
    id: string;
    email: string;
    name: string;
    roles: string[];
  };
  csrfToken: string;
  expiresAt: Date;
}

/**
 * Obtém a sessão do usuário atual
 * 
 * MOCK: Sempre retorna um usuário autenticado
 * Em produção: verificar cookie/token, validar expiração, etc.
 */
export async function getSession(): Promise<Session | null> {
  // Simula delay de verificação
  await new Promise(resolve => setTimeout(resolve, 10));

  // MOCK: Retorna sessão simulada
  return {
    user: {
      id: 'user-123',
      email: 'demo@hardened.com.br',
      name: 'Demo User',
      roles: ['user', 'finance'],
    },
    csrfToken: `csrf-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
  };
}

/**
 * Verifica se o usuário tem uma role específica
 */
export async function hasRole(role: string): Promise<boolean> {
  const session = await getSession();
  return session?.user.roles.includes(role) ?? false;
}

/**
 * Verifica se o usuário está autenticado
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return session !== null && new Date() < session.expiresAt;
}
