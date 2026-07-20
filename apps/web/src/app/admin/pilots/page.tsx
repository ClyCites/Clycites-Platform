import type { Metadata } from 'next';
import { PilotsAdmin } from '@/components/pilots-workspace';
export const metadata: Metadata = { title: 'Controlled pilots' };
export default function Page() {
  return <PilotsAdmin />;
}
