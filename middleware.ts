/**
 * ============================================================
 * Middleware de Segurança - CSP & Nonce
 * ============================================================
 * 
 * Este middleware implementa:
 * 1. Geração de nonce criptográfico único por requisição
 * 2. Content-Security-Policy estrita com nonce
 * 3. Propagação do nonce via header customizado para o Layout
 * 
 * POR QUE O LAYOUT NÃO TEM ACESSO AO REQUEST?
 * No App Router o HTML é streamed. O componente layout.tsx é renderizado
 * antes que o objeto Request esteja disponível. O padrão antigo de ler
 * req.headers em _document.js não funciona mais, o que impede a geração
 * de um nonce por request.
 * 
 * SOLUÇÃO: Middleware → Header → Layout
 * 1. Middleware gera o nonce (usa randomUUID para compatibilidade Edge)
 * 2. Define o CSP header na response
 * 3. Injeta o nonce em um request header customizado (x-csp-nonce)
 * 4. Layout lê o header via next/headers
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Constrói a Content-Security-Policy completa
 * 
 * @param nonce - Nonce gerado para esta requisição
 * @returns CSP string formatada
 * 
 * DIRETIVAS EXPLICADAS:
 * - default-src 'self': Fallback para todas as diretivas não especificadas
 * - script-src: Scripts só com nonce ou do mesmo origin
 * - style-src: Estilos só com nonce ou do mesmo origin
 * - img-src: Imagens do mesmo origin + data URIs (para inline images)
 * - font-src: Fontes apenas do mesmo origin
 * - connect-src: Fetch/XHR apenas para origins autorizados
 * - object-src 'none': Bloqueia plugins (Flash, Java, etc.)
 * - base-uri 'none': Previne ataques de base tag injection
 * - frame-ancestors 'none': Equivalente a X-Frame-Options: DENY
 * - form-action 'self': Forms só podem submeter para mesmo origin
 * - upgrade-insecure-requests: Força HTTPS para recursos mistos
 */
function buildCSP(nonce: string, isDev: boolean): string {
  const directives = [
    // Fallback restritivo
    "default-src 'self'",
    
    // Scripts: apenas com nonce válido
    // 'strict-dynamic' permite scripts carregados por scripts confiáveis
    // 'unsafe-eval' necessário em dev para hot reload (remover em produção)
    isDev 
      ? `script-src 'self' 'unsafe-inline' 'unsafe-eval'`
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    
    // Estilos: Em dev, permitir unsafe-inline para HMR do Next.js
    // Em produção: usar nonce para maior segurança
    isDev
      ? `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`
      : `style-src 'self' 'nonce-${nonce}' 'unsafe-inline' https://fonts.googleapis.com`,
    
    // Style attributes (style="") - necessário para React inline styles
    `style-src-attr 'unsafe-inline'`,
    
    // Imagens: mesmo origin + data URIs + blob (para previews)
    "img-src 'self' data: blob:",
    
    // Fontes: mesmo origin + Google Fonts
    "font-src 'self' https://fonts.gstatic.com",
    
    // Conexões: mesmo origin + APIs autorizadas
    // Adicione seus endpoints de API aqui
    "connect-src 'self' https://api.hardened.com.br",
    
    // Workers: mesmo origin
    "worker-src 'self' blob:",
    
    // Bloqueia plugins legados
    "object-src 'none'",
    
    // Previne base tag hijacking
    "base-uri 'none'",
    
    // Previne clickjacking
    "frame-ancestors 'none'",
    
    // Restringe destino de forms
    "form-action 'self'",
    
    // Força upgrade de HTTP para HTTPS
    "upgrade-insecure-requests",
  ];

  return directives.join('; ');
}

/**
 * Middleware principal
 * 
 * Executado em TODAS as requisições que correspondem ao matcher
 */
export function middleware(request: NextRequest) {
  // ============================================================
  // ETAPA 1: Detectar ambiente de desenvolvimento
  // ============================================================
  const isDev = process.env.NODE_ENV === 'development';

  // ============================================================
  // ETAPA 2: Gerar nonce único para esta requisição
  // Usa crypto.randomUUID() da Web Crypto API (disponível no Edge Runtime)
  // ============================================================
  const nonce = crypto.randomUUID();

  // ============================================================
  // ETAPA 3: Criar response com headers modificados
  // ============================================================
  
  // Clona os headers da requisição e adiciona o nonce
  // Isso permite que o Layout leia via headers()
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-csp-nonce', nonce);

  // Cria response que passa para o próximo handler
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // ============================================================
  // ETAPA 4: Configurar CSP na response
  // ============================================================
  const csp = buildCSP(nonce, isDev);
  
  // Header principal do CSP
  response.headers.set('Content-Security-Policy', csp);
  
  // Também define no request header para acesso no Layout
  // Este é o "pulo do gato" que permite o Layout ler o nonce
  response.headers.set('x-csp-nonce', nonce);

  // ============================================================
  // ETAPA 4: Headers de segurança adicionais
  // (Complementam os definidos no next.config.js)
  // ============================================================
  
  // Previne MIME sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');
  
  // Previne clickjacking (redundante com frame-ancestors, mas para browsers antigos)
  response.headers.set('X-Frame-Options', 'DENY');
  
  // Política de referrer
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Remove header que identifica o servidor
  response.headers.delete('X-Powered-By');

  return response;
}

/**
 * Configuração do Matcher
 * 
 * Define em quais rotas o middleware executa
 * 
 * IMPORTANTE:
 * - Não executa em arquivos estáticos (_next/static)
 * - Não executa em imagens otimizadas (_next/image)
 * - Não executa em favicon
 * - Executa em todas as outras rotas
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    {
      source: '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
