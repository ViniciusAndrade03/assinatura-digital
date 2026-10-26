import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import Layout from '../components/Layout';
import ExpenseTable from '../components/ExpenseTable';
import { useAuth, REVIEWERS } from '../lib/useAuth';
import { api } from '../lib/api';

/** Baixa o pacote de assinatura (.json) para verificação independente/offline. */
export async function downloadPackage(expense) {
  const pkg = await api(`/expenses/${expense.id}/signature-package`);
  const url = URL.createObjectURL(new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `assinatura-${expense.id}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** signedExpenses.js — documentos assinados, para verificação do Gerente. */
export default function SignedExpenses() {
  const user = useAuth(REVIEWERS);
  const [list, setList] = useState(null);

  useEffect(() => {
    if (user) api('/expenses?scope=all&status=ASSINADO').then((d) => setList(d.expenses));
  }, [user]);

  return (
    <Layout user={user} title="Documentos assinados">
      <ExpenseTable
        expenses={list}
        empty="Nenhum documento assinado ainda."
        actions={(e) => (
          <>
            <Button size="small" variant="contained" component={Link} href={`/verifySignature/?id=${e.id}`} className="mr-1">Verificar</Button>
            <Button size="small" startIcon={<DownloadIcon />} onClick={() => downloadPackage(e)}>.json</Button>
          </>
        )}
      />
    </Layout>
  );
}
