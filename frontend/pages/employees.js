import { useEffect, useState } from 'react';
import {
  Button, Table, TableHead, TableBody, TableRow, TableCell, Box, Chip, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem, Alert, FormControlLabel, Switch, Tooltip, Snackbar,
} from '@mui/material';
import AddIcon from '@mui/icons-material/PersonAdd';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import Layout from '../components/Layout';
import { useAuth } from '../lib/useAuth';
import { api } from '../lib/api';
import { ROLES } from '../lib/format';

const EMPTY = { name: '', email: '', role: 'colaborador', department: '', position: '', password: '', active: true };

/** employees.js — CRUD de funcionários (somente gerente). */
export default function Employees() {
  const user = useAuth(['gerente']);
  const [users, setUsers] = useState(null);
  const [edit, setEdit] = useState(null); // null = fechado; {} = novo; {id..} = edição
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [toDelete, setToDelete] = useState(null);
  const [toast, setToast] = useState('');

  const load = () => api('/users').then((d) => setUsers(d.users));
  useEffect(() => {
    if (user) load();
  }, [user]);

  function openForm(u) {
    setError('');
    setEdit(u || {});
    setForm(u ? { ...EMPTY, ...u, password: '' } : EMPTY);
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    const body = { name: form.name, email: form.email, role: form.role, department: form.department, position: form.position };
    try {
      if (edit.id) {
        await api(`/users/${edit.id}`, { method: 'PUT', body: { ...body, active: form.active, password: form.password || '' } });
        setToast('Funcionário atualizado');
      } else {
        await api('/users', { method: 'POST', body: { ...body, password: form.password } });
        setToast('Funcionário cadastrado (e-mail de boas-vindas enviado)');
      }
      setEdit(null);
      load();
    } catch (err) {
      setError(err.data?.details?.map((d) => `${d.campo}: ${d.mensagem}`).join(' · ') || err.message);
    }
  }

  async function remove() {
    try {
      const r = await api(`/users/${toDelete.id}`, { method: 'DELETE' });
      setToast(r.message || 'Funcionário excluído');
      load();
    } catch (err) {
      setToast(err.message);
    }
    setToDelete(null);
  }

  return (
    <Layout user={user} title="Funcionários">
      <Button variant="contained" startIcon={<AddIcon />} onClick={() => openForm()} className="mb-4">Novo funcionário</Button>
      <Box className="overflow-x-auto rounded border bg-white">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Nome</TableCell><TableCell>E-mail</TableCell><TableCell>Perfil</TableCell>
              <TableCell>Departamento</TableCell><TableCell>Situação</TableCell><TableCell align="right">Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(users || []).map((u) => (
              <TableRow key={u.id} hover>
                <TableCell>{u.name}<div className="text-xs text-gray-500">{u.position}</div></TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>{ROLES[u.role]}{u.hasSigningKey && <Chip size="small" label="chave" className="ml-1" />}</TableCell>
                <TableCell>{u.department}</TableCell>
                <TableCell><Chip size="small" label={u.active ? 'Ativo' : 'Inativo'} color={u.active ? 'success' : 'default'} /></TableCell>
                <TableCell align="right" className="whitespace-nowrap">
                  <Tooltip title="Editar"><IconButton onClick={() => openForm(u)}><EditIcon /></IconButton></Tooltip>
                  <Tooltip title="Excluir"><span><IconButton disabled={u.id === user?.id} onClick={() => setToDelete(u)}><DeleteIcon /></IconButton></span></Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>

      <Dialog open={!!edit} onClose={() => setEdit(null)} fullWidth maxWidth="sm">
        <form onSubmit={save}>
          <DialogTitle>{edit?.id ? 'Editar funcionário' : 'Novo funcionário'}</DialogTitle>
          <DialogContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {error && <Alert severity="error" className="sm:col-span-2">{error}</Alert>}
            <TextField label="Nome" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} margin="dense" />
            <TextField label="E-mail" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} margin="dense" />
            <TextField select label="Perfil" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {Object.entries(ROLES).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
            </TextField>
            <TextField label="Departamento" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            <TextField label="Cargo" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
            <TextField
              label={edit?.id ? 'Nova senha (opcional)' : 'Senha provisória'}
              type="password"
              required={!edit?.id}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              helperText="Mín. 8 caracteres com letras e números"
              autoComplete="new-password"
            />
            {edit?.id && <FormControlLabel control={<Switch checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />} label="Ativo" />}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEdit(null)}>Cancelar</Button>
            <Button type="submit" variant="contained">Salvar</Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={!!toDelete} onClose={() => setToDelete(null)}>
        <DialogTitle>Excluir {toDelete?.name}?</DialogTitle>
        <DialogContent>Se o funcionário tiver relatórios ou assinaturas, ele será apenas desativado para preservar o histórico.</DialogContent>
        <DialogActions>
          <Button onClick={() => setToDelete(null)}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={remove}>Excluir</Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast('')} message={toast} />
    </Layout>
  );
}
