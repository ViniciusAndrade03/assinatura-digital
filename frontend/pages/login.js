import { useState } from 'react';
import { useRouter } from 'next/router';
import { Box, Card, CardContent, TextField, Button, Typography, Alert, InputAdornment, IconButton } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { login } from '../lib/api';

/**
 * login.js — autenticação. A senha trafega somente por HTTPS e é comparada no servidor
 * com o hash bcrypt (custo 12) armazenado; a senha em si nunca é gravada.
 * Após o login a API devolve um JWT (expira em 1 h) e um token CSRF.
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace('/dashboard/');
    } catch (err) {
      setError(err.message || 'Falha no login');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box className="flex min-h-screen items-center justify-center bg-gradient-to-br from-catolica to-catolica-dark p-4">
      <Card className="w-full max-w-sm" elevation={6}>
        <CardContent className="p-6">
          <Box className="mb-4 flex flex-col items-center">
            <Box className="mb-2 rounded-full bg-catolica p-3 text-white"><LockIcon /></Box>
            <Typography variant="h5" className="font-semibold">Assinatura Digital</Typography>
            <Typography variant="body2" color="text.secondary">Relatórios de despesa</Typography>
          </Box>
          {router.query.expirada && <Alert severity="info" className="mb-3">Sua sessão expirou. Entre novamente.</Alert>}
          {error && <Alert severity="error" className="mb-3">{error}</Alert>}
          <form onSubmit={submit} className="flex flex-col gap-3">
            <TextField label="E-mail" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth />
            <TextField
              label="Senha"
              type={show ? 'text' : 'password'}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              fullWidth
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShow(!show)} edge="end" aria-label="mostrar senha">
                      {show ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Button type="submit" variant="contained" size="large" disabled={loading}>
              {loading ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>
          <Typography variant="caption" color="text.secondary" className="mt-4 block text-center">
            Conexão protegida por HTTPS · senhas armazenadas com hash bcrypt
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
