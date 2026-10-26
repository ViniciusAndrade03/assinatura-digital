import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { session } from '../lib/api';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace(session.token ? '/dashboard/' : '/login/');
  }, [router]);
  return null;
}
