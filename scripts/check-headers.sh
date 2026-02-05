#!/bin/bash
# ============================================================
# Script de Validação de Security Headers
# ============================================================
# Verifica se os headers de segurança estão configurados corretamente
# 
# Uso:
#   ./scripts/check-headers.sh [URL]
#
# Exemplos:
#   ./scripts/check-headers.sh                          # Usa localhost:3000
#   ./scripts/check-headers.sh https://hardened.com.br  # URL específica
# ============================================================

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# URL padrão
URL="${1:-http://localhost:3000}"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         VALIDAÇÃO DE SECURITY HEADERS                        ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "🎯 URL: ${YELLOW}${URL}${NC}"
echo ""

# Contador de erros
ERRORS=0
WARNINGS=0

# ============================================================
# Função para verificar header
# ============================================================
check_header() {
  local header_name="$1"
  local expected_value="$2"
  local is_required="$3"
  local actual_value
  
  actual_value=$(echo "$HEADERS" | grep -i "^${header_name}:" | cut -d':' -f2- | xargs || echo "")
  
  if [ -z "$actual_value" ]; then
    if [ "$is_required" = "required" ]; then
      echo -e "${RED}❌ ${header_name}: AUSENTE${NC}"
      ((ERRORS++))
    else
      echo -e "${YELLOW}⚠️  ${header_name}: AUSENTE (recomendado)${NC}"
      ((WARNINGS++))
    fi
    return 1
  fi
  
  if [ -n "$expected_value" ]; then
    if [[ "$actual_value" == *"$expected_value"* ]]; then
      echo -e "${GREEN}✓ ${header_name}: ${actual_value}${NC}"
    else
      echo -e "${YELLOW}⚠️  ${header_name}: ${actual_value}${NC}"
      echo -e "   Esperado conter: ${expected_value}"
      ((WARNINGS++))
    fi
  else
    echo -e "${GREEN}✓ ${header_name}: ${actual_value}${NC}"
  fi
}

# ============================================================
# Buscar headers
# ============================================================
echo -e "${YELLOW}📡 Buscando headers...${NC}"
echo ""

# Faz requisição e captura headers
HEADERS=$(curl -sI -X GET "$URL" 2>/dev/null || echo "")

if [ -z "$HEADERS" ]; then
  echo -e "${RED}❌ Não foi possível conectar a ${URL}${NC}"
  echo "   Verifique se o servidor está rodando."
  exit 1
fi

# ============================================================
# Verificar headers obrigatórios
# ============================================================
echo -e "${BLUE}═══ Headers Obrigatórios ═══${NC}"
echo ""

check_header "Content-Security-Policy" "" "required"
check_header "X-Frame-Options" "DENY" "required"
check_header "X-Content-Type-Options" "nosniff" "required"
check_header "Referrer-Policy" "" "required"

echo ""

# ============================================================
# Verificar headers recomendados
# ============================================================
echo -e "${BLUE}═══ Headers Recomendados ═══${NC}"
echo ""

check_header "Strict-Transport-Security" "max-age=" "recommended"
check_header "Permissions-Policy" "" "recommended"
check_header "X-XSS-Protection" "" "recommended"
check_header "X-DNS-Prefetch-Control" "" "optional"

echo ""

# ============================================================
# Análise do CSP
# ============================================================
echo -e "${BLUE}═══ Análise do CSP ═══${NC}"
echo ""

CSP=$(echo "$HEADERS" | grep -i "^Content-Security-Policy:" | cut -d':' -f2- || echo "")

if [ -n "$CSP" ]; then
  # Verifica diretivas importantes
  echo "Diretivas encontradas:"
  
  if [[ "$CSP" == *"default-src"* ]]; then
    echo -e "  ${GREEN}✓ default-src${NC}"
  else
    echo -e "  ${RED}❌ default-src (ausente)${NC}"
    ((ERRORS++))
  fi
  
  if [[ "$CSP" == *"script-src"* ]]; then
    echo -e "  ${GREEN}✓ script-src${NC}"
    
    # Verifica se tem unsafe-inline sem nonce
    if [[ "$CSP" == *"'unsafe-inline'"* ]] && [[ "$CSP" != *"nonce-"* ]] && [[ "$CSP" != *"'strict-dynamic'"* ]]; then
      echo -e "    ${YELLOW}⚠️  'unsafe-inline' sem nonce/strict-dynamic${NC}"
      ((WARNINGS++))
    fi
  else
    echo -e "  ${YELLOW}⚠️  script-src (usando default-src)${NC}"
  fi
  
  if [[ "$CSP" == *"style-src"* ]]; then
    echo -e "  ${GREEN}✓ style-src${NC}"
  fi
  
  if [[ "$CSP" == *"object-src 'none'"* ]]; then
    echo -e "  ${GREEN}✓ object-src 'none'${NC}"
  else
    echo -e "  ${YELLOW}⚠️  object-src não está 'none'${NC}"
    ((WARNINGS++))
  fi
  
  if [[ "$CSP" == *"base-uri"* ]]; then
    echo -e "  ${GREEN}✓ base-uri${NC}"
  else
    echo -e "  ${YELLOW}⚠️  base-uri ausente${NC}"
    ((WARNINGS++))
  fi
  
  if [[ "$CSP" == *"frame-ancestors"* ]]; then
    echo -e "  ${GREEN}✓ frame-ancestors${NC}"
  else
    echo -e "  ${YELLOW}⚠️  frame-ancestors ausente${NC}"
    ((WARNINGS++))
  fi
  
  if [[ "$CSP" == *"upgrade-insecure-requests"* ]]; then
    echo -e "  ${GREEN}✓ upgrade-insecure-requests${NC}"
  fi
else
  echo -e "${RED}❌ CSP não encontrado!${NC}"
fi

echo ""

# ============================================================
# Verificar HSTS
# ============================================================
if [[ "$URL" == https://* ]]; then
  echo -e "${BLUE}═══ Análise do HSTS ═══${NC}"
  echo ""
  
  HSTS=$(echo "$HEADERS" | grep -i "^Strict-Transport-Security:" | cut -d':' -f2- || echo "")
  
  if [ -n "$HSTS" ]; then
    if [[ "$HSTS" == *"max-age="* ]]; then
      MAX_AGE=$(echo "$HSTS" | grep -o 'max-age=[0-9]*' | cut -d'=' -f2)
      if [ "$MAX_AGE" -ge 31536000 ]; then
        echo -e "${GREEN}✓ max-age adequado (${MAX_AGE}s = ~$(($MAX_AGE / 86400)) dias)${NC}"
      else
        echo -e "${YELLOW}⚠️  max-age baixo (${MAX_AGE}s). Recomendado: >= 31536000 (1 ano)${NC}"
        ((WARNINGS++))
      fi
    fi
    
    if [[ "$HSTS" == *"includeSubDomains"* ]]; then
      echo -e "${GREEN}✓ includeSubDomains${NC}"
    else
      echo -e "${YELLOW}⚠️  includeSubDomains ausente${NC}"
      ((WARNINGS++))
    fi
    
    if [[ "$HSTS" == *"preload"* ]]; then
      echo -e "${GREEN}✓ preload${NC}"
    else
      echo -e "${YELLOW}⚠️  preload ausente (necessário para HSTS preload list)${NC}"
    fi
  fi
  echo ""
fi

# ============================================================
# Resultado final
# ============================================================
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
if [ $ERRORS -eq 0 ]; then
  echo -e "${GREEN}║  ✅ VALIDAÇÃO CONCLUÍDA                                      ║${NC}"
else
  echo -e "${RED}║  ❌ VALIDAÇÃO COM ERROS                                      ║${NC}"
fi
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Erros:    ${RED}${ERRORS}${NC}"
echo -e "Avisos:   ${YELLOW}${WARNINGS}${NC}"
echo ""

if [ $ERRORS -gt 0 ]; then
  echo -e "${RED}Corrija os erros antes de fazer deploy em produção!${NC}"
  exit 1
fi

if [ $WARNINGS -gt 0 ]; then
  echo -e "${YELLOW}Considere resolver os avisos para melhorar a segurança.${NC}"
fi

echo ""
echo -e "${BLUE}Validação concluída em $(date '+%Y-%m-%d %H:%M:%S')${NC}"
