/**
 * ============================================================
 * Dashboard - Exemplo de uso do safeFetch em Server Component
 * ============================================================
 * 
 * Este componente demonstra como usar o safeFetch para carregar
 * recursos externos de forma segura, protegendo contra SSRF e
 * DNS Rebinding.
 */

import { safeFetch } from '@/lib/safeFetch';

interface DashboardProps {
  searchParams: Promise<{ avatarUrl?: string }>;
}

export default async function Dashboard({ searchParams }: DashboardProps) {
  const params = await searchParams;
  const { avatarUrl } = params;
  
  let avatarBase64: string | null = null;
  let error: string | null = null;

  if (avatarUrl) {
    try {
      // Usa safeFetch para validar a URL contra SSRF/DNS Rebinding
      const resp = await safeFetch(avatarUrl);
      const buf = Buffer.from(await resp.arrayBuffer());
      avatarBase64 = buf.toString('base64');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Erro ao carregar avatar';
      console.error('[Dashboard] Falha ao carregar avatar:', error);
    }
  }

  return (
    <div>
      <section className="hero" style={{ marginBottom: '32px' }}>
        <h1 className="hero-title">Dashboard</h1>
        <p className="hero-subtitle">
          Exemplo de uso do safeFetch em Server Component
        </p>
      </section>

      <section className="section">
        <div className="section-header">
          <h2 className="section-title">Avatar do Usuário</h2>
        </div>

        <div className="result-box">
          <div className="result-header">
            <span>Resultado do safeFetch</span>
          </div>
          <div className="result-content">
            {!avatarUrl && (
              <p style={{ color: 'var(--color-text-muted)' }}>
                Nenhuma URL de avatar fornecida. 
                <br />
                <code className="test-code">
                  ?avatarUrl=https://example.com/avatar.jpg
                </code>
              </p>
            )}

            {error && (
              <div style={{ 
                padding: '16px', 
                background: 'var(--color-danger-subtle)', 
                borderRadius: '8px',
                color: 'var(--color-danger)'
              }}>
                <strong>Bloqueado pelo SSRF Guard:</strong>
                <br />
                {error}
              </div>
            )}

            {avatarBase64 && (
              <div style={{ textAlign: 'center' }}>
                <img 
                  src={`data:image/jpeg;base64,${avatarBase64}`} 
                  alt="Avatar" 
                  style={{ 
                    maxWidth: '200px', 
                    borderRadius: '50%',
                    border: '4px solid var(--color-accent)'
                  }}
                />
                <p style={{ marginTop: '12px', color: 'var(--color-success)' }}>
                  Avatar carregado com segurança via safeFetch
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <h2 className="section-title">Como funciona</h2>
        </div>

        <div className="code-block">
          <div className="code-header">
            <span>app/dashboard/page.tsx</span>
          </div>
          <div className="code-content">
            <pre>{`import { safeFetch } from '@/lib/security/safe-fetch';

export default async function Dashboard({ searchParams }) {
  const { avatarUrl } = searchParams;
  
  // safeFetch valida contra SSRF e DNS Rebinding
  const resp = await safeFetch(avatarUrl);
  const buf = Buffer.from(await resp.arrayBuffer());
  const b64 = buf.toString('base64');

  return (
    <img src={\`data:image/jpeg;base64,\${b64}\`} alt="Avatar" />
  );
}`}</pre>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <h2 className="section-title">Testes de Segurança</h2>
        </div>

        <ul className="test-list">
          <li className="test-item">
            <span className="test-number">1</span>
            <div className="test-content">
              <h4 className="test-title">URL Válida (deve funcionar)</h4>
              <code className="test-code">
                ?avatarUrl=https://avatars.githubusercontent.com/u/1?v=4
              </code>
            </div>
          </li>
          
          <li className="test-item">
            <span className="test-number">2</span>
            <div className="test-content">
              <h4 className="test-title">IP Privado (deve bloquear)</h4>
              <code className="test-code">
                ?avatarUrl=http://192.168.1.1/admin
              </code>
            </div>
          </li>
          
          <li className="test-item">
            <span className="test-number">3</span>
            <div className="test-content">
              <h4 className="test-title">Localhost (deve bloquear)</h4>
              <code className="test-code">
                ?avatarUrl=http://127.0.0.1:3000/api/secret
              </code>
            </div>
          </li>
          
          <li className="test-item">
            <span className="test-number">4</span>
            <div className="test-content">
              <h4 className="test-title">AWS Metadata (deve bloquear)</h4>
              <code className="test-code">
                ?avatarUrl=http://169.254.169.254/latest/meta-data/
              </code>
            </div>
          </li>
        </ul>
      </section>
    </div>
  );
}
