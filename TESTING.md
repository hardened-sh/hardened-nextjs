# Guia de Testes de Segurança - Hardened Next.js

Este guia detalha como testar cada uma das proteções de segurança implementadas nesta PoC.

## Pré-requisitos

```bash
# Instalar dependências
npm install

# Iniciar o servidor de desenvolvimento
npm run dev
```

Acesse: http://localhost:3000

---

## 1. Testando CSP (Content Security Policy) com Nonce

### O que estamos protegendo?
A CSP impede a execução de scripts não autorizados, bloqueando ataques XSS.

### Teste 1.1: Verificar que o CSP está ativo

1. Abra o DevTools (F12)
2. Vá na aba **Console**
3. Você deve ver:
   ```
   [CSP] Script autorizado executado com sucesso!
   [CSP] Nonce validado pelo browser
   ```

### Teste 1.2: Verificar headers de segurança

1. Abra o DevTools (F12)
2. Vá na aba **Network**
3. Selecione a primeira requisição (documento HTML)
4. Clique na aba **Headers**
5. Procure por `Content-Security-Policy`
6. Você deve ver algo como:
   ```
   Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-xxxxxxxx' 'strict-dynamic'; ...
   ```

### Teste 1.3: Tentar injetar script malicioso (deve falhar)

1. Abra o Console do DevTools
2. Execute:
   ```javascript
   document.body.innerHTML += '<script>alert("XSS")</script>'
   ```
3. **Resultado esperado**: O script NÃO executa e você vê no Console:
   ```
   Refused to execute inline script because it violates the following Content Security Policy directive...
   ```

### Teste 1.4: Tentar injetar script via createElement (deve falhar)

```javascript
const s = document.createElement('script');
s.textContent = 'alert("XSS")';
document.body.appendChild(s);
```

**Resultado esperado**: Bloqueado pelo CSP.

---

## 2. Testando SSRF Guard e DNS Rebinding Protection

### O que estamos protegendo?
O `safeFetch` impede que atacantes façam requisições para IPs internos (AWS metadata, bancos de dados internos, etc.).

### Acesse a página de teste
Vá para: http://localhost:3000/dashboard

### Teste 2.1: URL válida (deve funcionar)

Acesse:
```
http://localhost:3000/dashboard?avatarUrl=https://avatars.githubusercontent.com/u/1?v=4
```

**Resultado esperado**: Avatar carregado com sucesso.

### Teste 2.2: HTTP (não HTTPS) - deve bloquear

```
http://localhost:3000/dashboard?avatarUrl=http://example.com/image.jpg
```

**Resultado esperado**: Erro "Apenas HTTPS permitido"

### Teste 2.3: IP Privado classe A - 10.x.x.x (deve bloquear)

```
http://localhost:3000/dashboard?avatarUrl=https://10.0.0.1/admin
```

**Resultado esperado**: Erro "IP privado na primeira resolução"

### Teste 2.4: IP Privado classe C - 192.168.x.x (deve bloquear)

```
http://localhost:3000/dashboard?avatarUrl=https://192.168.1.1/admin
```

**Resultado esperado**: Bloqueado pelo SSRF Guard.

### Teste 2.5: Localhost/Loopback (deve bloquear)

```
http://localhost:3000/dashboard?avatarUrl=https://127.0.0.1:3000/api/secret
```

**Resultado esperado**: Bloqueado pelo SSRF Guard.

### Teste 2.6: AWS Metadata Endpoint (deve bloquear)

```
http://localhost:3000/dashboard?avatarUrl=http://169.254.169.254/latest/meta-data/
```

**Resultado esperado**: Bloqueado - primeiro pela verificação HTTPS, depois pelo IP privado se fosse HTTPS.

### Teste 2.7: IP Privado classe B - 172.16-31.x.x (deve bloquear)

```
http://localhost:3000/dashboard?avatarUrl=https://172.16.0.1/internal
```

**Resultado esperado**: Bloqueado pelo SSRF Guard.

### Verificar logs do servidor

No terminal onde o servidor está rodando, você verá logs como:
```
Error: IP privado na primeira resolução
```

---

## 3. Testando Server Actions Hardened

### O que estamos protegendo?
Server Actions que nunca lançam `throw`, sempre retornam objetos estruturados com `id` para auditoria.

### Teste 3.1: Verificar resposta da Server Action

Na página principal, você vê o resultado da `getAccountBalance`:
```json
{
  "success": true,
  "data": {
    "balance": 50000,
    "currency": "BRL"
  }
}
```

### Teste 3.2: Testar via Console do Browser

Abra o Console e execute:

```javascript
// Importar a action (em desenvolvimento)
const { transferFunds } = await import('/app/actions/transfer');

// Teste com dados válidos
const result = await transferFunds({ 
  amount: 1000, 
  toAccount: 'ACC-123456' 
});
console.log(result);
```

**Resultado esperado** (sucesso):
```json
{
  "success": true,
  "data": {
    "transactionId": "TXN-...",
    "amount": 1000,
    "toAccount": "ACC-123456",
    "timestamp": "..."
  }
}
```

### Teste 3.3: Testar validação Zod (dados inválidos)

```javascript
// Conta com formato inválido
const result = await transferFunds({ 
  amount: 1000, 
  toAccount: 'INVALID' 
});
console.log(result);
```

**Resultado esperado**:
```json
{
  "success": false,
  "error": "bad_input",
  "id": "uuid-para-auditoria"
}
```

### Teste 3.4: Testar valor negativo

```javascript
const result = await transferFunds({ 
  amount: -100, 
  toAccount: 'ACC-123456' 
});
```

**Resultado esperado**: `{ success: false, error: "bad_input", id: "..." }`

### Teste 3.5: Testar valor acima do limite

```javascript
const result = await transferFunds({ 
  amount: 2000000, // 2 milhões (limite é 1 milhão)
  toAccount: 'ACC-123456' 
});
```

**Resultado esperado**: `{ success: false, error: "bad_input", id: "..." }`

### Verificar logs do servidor

No terminal, você verá logs detalhados:
```
[transferFunds] Validação falhou { userId: '...', errors: [...] }
```

O cliente recebe erro genérico, mas o servidor tem todos os detalhes para debugging.

---

## 4. Testando Security Headers

### Teste 4.1: Verificar todos os headers

Use curl para ver os headers:

```bash
curl -I http://localhost:3000
```

**Headers esperados**:
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-...'...
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

### Teste 4.2: Verificar que X-Powered-By foi removido

```bash
curl -I http://localhost:3000 | grep -i "x-powered-by"
```

**Resultado esperado**: Nenhum resultado (header removido).

### Teste 4.3: Testar proteção contra Clickjacking

1. Crie um arquivo HTML local:
```html
<!DOCTYPE html>
<html>
<body>
  <h1>Tentativa de Clickjacking</h1>
  <iframe src="http://localhost:3000" width="800" height="600"></iframe>
</body>
</html>
```

2. Abra no browser
3. **Resultado esperado**: O iframe não carrega devido ao `X-Frame-Options: DENY`

---

## 5. Teste de Integração Completo

### Cenário: Atacante tenta explorar a aplicação

1. **XSS via query string**: 
   ```
   http://localhost:3000?name=<script>alert(1)</script>
   ```
   ✅ Bloqueado pelo CSP

2. **SSRF via avatar**:
   ```
   http://localhost:3000/dashboard?avatarUrl=http://169.254.169.254/latest/meta-data/iam/security-credentials/
   ```
   ✅ Bloqueado pelo safeFetch

3. **Server Action com payload malicioso**:
   ```javascript
   transferFunds({ amount: "'; DROP TABLE users; --", toAccount: 'ACC-123456' })
   ```
   ✅ Bloqueado pelo Zod (amount deve ser number)

---

## 6. Checklist de Segurança

### CSP
- [ ] Scripts inline sem nonce são bloqueados
- [ ] Scripts externos não autorizados são bloqueados
- [ ] Nonce muda a cada requisição (verificar no header)
- [ ] Violações de CSP aparecem no Console

### SSRF Guard
- [ ] IPs 10.x.x.x bloqueados
- [ ] IPs 172.16-31.x.x bloqueados
- [ ] IPs 192.168.x.x bloqueados
- [ ] 127.0.0.1 bloqueado
- [ ] 169.254.169.254 (AWS metadata) bloqueado
- [ ] Timeout de 3 segundos funciona

### Server Actions
- [ ] Retorna objeto `{ success, error?, id?, data? }`
- [ ] Nunca lança exceção para o cliente
- [ ] Validação Zod funciona
- [ ] Logs detalhados no servidor
- [ ] Erros genéricos para o cliente

### Headers
- [ ] CSP presente
- [ ] X-Frame-Options: DENY
- [ ] X-Content-Type-Options: nosniff
- [ ] Referrer-Policy configurado
- [ ] X-Powered-By removido

---

## 7. Ferramentas Recomendadas para Testes

### Online
- [Security Headers](https://securityheaders.com) - Analisa headers de segurança
- [CSP Evaluator](https://csp-evaluator.withgoogle.com) - Valida sua CSP

### CLI
```bash
# Testar headers
curl -I https://seu-dominio.com

# Testar CSP
npx is-website-vulnerable https://seu-dominio.com
```

### Browser Extensions
- [CSP Evaluator](https://chrome.google.com/webstore/detail/csp-evaluator) - Chrome
- [Laboratory](https://addons.mozilla.org/firefox/addon/laboratory-by-mozilla/) - Firefox

---

## 8. Próximos Passos

Após validar todos os testes, considere:

1. **Adicionar testes automatizados** com Playwright/Cypress
2. **Configurar CI/CD** para rodar testes de segurança
3. **Implementar rate limiting real** com Redis
4. **Adicionar autenticação real** com next-auth
5. **Monitorar violações de CSP** em produção via `report-uri`

---

## Conclusão

Se todos os testes passaram, sua aplicação Next.js está protegida contra:

- ✅ XSS (Cross-Site Scripting) via CSP
- ✅ SSRF (Server-Side Request Forgery) via safeFetch
- ✅ DNS Rebinding via validação de socket
- ✅ Clickjacking via X-Frame-Options
- ✅ Information Disclosure via remoção de headers
- ✅ Inconsistent Error Handling via Server Actions estruturadas

**Segurança é um processo contínuo. Mantenha as dependências atualizadas e revise periodicamente.**
