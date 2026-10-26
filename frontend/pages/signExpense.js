import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  Card, CardContent, TextField, Button, Alert, Box, Typography, LinearProgress, Accordion,
  AccordionSummary, AccordionDetails, Stepper, Step, StepLabel,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DrawIcon from '@mui/icons-material/Draw';
import Layout from '../components/Layout';
import ExpenseDetails from '../components/ExpenseDetails';
import ExpenseTable from '../components/ExpenseTable';
import SigningKeyCard from '../components/SigningKeyCard';
import { useAuth, REVIEWERS } from '../lib/useAuth';
import { api } from '../lib/api';
import { unlockPrivateKey, signDocument, sha256Hex } from '../lib/signing';
import { dateTimeBR } from '../lib/format';

/**
 * signExpense.js — assinatura digital do documento.
 * 1) servidor entrega o documento canônico; 2) navegador confere o SHA-256;
 * 3) PIN abre a chave privada (Web Crypto); 4) assinatura ECDSA P-256/SHA-256;
 * 5) servidor verifica (Node crypto), aplica carimbo de tempo e notifica por e-mail.
 */
export default function SignExpense() {
  const user = useAuth(REVIEWERS);
  const router = useRouter();
  const { id } = router.query;
  const [expense, setExpense] = useState(null);
  const [list, setList] = useState(null);
  const [key, setKey] = useState(null);
  const [payload, setPayload] = useState(null);
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!user || !router.isReady) return;
    if (id) api(`/expenses/${id}`).then((d) => setExpense(d.expense)).catch((e) => setMsg({ type: 'error', text: e.message }));
    else api('/expenses?scope=all&status=VALIDADO').then((d) => setList(d.expenses));
  }, [user, router.isReady, id]);

  useEffect(() => {
    if (!key || !expense || expense.status !== 'VALIDADO') return;
    api(`/expenses/${id}/sign-payload`)
      .then(async (p) => {
        const localHash = await sha256Hex(p.canonical);
        if (localHash !== p.documentHash) throw new Error('Hash do documento não confere — assinatura bloqueada');
        setPayload(p);
      })
      .catch((e) => setMsg({ type: 'error', text: e.message }));
  }, [key, expense, id]);

  async function sign(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const privateKey = await unlockPrivateKey(key, pin);
      const signature = await signDocument(privateKey, payload.canonical);
      const r = await api(`/expenses/${id}/sign`, {
        method: 'POST',
        body: { signature, documentHash: payload.documentHash, keyFingerprint: payload.keyFingerprint },
      });
      setExpense(r.expense);
      setResult({ ...r.signature, signature });
      setPin('');
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  if (router.isReady && !id) {
    return (
      <Layout user={user} title="Assinar documentos">
        <ExpenseTable
          expenses={list}
          empty="Nenhum relatório validado aguardando assinatura."
          actions={(e) => (e.employee.id === user?.id
            ? <span className="text-xs text-gray-500">próprio relatório</span>
            : <Button size="small" variant="contained" component={Link} href={`/signExpense/?id=${e.id}`}>Assinar</Button>)}
        />
      </Layout>
    );
  }

  const step = result ? 3 : payload ? 2 : key ? 1 : 0;

  return (
    <Layout user={user} title="Assinatura digital">
      {msg && <Alert severity={msg.type} className="mb-4">{msg.text}</Alert>}
      {!expense ? <LinearProgress /> : (
        <Box className="flex max-w-4xl flex-col gap-4">
          <Stepper activeStep={step} alternativeLabel className="hidden sm:flex">
            {['Chave de assinatura', 'Documento conferido', 'Assinar com PIN', 'Assinado'].map((l) => <Step key={l}><StepLabel>{l}</StepLabel></Step>)}
          </Stepper>

          <ExpenseDetails expense={expense} />

          {expense.status === 'ASSINADO' && (
            <Alert severity="success">
              Documento assinado digitalmente.
              {result && <> Hash SHA-256: <span className="mono">{result.documentHash}</span> — {dateTimeBR(result.signedAt)}</>}
              <Box className="mt-2"><Button size="small" variant="outlined" component={Link} href={`/verifySignature/?id=${expense.id}`}>Verificar assinatura</Button></Box>
            </Alert>
          )}
          {expense.status !== 'VALIDADO' && expense.status !== 'ASSINADO' && (
            <Alert severity="warning">Somente relatórios VALIDADOS podem ser assinados.</Alert>
          )}

          {expense.status === 'VALIDADO' && (
            <>
              <SigningKeyCard onReady={setKey} />
              {payload && (
                <Card variant="outlined">
                  <CardContent className="flex flex-col gap-3">
                    <Typography variant="h6">Documento a ser assinado</Typography>
                    <Typography variant="body2">SHA-256 (conferido no navegador): <span className="mono">{payload.documentHash}</span></Typography>
                    <Accordion variant="outlined">
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>Ver conteúdo exato que será assinado (JSON canônico)</AccordionSummary>
                      <AccordionDetails>
                        <pre className="mono max-h-80 overflow-auto whitespace-pre-wrap rounded bg-gray-100 p-2 text-xs">{JSON.stringify(JSON.parse(payload.canonical), null, 2)}</pre>
                      </AccordionDetails>
                    </Accordion>
                    <form onSubmit={sign} className="flex flex-col gap-3 sm:flex-row sm:items-start">
                      <TextField label="PIN de assinatura" type="password" required value={pin} onChange={(e) => setPin(e.target.value)} autoComplete="off" />
                      <Button type="submit" variant="contained" size="large" startIcon={<DrawIcon />} disabled={busy}>
                        {busy ? 'Assinando…' : 'Assinar digitalmente'}
                      </Button>
                    </form>
                    <Typography variant="caption" color="text.secondary">
                      Ao assinar, você declara concordância com o conteúdo acima (assinatura eletrônica avançada — Lei 14.063/2020, art. 4º, II).
                    </Typography>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </Box>
      )}
    </Layout>
  );
}
