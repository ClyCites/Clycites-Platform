import { TransformationWorkspace } from '@/components/traceability/transformation-workspace';
export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <TransformationWorkspace organizationId={organizationId} />;
}
