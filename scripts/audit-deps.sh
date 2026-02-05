#!/bin/bash
# ============================================================
# Script de Auditoria de Dependências
# ============================================================
# Executa auditoria de segurança nas dependências do projeto
# 
# Uso:
#   ./scripts/audit-deps.sh [--ci] [--fix]
#
# Opções:
#   --ci   Modo CI - falha com exit code 1 se houver vulnerabilidades altas/críticas
#   --fix  Tenta corrigir vulnerabilidades automaticamente
# ============================================================

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Argumentos
CI_MODE=false
AUTO_FIX=false

for arg in "$@"; do
  case $arg in
    --ci)
      CI_MODE=true
      shift
      ;;
    --fix)
      AUTO_FIX=true
      shift
      ;;
  esac
done

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         AUDITORIA DE SEGURANÇA - DEPENDÊNCIAS               ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ============================================================
# 1. Verificar package-lock.json
# ============================================================
echo -e "${YELLOW}📋 Verificando package-lock.json...${NC}"

if [ ! -f "package-lock.json" ]; then
  echo -e "${RED}❌ package-lock.json não encontrado!${NC}"
  echo "   Execute 'npm install' primeiro."
  exit 1
fi

echo -e "${GREEN}✓ package-lock.json encontrado${NC}"
echo ""

# ============================================================
# 2. npm audit
# ============================================================
echo -e "${YELLOW}🔍 Executando npm audit...${NC}"
echo ""

# Captura o output e código de saída
AUDIT_OUTPUT=$(npm audit --json 2>/dev/null || true)
AUDIT_EXIT_CODE=$?

# Parse do JSON para extrair contagens
CRITICAL=$(echo "$AUDIT_OUTPUT" | grep -o '"critical":[0-9]*' | head -1 | cut -d':' -f2 || echo "0")
HIGH=$(echo "$AUDIT_OUTPUT" | grep -o '"high":[0-9]*' | head -1 | cut -d':' -f2 || echo "0")
MODERATE=$(echo "$AUDIT_OUTPUT" | grep -o '"moderate":[0-9]*' | head -1 | cut -d':' -f2 || echo "0")
LOW=$(echo "$AUDIT_OUTPUT" | grep -o '"low":[0-9]*' | head -1 | cut -d':' -f2 || echo "0")

# Exibe resumo
echo -e "┌─────────────────────────────────────┐"
echo -e "│ ${RED}Críticas:${NC}  ${CRITICAL:-0}"
echo -e "│ ${YELLOW}Altas:${NC}     ${HIGH:-0}"
echo -e "│ ${BLUE}Moderadas:${NC} ${MODERATE:-0}"
echo -e "│ ${GREEN}Baixas:${NC}    ${LOW:-0}"
echo -e "└─────────────────────────────────────┘"
echo ""

# ============================================================
# 3. Salvar relatório detalhado
# ============================================================
REPORT_DIR="./reports/security"
mkdir -p "$REPORT_DIR"

REPORT_FILE="$REPORT_DIR/npm-audit-$(date +%Y%m%d-%H%M%S).json"
echo "$AUDIT_OUTPUT" > "$REPORT_FILE"
echo -e "${GREEN}📄 Relatório salvo em: ${REPORT_FILE}${NC}"
echo ""

# ============================================================
# 4. Auto-fix (se solicitado)
# ============================================================
if [ "$AUTO_FIX" = true ]; then
  echo -e "${YELLOW}🔧 Tentando corrigir vulnerabilidades automaticamente...${NC}"
  npm audit fix --force || true
  echo ""
  
  echo -e "${YELLOW}🔍 Executando nova auditoria após fix...${NC}"
  npm audit || true
  echo ""
fi

# ============================================================
# 5. Verificações adicionais
# ============================================================
echo -e "${YELLOW}🔎 Verificações adicionais...${NC}"
echo ""

# Verifica se há dependências desatualizadas
echo "Dependências desatualizadas:"
npm outdated || echo "Todas as dependências estão atualizadas."
echo ""

# ============================================================
# 6. Resultado final
# ============================================================
TOTAL_SEVERE=$((${CRITICAL:-0} + ${HIGH:-0}))

if [ "$TOTAL_SEVERE" -gt 0 ]; then
  echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║  ⚠️  VULNERABILIDADES CRÍTICAS/ALTAS ENCONTRADAS!            ║${NC}"
  echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "Encontradas ${RED}${TOTAL_SEVERE}${NC} vulnerabilidades de alta severidade."
  echo ""
  echo "Ações recomendadas:"
  echo "  1. Execute 'npm audit' para ver detalhes"
  echo "  2. Execute 'npm audit fix' para correções automáticas"
  echo "  3. Para correções breaking: 'npm audit fix --force'"
  echo "  4. Atualize manualmente dependências problemáticas"
  echo ""
  
  if [ "$CI_MODE" = true ]; then
    echo -e "${RED}CI Mode: Falhando build devido a vulnerabilidades.${NC}"
    exit 1
  fi
else
  echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  ✅ NENHUMA VULNERABILIDADE CRÍTICA/ALTA ENCONTRADA         ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
fi

echo ""
echo -e "${BLUE}Auditoria concluída em $(date '+%Y-%m-%d %H:%M:%S')${NC}"
