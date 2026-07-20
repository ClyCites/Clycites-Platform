import { MarketplaceListings } from '@/components/marketplace-workspace';

export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <MarketplaceListings organizationId={organizationId} />;
}
