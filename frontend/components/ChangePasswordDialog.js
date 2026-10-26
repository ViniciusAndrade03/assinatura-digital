import { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Alert } from '@mui/material';
import { api } from '../lib/api';

export default function ChangePasswordDialog({ open, onClose }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [msg, setMsg] = useState(null);

  async function submit(e) {
    e.preventDefault();
    try {
      await api('/auth/change-password', { method: 'POST', body: form });
      setMsg({ type: 'success', text: 'Senha alterada com sucesso.' });
      setForm({ currentPassword: '', newPassword: '' });
    } catch (err) {
      setMsg({ type: 'error', text: err.data?.details?.[0]?.mensagem || err.message });
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <form onSubmit={submit}>
        <DialogTitle>Alterar senha</DialogTitle>
        <DialogContent className="flex flex-col gap-3">
          {msg && <Alert severity={msg.type}>{msg.text}</Alert>}
          <TextField label="Senha atual" type="password" required value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} margin="dense" autoComplete="current-password" />
          <TextField label="Nova senha" type="password" required helperText="Mínimo 8 caracteres, com letras e números" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} autoComplete="new-password" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setMsg(null); onClose(); }}>Fechar</Button>
          <Button type="submit" variant="contained">Salvar</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
