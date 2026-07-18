import { BatchWorkspace } from '@/components/traceability/batch-workspace';
export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <BatchWorkspace organizationId={organizationId} />;
}
