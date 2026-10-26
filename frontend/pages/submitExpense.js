import { useState } from 'react';
import { useRouter } from 'next/router';
import { Card, CardContent, TextField, MenuItem, Button, Alert, Box, Typography, List, ListItem, ListItemText, InputAdornment } from '@mui/material';
import UploadIcon from '@mui/icons-material/UploadFile';
import Layout from '../components/Layout';
import { useAuth } from '../lib/useAuth';
import { api } from '../lib/api';
import { fileSha256 } from '../lib/signing';
import { CATEGORIES, short } from '../lib/format';

const MAX = 5 * 1024 * 1024;
const TYPES = ['application/pdf', 'image/png', 'image/jpeg'];

/** submitExpense.js — cadastro de relatório de despesa com upload de recibos. */
export default function SubmitExpense() {
  const user = useAuth();
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ title: '', category: 'transporte', amount: '', expenseDate: today, description: '' });
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function pick(e) {
    setError('');
    const list = [...e.target.files].slice(0, 5);
    const bad = list.find((f) => !TYPES.includes(f.type) || f.size > MAX);
    if (bad) {
      setError(`"${bad.name}": use PDF, PNG ou JPG de até 5 MB`);
      return;
    }
    // Hash calculado no navegador — o mesmo valor será registrado pelo servidor e entrará no documento assinado
    setFiles(await Promise.all(list.map(async (f) => ({ file: f, sha256: await fileSha256(f) }))));
  }

  async function submit(e) {
    e.preventDefault();
    if (!files.length) return setError('Anexe pelo menos um recibo');
    setBusy(true);
    setError('');
    const fd = new FormData();
    // aceita "1.234,56", "1234,56" ou "1234.56"
    const amount = form.amount.includes(',') ? form.amount.replace(/\./g, '').replace(',', '.') : form.amount;
    Object.entries({ ...form, amount }).forEach(([k, v]) => fd.append(k, v));
    files.forEach(({ file }) => fd.append('receipts', file, file.name));
    try {
      await api('/expenses', { method: 'POST', form: fd });
      router.push('/dashboard/');
    } catch (err) {
      setError(err.data?.details?.map((d) => `${d.campo}: ${d.mensagem}`).join(' · ') || err.message);
      setBusy(false);
    }
  }

  return (
    <Layout user={user} title="Novo relatório de despesa">
      <Card variant="outlined" className="max-w-3xl">
        <CardContent>
          <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {error && <Alert severity="error" className="sm:col-span-2">{error}</Alert>}
            <TextField label="Título" required inputProps={{ maxLength: 120 }} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="sm:col-span-2" />
            <TextField select label="Categoria" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {Object.entries(CATEGORIES).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
            </TextField>
            <TextField
              label="Valor"
              required
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^\d.,]/g, '') })}
              InputProps={{ startAdornment: <InputAdornment position="start">R$</InputAdornment> }}
              inputProps={{ inputMode: 'decimal' }}
            />
            <TextField label="Data da despesa" type="date" required value={form.expenseDate} inputProps={{ max: today }} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} InputLabelProps={{ shrink: true }} />
            <TextField label="Descrição / justificativa" multiline minRows={3} inputProps={{ maxLength: 2000 }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="sm:col-span-2" />
            <Box className="sm:col-span-2">
              <Button component="label" variant="outlined" startIcon={<UploadIcon />}>
                Anexar recibos (PDF, PNG, JPG — até 5)
                <input hidden type="file" multiple accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={pick} />
              </Button>
              {files.length > 0 && (
                <List dense>
                  {files.map(({ file, sha256 }) => (
                    <ListItem key={file.name}>
                      <ListItemText primary={`${file.name} (${(file.size / 1024).toFixed(0)} KB)`} secondary={<span className="mono">SHA-256: {short(sha256, 24)}</span>} />
                    </ListItem>
                  ))}
                </List>
              )}
            </Box>
            <Box className="sm:col-span-2">
              <Typography variant="body2" color="text.secondary" className="mb-2">
                Ao enviar, os aprovadores recebem uma notificação por e-mail.
              </Typography>
              <Button type="submit" variant="contained" disabled={busy}>{busy ? 'Enviando…' : 'Enviar relatório'}</Button>
            </Box>
          </form>
        </CardContent>
      </Card>
    </Layout>
  );
}
