import { MarketplaceContracts } from '@/components/marketplace-workspace';

export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <MarketplaceContracts organizationId={organizationId} />;
}
