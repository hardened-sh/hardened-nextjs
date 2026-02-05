# Scripts de Auditoria e Segurança

Scripts utilitários para validação de segurança da aplicação.

## Scripts Disponíveis

### audit-deps.sh

Executa auditoria de segurança nas dependências npm.

```bash
# Auditoria básica
./scripts/audit-deps.sh

# Modo CI (falha se houver vulnerabilidades críticas/altas)
./scripts/audit-deps.sh --ci

# Com auto-fix
./scripts/audit-deps.sh --fix
```

**Output:**
- Contagem de vulnerabilidades por severidade
- Relatório JSON salvo em `reports/security/`
- Exit code 1 se houver vulnerabilidades críticas (modo CI)

### check-headers.sh

Valida os security headers de uma URL.

```bash
# Testar localhost
./scripts/check-headers.sh

# Testar staging
./scripts/check-headers.sh https://staging.hardened.com.br

# Testar produção
./scripts/check-headers.sh https://hardened.com.br
```

**Headers verificados:**

| Header | Status | Descrição |
|--------|--------|-----------|
| Content-Security-Policy | Obrigatório | Política de segurança de conteúdo |
| X-Frame-Options | Obrigatório | Proteção contra clickjacking |
| X-Content-Type-Options | Obrigatório | Previne MIME sniffing |
| Referrer-Policy | Obrigatório | Controle de referrer |
| Strict-Transport-Security | Recomendado | Força HTTPS |
| Permissions-Policy | Recomendado | Controle de features do browser |

## Uso no CI

### GitHub Actions

```yaml
- name: Audit dependencies
  run: ./scripts/audit-deps.sh --ci

- name: Check security headers
  run: ./scripts/check-headers.sh ${{ vars.STAGING_URL }}
```

### Localmente (pré-commit)

Adicione ao seu workflow de desenvolvimento:

```bash
# Antes de cada commit
./scripts/audit-deps.sh

# Antes de cada PR
./scripts/check-headers.sh http://localhost:3000
```

## Integração com Pipeline de Auditoria

Estes scripts se integram com o pipeline de auditoria descrito no artigo:

1. **CI/CD**: Executados automaticamente em cada PR
2. **Monitoramento**: Podem ser agendados via cron
3. **Deploy Gates**: Bloqueiam deploy se falhar

## Relatórios

Os relatórios são salvos em:

```
reports/
└── security/
    └── npm-audit-YYYYMMDD-HHMMSS.json
```

Mantenha esses relatórios para histórico de conformidade.
