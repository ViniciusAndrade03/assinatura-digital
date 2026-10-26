import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Card, CardContent, TextField, Button, Alert, Box, Typography, LinearProgress } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import Layout from '../components/Layout';
import ExpenseDetails from '../components/ExpenseDetails';
import ExpenseTable from '../components/ExpenseTable';
import { useAuth, REVIEWERS } from '../lib/useAuth';
import { api } from '../lib/api';

/** validateExpense.js — visualizar o documento (dados + recibos) e validar ou rejeitar. */
export default function ValidateExpense() {
  const user = useAuth(REVIEWERS);
  const router = useRouter();
  const { id } = router.query;
  const [expense, setExpense] = useState(null);
  const [list, setList] = useState(null);
  const [comment, setComment] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || !router.isReady) return;
    if (id) api(`/expenses/${id}`).then((d) => setExpense(d.expense)).catch((e) => setMsg({ type: 'error', text: e.message }));
    else api('/expenses?scope=all&status=PENDENTE').then((d) => setList(d.expenses));
  }, [user, router.isReady, id]);

  async function decide(approved) {
    setBusy(true);
    setMsg(null);
    try {
      const d = await api(`/expenses/${id}/validate`, { method: 'POST', body: { approved, comment } });
      setExpense(d.expense);
      setMsg({ type: 'success', text: approved ? 'Relatório validado. Ele já está disponível para assinatura digital.' : 'Relatório rejeitado. O colaborador foi notificado por e-mail.' });
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  }

  if (router.isReady && !id) {
    return (
      <Layout user={user} title="Validar documentos">
        <ExpenseTable
          expenses={list}
          empty="Nenhum relatório aguardando validação."
          actions={(e) => <Button size="small" variant="contained" component={Link} href={`/validateExpense/?id=${e.id}`}>Abrir</Button>}
        />
      </Layout>
    );
  }

  const own = expense && expense.employee.id === user?.id;

  return (
    <Layout user={user} title="Validar documento">
      {msg && <Alert severity={msg.type} className="mb-4">{msg.text}</Alert>}
      {!expense ? <LinearProgress /> : (
        <Box className="flex max-w-4xl flex-col gap-4">
          <ExpenseDetails expense={expense} />
          {expense.status === 'PENDENTE' && !own && (
            <Card variant="outlined">
              <CardContent className="flex flex-col gap-3">
                <Typography variant="subtitle1">Parecer da validação</Typography>
                <Typography variant="body2" color="text.secondary">Confira os recibos (o botão “Abrir” também confere o hash SHA-256 do arquivo) antes de decidir.</Typography>
                <TextField label="Comentário (obrigatório para rejeitar)" multiline minRows={2} value={comment} onChange={(e) => setComment(e.target.value)} inputProps={{ maxLength: 1000 }} />
                <Box className="flex flex-wrap gap-2">
                  <Button variant="contained" color="success" startIcon={<CheckIcon />} disabled={busy} onClick={() => decide(true)}>Validar</Button>
                  <Button variant="outlined" color="error" startIcon={<CloseIcon />} disabled={busy} onClick={() => decide(false)}>Rejeitar</Button>
                </Box>
              </CardContent>
            </Card>
          )}
          {own && expense.status === 'PENDENTE' && <Alert severity="warning">Segregação de funções: você não pode validar o seu próprio relatório.</Alert>}
          {expense.status === 'VALIDADO' && !own && (
            <Button variant="contained" component={Link} href={`/signExpense/?id=${expense.id}`} className="self-start">Ir para assinatura digital</Button>
          )}
        </Box>
      )}
    </Layout>
  );
}
