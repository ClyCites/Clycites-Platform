import { TraceabilityRegisters } from '@/components/traceability/registers';
export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  return <TraceabilityRegisters {...await params} />;
}
