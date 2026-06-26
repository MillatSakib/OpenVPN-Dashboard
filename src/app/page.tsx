import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';

export default function Home() {
  const cookieStore = cookies();
  const token = cookieStore.get('token')?.value;

  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      if (payload.role === 'admin') redirect('/admin');
      else redirect('/dashboard');
    }
  }

  redirect('/login');
}
