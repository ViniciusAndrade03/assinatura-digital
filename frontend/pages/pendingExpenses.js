import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Tabs, Tab, Button, Box } from '@mui/material';
import Layout from '../components/Layout';
import ExpenseTable from '../components/ExpenseTable';
import { useAuth, REVIEWERS } from '../lib/useAuth';
import { api } from '../lib/api';

/** pendingExpenses.js — documentos pendentes: aguardando validação e aguardando assinatura. */
export default function PendingExpenses() {
  const user = useAuth(REVIEWERS);
  const [tab, setTab] = useState(0);
  const [pending, setPending] = useState(null);
  const [validated, setValidated] = useState(null);

  useEffect(() => {
    if (!user) return;
    api('/expenses?scope=all&status=PENDENTE').then((d) => setPending(d.expenses));
    api('/expenses?scope=all&status=VALIDADO').then((d) => setValidated(d.expenses));
  }, [user]);

  const own = (e) => e.employee.id === user?.id;

  return (
    <Layout user={user} title="Documentos pendentes">
      <Tabs value={tab} onChange={(_, v) => setTab(v)} className="mb-4" variant="scrollable">
        <Tab label={`Aguardando validação (${pending?.length ?? '…'})`} />
        <Tab label={`Aguardando assinatura (${validated?.length ?? '…'})`} />
      </Tabs>
      <Box hidden={tab !== 0}>
        <ExpenseTable
          expenses={pending}
          empty="Nenhum relatório aguardando validação."
          actions={(e) => (own(e)
            ? <span className="text-xs text-gray-500">próprio relatório</span>
            : <Button size="small" variant="contained" component={Link} href={`/validateExpense/?id=${e.id}`}>Validar</Button>)}
        />
      </Box>
      <Box hidden={tab !== 1}>
        <ExpenseTable
          expenses={validated}
          empty="Nenhum relatório aguardando assinatura."
          actions={(e) => (own(e)
            ? <span className="text-xs text-gray-500">próprio relatório</span>
            : <Button size="small" variant="contained" component={Link} href={`/signExpense/?id=${e.id}`}>Assinar</Button>)}
        />
      </Box>
    </Layout>
  );
}
