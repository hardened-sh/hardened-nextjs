/**
 * ============================================================
 * Teste de Carga - Image Optimizer
 * ============================================================
 * 
 * Testa a resiliência do Image Optimizer do Next.js sob carga.
 * Verifica rate limiting, tempo de resposta e comportamento sob stress.
 * 
 * Executar com:
 *   k6 run tests/load/image-optimizer.k6.js
 * 
 * Com variáveis customizadas:
 *   k6 run -e BASE_URL=https://staging.hardened.com.br tests/load/image-optimizer.k6.js
 * 
 * Gerar relatório HTML:
 *   k6 run --out json=results.json tests/load/image-optimizer.k6.js
 *   # Usar k6-reporter para converter JSON em HTML
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ============================================================
// Métricas Customizadas
// ============================================================

const errorRate = new Rate('errors');
const rateLimitHits = new Counter('rate_limit_hits');
const imageOptimizeTime = new Trend('image_optimize_time');
const cspHeaderPresent = new Rate('csp_header_present');

// ============================================================
// Configuração do Teste
// ============================================================

export const options = {
  // Cenários de carga
  scenarios: {
    // Carga normal - simula tráfego regular
    normal_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },  // Ramp up
        { duration: '1m', target: 10 },   // Sustain
        { duration: '30s', target: 0 },   // Ramp down
      ],
      gracefulRampDown: '10s',
    },
    
    // Stress test - verifica comportamento sob pressão
    stress_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 50 },  // Ramp up rápido
        { duration: '30s', target: 50 },  // Sustain alta carga
        { duration: '20s', target: 100 }, // Pico
        { duration: '30s', target: 100 }, // Sustain pico
        { duration: '20s', target: 0 },   // Ramp down
      ],
      gracefulRampDown: '10s',
      startTime: '2m30s', // Inicia após normal_load
    },
    
    // Spike test - simula picos súbitos
    spike_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 200 }, // Spike imediato
        { duration: '30s', target: 200 }, // Manter spike
        { duration: '10s', target: 0 },   // Drop
      ],
      gracefulRampDown: '5s',
      startTime: '5m30s', // Inicia após stress_test
    },
  },
  
  // Thresholds - critérios de sucesso
  thresholds: {
    // 95% das requisições devem completar em menos de 2s
    http_req_duration: ['p(95)<2000'],
    
    // Taxa de erro deve ser menor que 5%
    errors: ['rate<0.05'],
    
    // CSP deve estar presente em 100% das respostas
    csp_header_present: ['rate>0.99'],
    
    // Tempo médio de otimização de imagem < 1s
    image_optimize_time: ['avg<1000', 'p(95)<2000'],
  },
};

// ============================================================
// Configuração de Ambiente
// ============================================================

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Imagens de teste (devem existir no servidor ou ser URLs válidas)
const TEST_IMAGES = [
  '/_next/image?url=%2Ftest-image.jpg&w=640&q=75',
  '/_next/image?url=%2Ftest-image.jpg&w=1080&q=75',
  '/_next/image?url=%2Ftest-image.jpg&w=1920&q=75',
  '/_next/image?url=%2Ftest-image.jpg&w=640&q=90',
  '/_next/image?url=%2Ftest-image.jpg&w=256&q=75',
];

// Headers de requisição
const HEADERS = {
  'Accept': 'image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'User-Agent': 'k6-load-test/1.0',
};

// ============================================================
// Funções de Teste
// ============================================================

/**
 * Verifica se os security headers estão presentes
 */
function checkSecurityHeaders(response) {
  const hasCSP = response.headers['Content-Security-Policy'] !== undefined;
  cspHeaderPresent.add(hasCSP);
  
  return {
    'CSP header present': hasCSP,
    'X-Frame-Options present': response.headers['X-Frame-Options'] !== undefined,
    'X-Content-Type-Options present': response.headers['X-Content-Type-Options'] !== undefined,
    'Strict-Transport-Security present': response.headers['Strict-Transport-Security'] !== undefined,
  };
}

/**
 * Testa endpoint de otimização de imagem
 */
function testImageOptimizer() {
  const imageUrl = TEST_IMAGES[Math.floor(Math.random() * TEST_IMAGES.length)];
  const url = `${BASE_URL}${imageUrl}`;
  
  const startTime = Date.now();
  const response = http.get(url, { headers: HEADERS });
  const duration = Date.now() - startTime;
  
  imageOptimizeTime.add(duration);
  
  // Verifica rate limiting (429)
  if (response.status === 429) {
    rateLimitHits.add(1);
  }
  
  const success = check(response, {
    'status is 200 or 304': (r) => r.status === 200 || r.status === 304,
    'response time < 2s': (r) => r.timings.duration < 2000,
    'content-type is image': (r) => {
      const ct = r.headers['Content-Type'] || '';
      return ct.includes('image/') || r.status === 304;
    },
  });
  
  errorRate.add(!success);
  
  return response;
}

/**
 * Testa página principal
 */
function testHomePage() {
  const response = http.get(`${BASE_URL}/`, { headers: HEADERS });
  
  const headerChecks = checkSecurityHeaders(response);
  
  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 1s': (r) => r.timings.duration < 1000,
    ...headerChecks,
  });
  
  errorRate.add(!success);
  
  return response;
}

/**
 * Testa dashboard (se existir)
 */
function testDashboard() {
  const response = http.get(`${BASE_URL}/dashboard`, { headers: HEADERS });
  
  const success = check(response, {
    'status is 200 or 404': (r) => r.status === 200 || r.status === 404,
    'response time < 1s': (r) => r.timings.duration < 1000,
  });
  
  errorRate.add(!success && response.status !== 404);
  
  return response;
}

// ============================================================
// Função Principal de Teste
// ============================================================

export default function () {
  group('Page Load', () => {
    testHomePage();
    sleep(0.5);
  });
  
  group('Image Optimizer', () => {
    // Faz múltiplas requisições de imagem para simular página real
    for (let i = 0; i < 3; i++) {
      testImageOptimizer();
      sleep(0.1);
    }
  });
  
  group('Dashboard', () => {
    testDashboard();
    sleep(0.5);
  });
  
  // Pausa entre iterações
  sleep(Math.random() * 2 + 1); // 1-3 segundos
}

// ============================================================
// Setup e Teardown
// ============================================================

export function setup() {
  console.log(`🎯 Iniciando teste de carga contra: ${BASE_URL}`);
  console.log('📊 Métricas customizadas: errors, rate_limit_hits, image_optimize_time, csp_header_present');
  
  // Verifica se o servidor está acessível
  const response = http.get(`${BASE_URL}/`);
  if (response.status !== 200) {
    throw new Error(`Servidor não acessível: ${response.status}`);
  }
  
  return { startTime: Date.now() };
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`✅ Teste finalizado em ${duration.toFixed(2)}s`);
}

// ============================================================
// Relatório de Resumo
// ============================================================

export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    metrics: {
      totalRequests: data.metrics.http_reqs?.values?.count || 0,
      failedRequests: data.metrics.http_req_failed?.values?.passes || 0,
      avgResponseTime: data.metrics.http_req_duration?.values?.avg?.toFixed(2) || 0,
      p95ResponseTime: data.metrics.http_req_duration?.values?.['p(95)']?.toFixed(2) || 0,
      errorRate: (data.metrics.errors?.values?.rate * 100 || 0).toFixed(2) + '%',
      rateLimitHits: data.metrics.rate_limit_hits?.values?.count || 0,
    },
    thresholds: data.thresholds,
  };
  
  return {
    'tests/load/results/summary.json': JSON.stringify(summary, null, 2),
    stdout: generateTextReport(summary),
  };
}

function generateTextReport(summary) {
  return `
╔══════════════════════════════════════════════════════════════╗
║            RELATÓRIO DE TESTE DE CARGA                       ║
╠══════════════════════════════════════════════════════════════╣
║ URL Base: ${summary.baseUrl.padEnd(48)} ║
║ Timestamp: ${summary.timestamp.padEnd(47)} ║
╠══════════════════════════════════════════════════════════════╣
║ MÉTRICAS                                                     ║
╠══════════════════════════════════════════════════════════════╣
║ Total de Requisições:    ${String(summary.metrics.totalRequests).padEnd(33)} ║
║ Requisições Falhas:      ${String(summary.metrics.failedRequests).padEnd(33)} ║
║ Taxa de Erro:            ${summary.metrics.errorRate.padEnd(33)} ║
║ Tempo Médio de Resposta: ${(summary.metrics.avgResponseTime + 'ms').padEnd(33)} ║
║ P95 Tempo de Resposta:   ${(summary.metrics.p95ResponseTime + 'ms').padEnd(33)} ║
║ Rate Limit Hits:         ${String(summary.metrics.rateLimitHits).padEnd(33)} ║
╚══════════════════════════════════════════════════════════════╝
`;
}
