import { ContractDetailView } from '@/components/marketplace-actions';
export default async function Page({
  params,
}: {
  params: Promise<{ organizationId: string; contractId: string }>;
}) {
  return <ContractDetailView {...await params} />;
}
