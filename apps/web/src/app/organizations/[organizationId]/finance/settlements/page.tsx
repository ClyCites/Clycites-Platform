import { FinanceSettlements } from '@/components/finance-workspace';

export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <FinanceSettlements organizationId={organizationId} />;
}
