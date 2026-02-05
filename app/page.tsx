import { 
  Shield, 
  Globe, 
  Zap, 
  Lock, 
  CheckCircle, 
  FolderTree,
  Terminal,
  FlaskConical,
  BookOpen,
  ExternalLink,
  LayoutDashboard
} from 'lucide-react';
import Link from 'next/link';
import { getAccountBalance } from './actions/transfer';
import { TransferTester } from './components/TransferTester';

export default async function HomePage() {
  const balanceResult = await getAccountBalance({ accountId: 'ACC-123456' });

  return (
    <div>
      <section className="hero">
        <h1 className="hero-title">Security PoC</h1>
        <p className="hero-subtitle">
          Prova de Conceito demonstrando padrões de segurança para Next.js 15 
          com App Router: SSRF Guard, Server Actions Hardened e CSP com Nonce.
        </p>
        <div className="hero-cta">
          <Link href="/dashboard" className="btn-primary">
            <LayoutDashboard size={18} />
            Ver Demo do safeFetch
          </Link>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <CheckCircle size={24} />
          <h2 className="section-title">Proteções Ativas</h2>
        </div>
        
        <div className="feature-grid">
          <article className="feature-card">
            <div className="feature-icon">
              <Shield size={20} />
            </div>
            <h3 className="feature-title">CSP com Nonce</h3>
            <p className="feature-description">
              Content-Security-Policy estrita com nonce criptográfico único por requisição.
              Scripts inline só executam com nonce válido.
            </p>
          </article>
          
          <article className="feature-card">
            <div className="feature-icon">
              <Globe size={20} />
            </div>
            <h3 className="feature-title">SSRF Guard</h3>
            <p className="feature-description">
              Proteção contra Server-Side Request Forgery com validação de DNS e
              detecção de DNS Rebinding via socket handshake.
            </p>
          </article>
          
          <article className="feature-card">
            <div className="feature-icon">
              <Zap size={20} />
            </div>
            <h3 className="feature-title">Server Actions Hardened</h3>
            <p className="feature-description">
              Validação com Zod, tratamento de erros sem throw, logs detalhados
              no servidor e mensagens genéricas para o cliente.
            </p>
          </article>
          
          <article className="feature-card">
            <div className="feature-icon">
              <Lock size={20} />
            </div>
            <h3 className="feature-title">Security Headers</h3>
            <p className="feature-description">
              HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
              Permissions-Policy configurados no middleware e next.config.js.
            </p>
          </article>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <Terminal size={24} />
          <h2 className="section-title">Demo: Server Action</h2>
        </div>
        
        <div className="result-box">
          <div className="result-header">
            <CheckCircle size={16} />
            <span>Resultado da Server Action (Consulta de Saldo)</span>
          </div>
          <div className="result-content">
            <pre>{JSON.stringify(balanceResult, null, 2)}</pre>
          </div>
        </div>

        <TransferTester />
      </section>

      <section className="section">
        <div className="section-header">
          <FolderTree size={24} />
          <h2 className="section-title">Arquitetura de Segurança</h2>
        </div>
        
        <div className="code-block">
          <div className="code-header">
            <FolderTree size={16} />
            <span>hardened-nextjs/</span>
          </div>
          <div className="code-content">
            <pre>{`├── middleware.ts              # CSP + Nonce generation
├── next.config.js             # Security headers + Image whitelist
├── lib/
│   ├── auth.ts                # Mock de autenticação
│   └── security/
│       └── safe-fetch.ts      # SSRF + DNS Rebinding protection
├── app/
│   ├── globals.css            # Estilos globais
│   ├── layout.tsx             # CSP nonce consumption
│   ├── page.tsx               # Demo page
│   └── actions/
│       └── secure-transfer.ts # Hardened Server Actions`}</pre>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <FlaskConical size={24} />
          <h2 className="section-title">Como Testar</h2>
        </div>
        
        <ul className="test-list">
          <li className="test-item">
            <span className="test-number">1</span>
            <div className="test-content">
              <h4 className="test-title">Verificar CSP</h4>
              <p className="test-description">
                Abra o DevTools → Console. Você deve ver a mensagem de script autorizado executado com sucesso.
              </p>
            </div>
          </li>
          
          <li className="test-item">
            <span className="test-number">2</span>
            <div className="test-content">
              <h4 className="test-title">Testar Violação de CSP</h4>
              <p className="test-description">
                Tente injetar um script via console. O script será bloqueado pelo CSP.
              </p>
              <code className="test-code">
                {`document.body.innerHTML += '<script>alert(1)</script>'`}
              </code>
            </div>
          </li>
          
          <li className="test-item">
            <span className="test-number">3</span>
            <div className="test-content">
              <h4 className="test-title">Inspecionar Headers</h4>
              <p className="test-description">
                No DevTools → Network → selecione a requisição → Headers. 
                Verifique Content-Security-Policy e outros headers de segurança.
              </p>
            </div>
          </li>
          
          <li className="test-item">
            <span className="test-number">4</span>
            <div className="test-content">
              <h4 className="test-title">Testar Server Actions</h4>
              <p className="test-description">
                Use o formulário de exemplo ou chame a função com dados inválidos para ver o tratamento de erros.
              </p>
              <code className="test-code">
                {`transferFunds({ amount: -100, toAccount: 'invalid' })`}
              </code>
            </div>
          </li>
        </ul>
      </section>

      <section className="section">
        <div className="section-header">
          <BookOpen size={24} />
          <h2 className="section-title">Referências</h2>
        </div>
        
        <div className="feature-grid">
          <a 
            href="https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy" 
            target="_blank" 
            rel="noopener noreferrer"
            className="feature-card feature-card-link"
          >
            <div className="feature-icon">
              <ExternalLink size={20} />
            </div>
            <h3 className="feature-title">Next.js CSP Docs</h3>
            <p className="feature-description">
              Documentação oficial sobre Content Security Policy no Next.js.
            </p>
          </a>
          
          <a 
            href="https://owasp.org/www-community/attacks/Server_Side_Request_Forgery" 
            target="_blank" 
            rel="noopener noreferrer"
            className="feature-card feature-card-link"
          >
            <div className="feature-icon">
              <ExternalLink size={20} />
            </div>
            <h3 className="feature-title">OWASP SSRF</h3>
            <p className="feature-description">
              Guia OWASP sobre Server-Side Request Forgery e mitigações.
            </p>
          </a>
        </div>
      </section>
    </div>
  );
}
