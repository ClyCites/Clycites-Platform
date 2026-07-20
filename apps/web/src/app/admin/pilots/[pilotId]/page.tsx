import { PilotWorkspace } from '@/components/pilots-workspace';
export default async function Page({ params }: { params: Promise<{ pilotId: string }> }) {
  const { pilotId } = await params;
  return <PilotWorkspace pilotId={pilotId} />;
}
