import { FinanceRegisters } from '@/components/finance-registers';
export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <FinanceRegisters organizationId={organizationId} />;
}
