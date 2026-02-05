'use client';

import { useState } from 'react';
import { transferFunds } from '../actions/transfer';
import { AlertTriangle, CheckCircle, Play } from 'lucide-react';

interface TestCase {
  name: string;
  payload: unknown;
  expected: string;
}

const testCases: TestCase[] = [
  {
    name: 'Valor negativo',
    payload: { amount: -100, toAccount: 'ACC-123456' },
    expected: 'bad_input',
  },
  {
    name: 'Conta inválida',
    payload: { amount: 1000, toAccount: 'invalid' },
    expected: 'bad_input',
  },
  {
    name: 'Valor acima do limite',
    payload: { amount: 2000000, toAccount: 'ACC-123456' },
    expected: 'bad_input',
  },
  {
    name: 'Saldo insuficiente',
    payload: { amount: 100000, toAccount: 'ACC-123456' },
    expected: 'insufficient_funds',
  },
  {
    name: 'Transferência válida',
    payload: { amount: 1000, toAccount: 'ACC-123456', description: 'Teste' },
    expected: 'success',
  },
];

export function TransferTester() {
  const [results, setResults] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState<string | null>(null);

  async function runTest(testCase: TestCase) {
    setLoading(testCase.name);
    try {
      const result = await transferFunds(testCase.payload);
      setResults(prev => ({ ...prev, [testCase.name]: result }));
    } catch (error) {
      setResults(prev => ({ 
        ...prev, 
        [testCase.name]: { error: 'Exception thrown', details: String(error) } 
      }));
    }
    setLoading(null);
  }

  async function runAllTests() {
    for (const testCase of testCases) {
      await runTest(testCase);
    }
  }

  return (
    <div className="transfer-tester">
      <div className="tester-header">
        <h3>Testador de Server Actions</h3>
        <button onClick={runAllTests} className="btn-run-all">
          <Play size={16} />
          Executar Todos
        </button>
      </div>

      <div className="test-cases">
        {testCases.map((testCase) => {
          const result = results[testCase.name] as { success?: boolean; error?: string } | undefined;
          const passed = result?.success 
            ? testCase.expected === 'success'
            : result?.error === testCase.expected;

          return (
            <div key={testCase.name} className="test-case">
              <div className="test-case-header">
                <div className="test-info">
                  <span className="test-name">{testCase.name}</span>
                  <code className="test-payload">
                    {JSON.stringify(testCase.payload)}
                  </code>
                </div>
                <button 
                  onClick={() => runTest(testCase)}
                  disabled={loading === testCase.name}
                  className="btn-run-test"
                >
                  {loading === testCase.name ? '...' : 'Testar'}
                </button>
              </div>

              {result && (
                <div className={`test-result ${passed ? 'passed' : 'failed'}`}>
                  <div className="result-status">
                    {passed ? (
                      <><CheckCircle size={14} /> Passou</>
                    ) : (
                      <><AlertTriangle size={14} /> Falhou</>
                    )}
                    <span className="expected">
                      (esperado: {testCase.expected})
                    </span>
                  </div>
                  <pre className="result-json">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
