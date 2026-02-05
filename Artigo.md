Segurança no Next.js: O Guia Técnico que a Documentação Não MostraIntroSegurança no Next.js deixou de ser um detalhe de “XSS aqui, CSRF ali”. O App Router introduziu Server Actions, Server Components e um otimizador de imagens que rodam no servidor. Cada um desses recursos cria uma nova superfície de ataque. Neste guia vamos mapear as falhas mais críticas e aplicar contramedidas que realmente funcionam em produção.Setup Inicial de Segurança no Next.js/** @type {import('next').NextConfig} */
const cfg = {
  // Remove o fingerprint “X‑Powered‑By: Next.js”
  poweredByHeader: false,

  // Cabeçalhos de defesa globais
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' }
        ]
      }
    ];
  },

  // Otimização de imagem – nunca wildcard total
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'assets.hardened.com.br',
        pathname: '/uploads/**' // aceita somente caminhos controlados
      }
    ]
  },

  reactStrictMode: true
};

module.exports = cfg;Por que o remotePatterns com wildcard abre um proxy de download?O componente <Image /> baixa a URL fornecida, a passa por sharp e devolve o buffer ao cliente. Quando o padrão aceita * (por exemplo, hostname: '*'), qualquer endereço externo pode ser solicitado. Um atacante envia um link para um arquivo de vários gigabytes ou para um endpoint que gera dados infinitos. O servidor tenta processar o arquivo, consome CPU, memória e largura de banda — um DoS que escala com o número de requisições simultâneas.Ao limitar a lista a domínios e caminhos conhecidos, o otimizador só processa arquivos que já fazem parte da cadeia de confiança. Não há mais “proxy aberto” para a internet e a superfície de ataque diminui drasticamente.Server Actions e Tratamento de Erro// app/actions/transfer.ts
'use server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';

const TransferSchema = z.object({
  amount: z.number().int().positive().max(1_000_000),
  toAccount: z.string().regex(/^ACC-\d{6}$/)
});

export async function transferFunds(payload: unknown) {
  const sess = await getSession();

  // 1️⃣ Autorização explícita
  if (!sess?.user?.roles?.includes('finance')) {
    return { success: false, error: 'unauthorized', id: crypto.randomUUID() };
  }

  try {
    // 2️⃣ Validação rígida de entrada
    const { amount, toAccount } = TransferSchema.parse(payload);

    // 3️⃣ Chamada ao backend interno com token anti‑CSRF
    const res = await fetch(`${process.env.API_URL}/transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-next-action-token': sess.csrfToken
      },
      body: JSON.stringify({ amount, toAccount })
    });

    if (!res.ok) {
      console.error('[Transfer] backend error', res.status);
      return { success: false, error: 'backend', id: crypto.randomUUID() };
    }

    const data = await res.json();
    return { success: true, data };
  } catch (e) {
    console.error('[Transfer] exception', e);
    return { success: false, error: 'bad_input', id: crypto.randomUUID() };
  }
}Por que lançar throw gera “Silent Failure”?Quando uma Server Action dispara uma exceção, o Next.js converte o erro em uma página de renderização falhada. O usuário vê uma tela branca e o stack trace desaparece dos logs do cliente. O atacante ganha a informação de que algo falhou, mas não sabe onde.Retornar um objeto estruturado { success, error, id } mantém a UI consistente. O front pode exibir um toast genérico, registrar o id para auditoria e continuar a renderização. Não há “estado inconsistente” que permita ao atacante inferir a lógica interna.O Pesadelo do SSRF e DNS RebindingComo o ataque de DNS Rebinding acontece passo a passo
O usuário fornece uma URL (avatarUrl).
O código chama dns.resolve4 e recebe um IP público (ex.: 93.184.216.34).
Enquanto a aplicação ainda está validando, o atacante altera o registro DNS para apontar para um IP interno (ex.: 169.254.169.254).
O código abre um socket (net.Socket). O kernel usa o novo IP, porque a resolução ocorre novamente no momento da conexão.
O request atinge um serviço interno (metadata da cloud, banco de dados, etc.) e devolve dados sensíveis ao atacante.

A janela entre a primeira resolução e o handshake TCP é o ponto de exploração.
Implementação segura (global fetch, handshake TCP, timeout)
// lib/safeFetch.ts
import dns from 'dns/promises';
import net from 'net';

const PRIVATE = /^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/;

export async function safeFetch(raw: string) {
  const url = new URL(raw);

  // 1️⃣ Resolve DNS – impede hostname que já aponta para rede interna
  const ips = await dns.resolve4(url.hostname);
  if (ips.some(ip => PRIVATE.test(ip))) {
    throw new Error('IP privado na primeira resolução');
  }

  // 2️⃣ Handshake manual – confirma IP real usado na conexão
  const target = ips[0];
  await new Promise<void>((ok, nok) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      nok(new Error('timeout handshake'));
    }, 3000); // protege contra Slowloris

    socket.once('error', nok);
    socket.connect(443, target, () => {
      clearTimeout(timer);
      const remote = socket.remoteAddress!;
      if (PRIVATE.test(remote)) {
        socket.destroy();
        nok(new Error('IP privado após handshake'));
      } else {
        socket.end();
        ok();
      }
    });
  });

  // 3️⃣ Usa o fetch nativo do Next.js (preserva cache/revalidate)
  return fetch(raw);
}
Por que remover node-fetch?
Next 14/15 já expõe um fetch global que entende as diretivas de cache (revalidate, no-store). Importar node-fetch cria um segundo cache independente e pode servir respostas desatualizadas. Usar o fetch nativo garante consistência, performance e compatibilidade com o Edge Runtime.
Uso em Server Component
// app/dashboard/page.tsx
import { safeFetch } from '@/lib/safeFetch';

export default async function Dashboard({ searchParams }) {
  const { avatarUrl } = searchParams;
  const resp = await safeFetch(avatarUrl);
  const buf = Buffer.from(await resp.arrayBuffer());
  const b64 = buf.toString('base64');

  return (
    <div>
      <h1>Dashboard</h1>
      <img src={`data:image/jpeg;base64,${b64}`} alt="Avatar" />
    </div>
  );
}

Hardening de Produção com CSP
Por que o Layout não tem acesso ao request?
No App Router o HTML é streamed. O componente layout.tsx é renderizado antes que o objeto Request esteja disponível. O padrão antigo de ler req.headers em _document.js não funciona mais, o que impede a geração de um nonce por request.
Solução: Middleware → Header → Layout
Middleware (gera nonce, usa crypto.randomUUID para compatibilidade Edge)
// middleware.ts
import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';

export async function middleware(req) {
  const nonce = randomUUID(); // funciona no Edge Runtime

  const res = NextResponse.next();
  const csp = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}';
    style-src 'self' 'nonce-${nonce}';
    img-src 'self' data:;
    font-src 'self';
    connect-src 'self' https://api.hardened.com;
    object-src 'none';
    base-uri 'none';
    frame-ancestors 'none';
  `.replace(/\s+/g, ' ').trim();

  res.headers.set('Content-Security-Policy', csp);
  res.headers.set('x-csp-nonce', nonce);
  return res;
}
Layout (consome o header)
// app/layout.tsx
import { headers } from 'next/headers';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = headers().get('x-csp-nonce') ?? '';

  return (
    <html lang="pt-BR">
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `console.log('CSP ativo')`
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
Como a defesa funciona

Middleware age como um firewall de aplicação: gera um token único por request e o injeta no cabeçalho CSP.
Header transporta o nonce até o layout, que está sendo renderizado em streaming.
Browser aceita apenas scripts que carregam o mesmo nonce. Qualquer <script> inline ou externo sem o token é bloqueado, eliminando a maioria das injeções de script.


Conclusão
Segurança no Next.js exige mais que cabeçalhos padrão. É preciso entender como o App Router transforma o frontend em backend e fechar cada ponto de entrada.

Restrinja remotePatterns para impedir Image DoS.
Use Server Actions com validação, autorização e retorno { success, error, id } para evitar estado inconsistente.
Implemente safeFetch com DNS resolve + handshake TCP para bloquear SSRF e DNS rebinding.
Gere CSP nonce no middleware, passe via header e consuma no layout para eliminar scripts não autorizados.

Todo o código está disponível no repositório Hardened. Clone, execute os testes de carga e incorpore ao seu pipeline CI. A superfície de ataque diminui, a confiança aumenta.
CTA: https://hardened.com.br/?p=338&preview=true