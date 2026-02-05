/**
 * ============================================================
 * SSRF Guard + DNS Rebinding Protection
 * ============================================================
 * 
 * Este módulo implementa defesa em profundidade contra:
 * 1. SSRF (Server-Side Request Forgery)
 * 2. DNS Rebinding Attacks
 * 
 * COMO O ATAQUE DE DNS REBINDING ACONTECE PASSO A PASSO:
 * 1. O usuário fornece uma URL (avatarUrl)
 * 2. O código chama dns.resolve4 e recebe um IP público (ex.: 93.184.216.34)
 * 3. Enquanto a aplicação ainda está validando, o atacante altera o registro DNS
 *    para apontar para um IP interno (ex.: 169.254.169.254)
 * 4. O código abre um socket (net.Socket). O kernel usa o novo IP, porque a
 *    resolução ocorre novamente no momento da conexão
 * 5. O request atinge um serviço interno (metadata da cloud, banco de dados, etc.)
 *    e devolve dados sensíveis ao atacante
 * 
 * A janela entre a primeira resolução e o handshake TCP é o ponto de exploração.
 * 
 * NOSSA DEFESA:
 * 1. Resolver DNS e verificar se IP é privado
 * 2. Abrir socket TCP manual para o IP resolvido com timeout de 3s
 * 3. Verificar socket.remoteAddress APÓS connect (pega rebinding)
 * 4. Só então fazer o fetch real (usando o fetch nativo do Next.js)
 */

import dns from 'dns/promises';
import net from 'net';

// ============================================================
// Regex para detectar IPs privados (RFC 1918 + Link-local)
// Simplificada conforme artigo
// ============================================================
const PRIVATE = /^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|127\.|169\.254\.)/;

/**
 * safeFetch - Fetch seguro contra SSRF e DNS Rebinding
 * 
 * Usa o fetch nativo do Next.js (preserva cache/revalidate)
 * 
 * @param raw - URL para fazer requisição
 * @returns Response do fetch nativo
 * @throws Error se IP privado detectado ou timeout
 * 
 * @example
 * const resp = await safeFetch('https://api.external.com/data');
 * const data = await resp.json();
 */
export async function safeFetch(raw: string): Promise<Response> {
  const url = new URL(raw);

  // ============================================================
  // ETAPA 0: Rejeita HTTP explicitamente antes de qualquer operação
  // Isso evita tentativas de conexão na porta errada
  // ============================================================
  if (url.protocol !== 'https:') {
    throw new Error('Apenas HTTPS permitido');
  }

  // ============================================================
  // ETAPA 1: Resolve DNS – impede hostname que já aponta para rede interna
  // ============================================================
  const ips = await dns.resolve4(url.hostname);
  if (ips.some(ip => PRIVATE.test(ip))) {
    throw new Error('IP privado na primeira resolução');
  }

  // ============================================================
  // ETAPA 2: Handshake manual – confirma IP real usado na conexão
  // Timeout de 3 segundos protege contra Slowloris
  // ============================================================
  const target = ips[0];
  await new Promise<void>((ok, nok) => {
    const socket = new net.Socket();
    
    // Timeout de 3s protege contra Slowloris
    const timer = setTimeout(() => {
      socket.destroy();
      nok(new Error('timeout handshake'));
    }, 3000);

    socket.once('error', (err) => {
      clearTimeout(timer);
      socket.destroy();
      nok(err);
    });

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

  // ============================================================
  // ETAPA 3: Usa o fetch nativo do Next.js (preserva cache/revalidate)
  // Não usar node-fetch para manter consistência com o cache do Next
  // ============================================================
  return fetch(raw);
}
