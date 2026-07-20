import { FinancePayments } from '@/components/finance-workspace';

export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <FinancePayments organizationId={organizationId} />;
}
