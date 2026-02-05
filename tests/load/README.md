# Testes de Carga

Este diretório contém scripts de teste de carga para validar a resiliência da aplicação sob diferentes condições de tráfego.

## Pré-requisitos

### Instalar k6

```bash
# macOS
brew install k6

# Linux (Debian/Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Docker
docker pull grafana/k6
```

## Executar Testes

### Teste Local

```bash
# Iniciar aplicação
npm run build && npm start

# Em outro terminal, executar teste
k6 run tests/load/image-optimizer.k6.js
```

### Teste contra Staging/Produção

```bash
# Staging
k6 run -e BASE_URL=https://staging.hardened.com.br tests/load/image-optimizer.k6.js

# Produção (com cuidado!)
k6 run -e BASE_URL=https://hardened.com.br tests/load/image-optimizer.k6.js
```

### Com Docker

```bash
docker run --rm -i grafana/k6 run - < tests/load/image-optimizer.k6.js
```

## Cenários de Teste

O script `image-optimizer.k6.js` executa 3 cenários:

### 1. Normal Load (0-2:30)
- Ramp up gradual até 10 VUs
- Simula tráfego regular
- Valida tempo de resposta e headers

### 2. Stress Test (2:30-5:30)
- Ramp up até 100 VUs
- Testa comportamento sob pressão
- Verifica degradação graceful

### 3. Spike Test (5:30-6:20)
- Spike súbito para 200 VUs
- Simula picos de tráfego
- Valida rate limiting

## Métricas Monitoradas

| Métrica | Threshold | Descrição |
|---------|-----------|-----------|
| `http_req_duration` | p95 < 2s | Tempo de resposta |
| `errors` | rate < 5% | Taxa de erro |
| `csp_header_present` | rate > 99% | Presença do CSP |
| `image_optimize_time` | avg < 1s | Tempo de otimização |

## Resultados

Os resultados são salvos em `tests/load/results/`:

- `summary.json` - Resumo em JSON
- Console output - Relatório visual

## Integração com CI

O teste de carga pode ser executado no CI após deploy em staging:

```yaml
- name: Run load tests
  run: k6 run -e BASE_URL=${{ vars.STAGING_URL }} tests/load/image-optimizer.k6.js
```

**⚠️ Não execute testes de carga contra produção sem autorização!**
