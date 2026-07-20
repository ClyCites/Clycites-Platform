import { MarketplaceListingDetail } from '@/components/marketplace-workspace';

export default async function Page({
  params,
}: {
  params: Promise<{ organizationId: string; listingId: string }>;
}) {
  const { organizationId, listingId } = await params;
  return <MarketplaceListingDetail organizationId={organizationId} listingId={listingId} />;
}
