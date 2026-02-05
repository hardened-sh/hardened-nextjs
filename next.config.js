/** @type {import('next').NextConfig} */
const nextConfig = {
  // ============================================================
  // SECURITY: Remove fingerprint header "X-Powered-By: Next.js"
  // Motivo: Dificulta identificação do framework por atacantes
  // ============================================================
  poweredByHeader: false,

  // ============================================================
  // SECURITY: Headers de defesa globais
  // Aplicados a todas as rotas da aplicação
  // ============================================================
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // HSTS: Força HTTPS por 2 anos, incluindo subdomínios
          // preload permite inclusão na lista HSTS dos browsers
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          // Previne click-jacking: página não pode ser embedada em iframe
          { 
            key: 'X-Frame-Options', 
            value: 'DENY' 
          },
          // Bloqueia MIME sniffing: browser deve respeitar Content-Type
          { 
            key: 'X-Content-Type-Options', 
            value: 'nosniff' 
          },
          // Política de Referrer restrita: só envia para same-origin
          { 
            key: 'Referrer-Policy', 
            value: 'same-origin' 
          },
          // Permissions Policy: desabilita features não utilizadas
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          }
        ]
      }
    ];
  },

  // ============================================================
  // SECURITY: Image Optimizer - Whitelist restrita
  // Motivo: Previne SSRF via otimização de imagens externas
  // NUNCA use wildcard (*) em hostname
  // ============================================================
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'assets.hardened.com.br',
        pathname: '/uploads/**'
      }
    ]
  },

  // React Strict Mode para detectar problemas em desenvolvimento
  reactStrictMode: true
};

module.exports = nextConfig;
