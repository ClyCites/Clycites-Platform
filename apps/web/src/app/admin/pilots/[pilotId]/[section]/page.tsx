import { PilotWorkspace } from '@/components/pilots-workspace';
export default async function Page({
  params,
}: {
  params: Promise<{ pilotId: string; section: string }>;
}) {
  const { pilotId, section } = await params;
  return <PilotWorkspace pilotId={pilotId} section={section} />;
}
