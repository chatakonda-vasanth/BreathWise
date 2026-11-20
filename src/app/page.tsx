import { connection } from 'next/server';
import { AppShell } from '@/components/app-shell';

export default async function HomePage() {
  await connection();
  return <AppShell />;
}
