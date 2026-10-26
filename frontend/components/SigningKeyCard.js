import { useEffect, useState } from 'react';
import { Card, CardContent, Typography, Button, TextField, Alert, Box, Dialog, DialogTitle, DialogContent, DialogActions, LinearProgress } from '@mui/material';
import KeyIcon from '@mui/icons-material/Key';
import { api } from '../lib/api';
import { generateKeyBundle } from '../lib/signing';
import { dateTimeBR, short } from '../lib/format';

/**
 * Geração do par de chaves de assinatura (Web Crypto API, no navegador).
 * A chave privada é cifrada com o PIN antes de sair do navegador.
 */
export default function SigningKeyCard({ onReady }) {
  const [key, setKey] = useState(undefined);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ pin: '', pin2: '', currentPassword: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const { key: k } = await api('/keys/me');
    setKey(k);
    if (k && onReady) onReady(k);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate(e) {
    e.preventDefault();
    setError('');
    if (form.pin.length < 6) return setError('O PIN deve ter pelo menos 6 caracteres');
    if (form.pin !== form.pin2) return setError('Os PINs não conferem');
    setBusy(true);
    try {
      const bundle = await generateKeyBundle(form.pin);
      const { fingerprint, ...payload } = bundle;
      const res = await api('/keys', { method: 'POST', body: { ...payload, currentPassword: form.currentPassword } });
      if (res.fingerprint !== fingerprint) throw new Error('Impressão digital divergente entre navegador e servidor');
      setOpen(false);
      setForm({ pin: '', pin2: '', currentPassword: '' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (key === undefined) return <LinearProgress />;

  return (
    <Card variant="outlined">
      <CardContent>
        <Box className="mb-2 flex items-center gap-2">
          <KeyIcon color="primary" />
          <Typography variant="h6">Minha chave de assinatura</Typography>
        </Box>
        {key ? (
          <>
            <Typography variant="body2">Algoritmo: <b>{key.algorithm}</b></Typography>
            <Typography variant="body2">Criada em: {dateTimeBR(key.createdAt)}</Typography>
            <Typography variant="body2" className="mono">Impressão digital (SHA-256): {short(key.fingerprint, 20)}</Typography>
          </>
        ) : (
          <Alert severity="warning">Você ainda não possui chave de assinatura. Gere uma para poder assinar documentos.</Alert>
        )}
        <Button className="mt-3" variant={key ? 'outlined' : 'contained'} onClick={() => setOpen(true)}>
          {key ? 'Gerar nova chave (revoga a atual)' : 'Gerar chave de assinatura'}
        </Button>
      </CardContent>

      <Dialog open={open} onClose={() => !busy && setOpen(false)} fullWidth maxWidth="xs">
        <form onSubmit={generate}>
          <DialogTitle>Gerar par de chaves ECDSA P-256</DialogTitle>
          <DialogContent className="flex flex-col gap-3">
            <Typography variant="body2" color="text.secondary">
              As chaves são geradas no seu navegador. A chave privada é cifrada (AES-256-GCM) com o PIN e
              só então enviada ao servidor — ninguém, nem o administrador, consegue usá-la sem o seu PIN.
            </Typography>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="PIN de assinatura" type="password" required value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} helperText="Mínimo 6 caracteres. Guarde-o: não há recuperação." autoComplete="new-password" />
            <TextField label="Confirme o PIN" type="password" required value={form.pin2} onChange={(e) => setForm({ ...form, pin2: e.target.value })} autoComplete="new-password" />
            <TextField label="Senha de login (confirmação)" type="password" required value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} autoComplete="current-password" />
            {busy && <LinearProgress />}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpen(false)} disabled={busy}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={busy}>Gerar</Button>
          </DialogActions>
        </form>
      </Dialog>
    </Card>
  );
}
