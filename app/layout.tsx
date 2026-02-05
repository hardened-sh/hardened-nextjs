import './globals.css';
import { headers } from 'next/headers';
import { ReactNode } from 'react';
import { Shield, Lock } from 'lucide-react';

export const metadata = {
  title: 'Hardened Next.js - Security PoC',
  description: 'Prova de Conceito de segurança para Next.js 15 com App Router',
};

interface RootLayoutProps {
  children: ReactNode;
}

export default async function RootLayout({ children }: RootLayoutProps) {
  const headersList = await headers();
  const nonce = headersList.get('x-csp-nonce') ?? '';

  const securityCheckScript = `
    (function() {
      console.log('%c[CSP] Script autorizado executado com sucesso!', 'color: #10b981; font-weight: bold;');
      console.log('%c[CSP] Nonce validado pelo browser', 'color: #6b7280;');
      window.__CSP_ACTIVE__ = true;
      document.addEventListener('securitypolicyviolation', function(e) {
        console.error('%c[CSP] Violação de CSP detectada!', 'color: #ef4444; font-weight: bold;');
        console.error('Diretiva violada:', e.violatedDirective);
        console.error('URI bloqueada:', e.blockedURI);
      });
    })();
  `;

  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta httpEquiv="Cache-Control" content="no-store, no-cache, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <script 
          nonce={nonce} 
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: securityCheckScript }} 
        />
      </head>
      <body>
        <div className="csp-badge">
          <Lock size={14} />
          <span>CSP Ativo</span>
        </div>

        <header className="header">
          <div className="header-content">
            <div className="logo">
              <Shield size={28} strokeWidth={2} />
              <span>Hardened Next.js</span>
            </div>
            <nav className="nav">
              <a href="https://github.com/hardened-sh/hardened-nextjs" target="_blank" rel="noopener noreferrer">
                GitHub
              </a>
            </nav>
          </div>
        </header>

        <main className="main">
          {children}
        </main>

        <footer className="footer">
          <div className="footer-content">
            <p>Security PoC para Next.js 15 com App Router</p>
            <p className="footer-links">
              <a href="https://github.com/hardened-sh/hardened-nextjs" target="_blank" rel="noopener noreferrer">
                Repositório
              </a>
            </p>
          </div>
        </footer>

        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `window.__ANALYTICS_LOADED__ = true; console.log('%c[Analytics] Carregado com segurança via nonce', 'color: #3b82f6;');`,
          }}
        />
      </body>
    </html>
  );
}
