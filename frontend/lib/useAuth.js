import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { api, session } from './api';

/**
 * Protege a página: exige login e (opcionalmente) um dos papéis informados.
 * O controle real de acesso é feito na API; aqui é só para a navegação.
 */
export function useAuth(roles) {
  const router = useRouter();
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (!session.token) {
      router.replace('/login/');
      return;
    }
    api('/auth/me')
      .then(({ user: u }) => {
        session.save({ user: u });
        if (roles && !roles.includes(u.role)) router.replace('/dashboard/?negado=1');
        else setUser(u);
      })
      .catch(() => router.replace('/login/'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return user;
}

export const REVIEWERS = ['aprovador', 'gerente'];
