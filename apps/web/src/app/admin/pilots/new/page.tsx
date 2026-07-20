import type { Metadata } from 'next';
import { NewPilotForm } from '@/components/pilots-workspace';
export const metadata: Metadata = { title: 'Create pilot' };
export default function Page() {
  return <NewPilotForm />;
}
