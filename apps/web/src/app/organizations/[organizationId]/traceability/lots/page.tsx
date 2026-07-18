import { LotWorkspace } from '@/components/traceability/lot-workspace';
export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <LotWorkspace organizationId={organizationId} />;
}
