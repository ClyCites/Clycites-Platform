import { VerificationWorkspace } from '@/components/traceability/verification-workspace';

export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <VerificationWorkspace organizationId={organizationId} />;
}
