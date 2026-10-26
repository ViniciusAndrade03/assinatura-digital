import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  Card, CardContent, Button, Alert, Box, Typography, LinearProgress, List, ListItem, ListItemIcon,
  ListItemText, Divider, Table, TableBody, TableRow, TableCell, TableHead, Chip,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import UploadIcon from '@mui/icons-material/UploadFile';
import Layout from '../components/Layout';
import ExpenseTable from '../components/ExpenseTable';
import { useAuth, REVIEWERS } from '../lib/useAuth';
import { api } from '../lib/api';
import { verifyPackage, fileSha256 } from '../lib/signing';
import { brl, dateTimeBR } from '../lib/format';

const LABELS = {
  assinaturaValida: ['Assinatura ECDSA válida', 'Autenticidade: a assinatura confere com a chave pública do signatário'],
  chavePertenceAoSignatario: ['Chave pertence ao signatário', 'A chave pública está registrada no histórico do usuário que assinou'],
  hashDocumentoConfere: ['Integridade dos dados', 'Os dados atuais do relatório geram o mesmo SHA-256 que foi assinado'],
  anexosIntegros: ['Integridade dos recibos', 'O SHA-256 de cada arquivo armazenado confere com o assinado'],
  carimboServidorValido: ['Carimbo de tempo do servidor', 'Data/hora da assinatura atestadas pela chave do servidor (não repúdio)'],
  fingerprintConfere: ['Impressão digital da chave', 'SHA-256 da chave pública confere com o registrado'],
  signatarioConfere: ['Identificação do signatário', 'Dados do signatário dentro do documento assinado conferem'],
};

function Checks({ title, checks }) {
  return (
    <Box>
      <Typography variant="subtitle1" className="font-semibold">{title}</Typography>
      <List dense>
        {Object.entries(checks).map(([k, ok]) => (
          <ListItem key={k}>
            <ListItemIcon>{ok ? <CheckCircleIcon color="success" /> : <CancelIcon color="error" />}</ListItemIcon>
            <ListItemText primary={LABELS[k]?.[0] || k} secondary={LABELS[k]?.[1]} />
          </ListItem>
        ))}
      </List>
    </Box>
  );
}

function Verdict({ valid }) {
  return valid
    ? <Alert severity="success" variant="filled">ASSINATURA VÁLIDA — documento autêntico e íntegro</Alert>
    : <Alert severity="error" variant="filled">ASSINATURA INVÁLIDA — documento adulterado ou assinatura não confere</Alert>;
}

/** Verificação 100% local (Web Crypto) de um pacote .json e, opcionalmente, dos arquivos de recibo. */
function OfflineVerifier() {
  const [res, setRes] = useState(null);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');

  async function loadPkg(e) {
    setError('');
    setRes(null);
    setFiles([]);
    try {
      const pkg = JSON.parse(await e.target.files[0].text());
      setRes(await verifyPackage(pkg));
    } catch {
      setError('Arquivo inválido. Selecione um pacote de assinatura .json gerado pelo sistema.');
    }
  }

  async function loadFiles(e) {
    const known = res?.doc?.recibos || [];
    setFiles(await Promise.all([...e.target.files].map(async (f) => {
      const h = await fileSha256(f);
      return { name: f.name, sha256: h, match: known.find((r) => r.sha256 === h) };
    })));
  }

  return (
    <Card variant="outlined">
      <CardContent className="flex flex-col gap-3">
        <Typography variant="h6">Verificação independente (offline)</Typography>
        <Typography variant="body2" color="text.secondary">
          Selecione um pacote de assinatura (.json). A verificação é feita só no seu navegador com a Web Crypto API, sem depender do servidor.
        </Typography>
        <Button component="label" variant="outlined" startIcon={<UploadIcon />} className="self-start">
          Selecionar pacote .json
          <input hidden type="file" accept="application/json,.json" onChange={loadPkg} />
        </Button>
        {error && <Alert severity="error">{error}</Alert>}
        {res && (
          <>
            <Verdict valid={res.valid} />
            {res.doc && (
              <Typography variant="body2">
                <b>{res.doc.despesa?.titulo}</b> — {brl(res.doc.despesa?.valorCentavos)} — colaborador {res.doc.colaborador?.nome} — assinado por {res.doc.signatario?.nome}
              </Typography>
            )}
            <Checks title="Resultado" checks={res.checks} />
            <Button component="label" variant="outlined" size="small" startIcon={<UploadIcon />} className="self-start">
              Conferir arquivos de recibo
              <input hidden type="file" multiple onChange={loadFiles} />
            </Button>
            {files.map((f) => (
              <Typography key={f.name} variant="body2">
                {f.match ? <CheckCircleIcon color="success" fontSize="small" /> : <CancelIcon color="error" fontSize="small" />} {f.name}:{' '}
                {f.match ? `idêntico ao recibo assinado "${f.match.nome}"` : 'NÃO corresponde a nenhum recibo assinado'}
              </Typography>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** verifySignature.js — o Gerente verifica a autenticidade das assinaturas digitais. */
export default function VerifySignature() {
  const user = useAuth(REVIEWERS);
  const router = useRouter();
  const { id } = router.query;
  const [list, setList] = useState(null);
  const [server, setServer] = useState(null);
  const [local, setLocal] = useState(null);
  const [error, setError] = useState('');

  async function run() {
    setError('');
    setServer(null);
    setLocal(null);
    try {
      const r = await api(`/expenses/${id}/verify`, { method: 'POST' });
      setServer(r);
      setLocal(await verifyPackage(r.package)); // segunda verificação, independente, no navegador
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    if (!user || !router.isReady) return;
    if (id) run();
    else api('/expenses?scope=all&status=ASSINADO').then((d) => setList(d.expenses));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, router.isReady, id]);

  if (router.isReady && !id) {
    return (
      <Layout user={user} title="Verificar assinatura digital">
        <Box className="flex flex-col gap-4">
          <ExpenseTable
            expenses={list}
            empty="Nenhum documento assinado."
            actions={(e) => <Button size="small" variant="contained" component={Link} href={`/verifySignature/?id=${e.id}`}>Verificar</Button>}
          />
          <OfflineVerifier />
        </Box>
      </Layout>
    );
  }

  const pkg = server?.package;
  return (
    <Layout user={user} title="Verificar assinatura digital">
      {error && <Alert severity="error" className="mb-4">{error}</Alert>}
      {!server && !error && <LinearProgress />}
      {server && (
        <Box className="flex max-w-4xl flex-col gap-4">
          <Verdict valid={server.valid && local?.valid} />
          <Card variant="outlined">
            <CardContent>
              <Typography variant="body2"><b>Signatário:</b> {pkg.signatario.nome} ({pkg.signatario.email}) — {pkg.signatario.papel}</Typography>
              <Typography variant="body2"><b>Assinado em:</b> {dateTimeBR(pkg.assinadoEm)} · <b>Algoritmo:</b> {pkg.algoritmo}</Typography>
              <Typography variant="body2" className="mono"><b>SHA-256 assinado:</b> {pkg.documentoSha256}</Typography>
              <Typography variant="body2" className="mono"><b>SHA-256 atual:</b> {server.currentHash}</Typography>
              <Typography variant="body2" className="mono"><b>Chave (fingerprint):</b> {pkg.chaveFingerprint}</Typography>
              <Divider className="my-3" />
              <Box className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <Checks title="Verificação no servidor (Node.js crypto)" checks={server.checks} />
                {local && <Checks title="Verificação no navegador (Web Crypto API)" checks={local.checks} />}
              </Box>
              <Box className="mt-2 flex flex-wrap gap-2">
                <Button variant="outlined" onClick={run}>Verificar novamente</Button>
                <Button component={Link} href={`/validateExpense/?id=${id}`}>Ver relatório e recibos</Button>
              </Box>
            </CardContent>
          </Card>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle1" className="font-semibold">Histórico de verificações</Typography>
              <Box className="overflow-x-auto">
                <Table size="small">
                  <TableHead><TableRow><TableCell>Data</TableCell><TableCell>Verificado por</TableCell><TableCell>Resultado</TableCell></TableRow></TableHead>
                  <TableBody>
                    {[...server.verifications].reverse().map((v, i) => (
                      <TableRow key={i}>
                        <TableCell>{dateTimeBR(v.at)}</TableCell>
                        <TableCell>{v.byName}</TableCell>
                        <TableCell><Chip size="small" color={v.valid ? 'success' : 'error'} label={v.valid ? 'Válida' : 'Inválida'} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </CardContent>
          </Card>
        </Box>
      )}
    </Layout>
  );
}
