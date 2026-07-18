import { DevicesView } from '@/components/configuration-operations';
export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <DevicesView organizationId={organizationId} />;
}
