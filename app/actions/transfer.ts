'use server';

/**
 * ============================================================
 * Server Action Hardened - Transferência de Fundos
 * ============================================================
 * 
 * REGRAS DE SEGURANÇA IMPLEMENTADAS:
 * 
 * 1. Validação de Input com Zod (schema rigoroso)
 * 2. Verificação de Sessão/Autorização
 * 3. NUNCA usar throw - retornar objeto previsível
 * 4. Erros genéricos para cliente, detalhados no log
 * 5. Rate limiting (mock - implementar com Redis em produção)
 * 
 * POR QUE NÃO USAR THROW:
 * - throw em Server Actions resulta em erro genérico no cliente
 * - Perde-se o contexto para debugging
 * - Pode vazar stack traces em dev mode
 * - Dificulta tratamento consistente no frontend
 */

import { z } from 'zod';

// ============================================================
// Schema de Validação Zod - Rigoroso e Tipado
// ============================================================

/**
 * Schema para validação de transferência
 * 
 * Regras:
 * - amount: número inteiro positivo, máximo 1 milhão
 * - toAccount: formato ACC-XXXXXX (6 dígitos)
 * - description: opcional, máximo 200 caracteres, sanitizado
 */
const TransferSchema = z.object({
  amount: z
    .number({
      required_error: 'Valor é obrigatório',
      invalid_type_error: 'Valor deve ser um número',
    })
    .int('Valor deve ser inteiro')
    .positive('Valor deve ser positivo')
    .max(1_000_000, 'Valor máximo: R$ 1.000.000'),
  
  toAccount: z
    .string({
      required_error: 'Conta destino é obrigatória',
    })
    .regex(
      /^ACC-\d{6}$/,
      'Formato de conta inválido. Use: ACC-XXXXXX'
    ),
  
  description: z
    .string()
    .max(200, 'Descrição muito longa')
    .optional()
    .transform(val => val?.trim()),
});

// Tipo inferido do schema para type-safety
type TransferInput = z.infer<typeof TransferSchema>;

// ============================================================
// Tipos de Retorno - Padrão Previsível
// ============================================================

interface TransferSuccessResult {
  success: true;
  data: {
    transactionId: string;
    amount: number;
    toAccount: string;
    timestamp: string;
  };
}

interface TransferErrorResult {
  success: false;
  error: 'unauthorized' | 'bad_input' | 'insufficient_funds' | 'backend' | 'rate_limited';
  id: string; // UUID para auditoria
}

type TransferResult = TransferSuccessResult | TransferErrorResult;

// ============================================================
// Mock de Sessão (substituir por implementação real)
// ============================================================

interface UserSession {
  userId: string;
  email: string;
  roles: string[];
  csrfToken: string;
}

/**
 * Mock de getSession - Em produção usar next-auth, lucia, etc.
 * 
 * IMPORTANTE: Sempre verificar sessão em TODA Server Action
 * Nunca confiar apenas em middleware
 */
async function getSession(): Promise<UserSession | null> {
  // MOCK: Em produção, verificar cookie/token real
  // Exemplo com next-auth: return await getServerSession(authOptions);
  
  // Simula usuário autenticado com role 'finance'
  return {
    userId: 'user-123',
    email: 'user@hardened.com',
    roles: ['user', 'finance'],
    csrfToken: 'mock-csrf-token',
  };
}

// ============================================================
// Mock de Rate Limiting
// ============================================================

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10; // máximo de requests
const RATE_LIMIT_WINDOW = 60000; // 1 minuto

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);

  if (!userLimit || now > userLimit.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (userLimit.count >= RATE_LIMIT_MAX) {
    return false;
  }

  userLimit.count++;
  return true;
}

// ============================================================
// Server Action Principal
// ============================================================

/**
 * transferFunds - Server Action para transferência de fundos
 * 
 * @param payload - Dados não validados do cliente
 * @returns TransferResult - Objeto previsível com success/error
 * 
 * @example
 * // No cliente:
 * const result = await transferFunds({ amount: 1000, toAccount: 'ACC-123456' });
 * if (!result.success) {
 *   toast.error('Falha na transferência');
 * } else {
 *   toast.success(`Transferência ${result.data.transactionId} realizada!`);
 * }
 */
export async function transferFunds(payload: unknown): Promise<TransferResult> {
  // ============================================================
  // ETAPA 1: Verificação de Sessão
  // SEMPRE verificar antes de qualquer operação
  // ============================================================
  const session = await getSession();

  if (!session) {
    // Log detalhado no servidor
    console.error('[transferFunds] Tentativa sem sessão válida', {
      timestamp: new Date().toISOString(),
      payload: JSON.stringify(payload).slice(0, 100), // trunca para log
    });
    
    // Erro genérico para o cliente com UUID para auditoria
    return { success: false, error: 'unauthorized', id: crypto.randomUUID() };
  }

  // ============================================================
  // ETAPA 2: Verificação de Autorização (RBAC)
  // Usuário precisa ter role específica
  // ============================================================
  if (!session.roles.includes('finance')) {
    console.error('[transferFunds] Usuário sem permissão', {
      userId: session.userId,
      roles: session.roles,
      requiredRole: 'finance',
    });
    
    return { success: false, error: 'unauthorized', id: crypto.randomUUID() };
  }

  // ============================================================
  // ETAPA 3: Rate Limiting
  // Previne abuso e força bruta
  // ============================================================
  if (!checkRateLimit(session.userId)) {
    console.warn('[transferFunds] Rate limit excedido', {
      userId: session.userId,
    });
    
    return { success: false, error: 'rate_limited', id: crypto.randomUUID() };
  }

  // ============================================================
  // ETAPA 4: Validação de Input com Zod
  // ============================================================
  let validatedData: TransferInput;
  
  try {
    validatedData = TransferSchema.parse(payload);
  } catch (zodError) {
    // Log detalhado do erro de validação
    if (zodError instanceof z.ZodError) {
      console.error('[transferFunds] Validação falhou', {
        userId: session.userId,
        errors: zodError.errors.map(e => ({
          path: e.path.join('.'),
          message: e.message,
        })),
        receivedPayload: JSON.stringify(payload).slice(0, 200),
      });
    }
    
    // Erro genérico para o cliente (não vaza detalhes)
    return { success: false, error: 'bad_input', id: crypto.randomUUID() };
  }

  // ============================================================
  // ETAPA 5: Lógica de Negócio
  // Em produção: chamar API de backend, banco de dados, etc.
  // ============================================================
  try {
    // MOCK: Simula chamada ao backend de transferências
    // Em produção, usar safeFetch para APIs externas
    
    // Simula verificação de saldo
    const mockBalance = 50000; // R$ 50.000
    if (validatedData.amount > mockBalance) {
      console.warn('[transferFunds] Saldo insuficiente', {
        userId: session.userId,
        requested: validatedData.amount,
        available: mockBalance,
      });
      
      return { success: false, error: 'insufficient_funds', id: crypto.randomUUID() };
    }

    // Simula processamento da transferência
    const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    // Log de auditoria completo
    console.log('[transferFunds] Transferência realizada', {
      transactionId,
      userId: session.userId,
      amount: validatedData.amount,
      toAccount: validatedData.toAccount,
      description: validatedData.description || '(sem descrição)',
      timestamp: new Date().toISOString(),
    });

    // Retorno de sucesso com dados relevantes
    return {
      success: true,
      data: {
        transactionId,
        amount: validatedData.amount,
        toAccount: validatedData.toAccount,
        timestamp: new Date().toISOString(),
      },
    };

  } catch (unexpectedError) {
    // ============================================================
    // Tratamento de Erro Inesperado
    // Log completo no servidor, erro genérico para cliente
    // ============================================================
    console.error('[transferFunds] Erro inesperado', {
      userId: session.userId,
      error: unexpectedError instanceof Error 
        ? { message: unexpectedError.message, stack: unexpectedError.stack }
        : unexpectedError,
    });

    return { success: false, error: 'backend', id: crypto.randomUUID() };
  }
}

// ============================================================
// Server Action Adicional: Consulta de Saldo (exemplo)
// ============================================================

const BalanceQuerySchema = z.object({
  accountId: z.string().regex(/^ACC-\d{6}$/),
});

interface BalanceResult {
  success: boolean;
  data?: { balance: number; currency: string };
  error?: 'unauthorized' | 'invalid_input' | 'not_found';
}

export async function getAccountBalance(payload: unknown): Promise<BalanceResult> {
  const session = await getSession();
  
  if (!session) {
    return { success: false, error: 'unauthorized' };
  }

  try {
    const { accountId } = BalanceQuerySchema.parse(payload);
    
    // Log de auditoria (em produção: buscar saldo real no banco)
    console.log('[getAccountBalance] Consulta de saldo', {
      userId: session.userId,
      accountId,
      timestamp: new Date().toISOString(),
    });
    
    // MOCK: Retorna saldo fictício
    return {
      success: true,
      data: {
        balance: 50000,
        currency: 'BRL',
      },
    };
  } catch {
    return { success: false, error: 'invalid_input' };
  }
}
