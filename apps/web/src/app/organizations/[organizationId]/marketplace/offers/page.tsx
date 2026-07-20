import { MarketplaceOffers } from '@/components/marketplace-workspace';

export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <MarketplaceOffers organizationId={organizationId} />;
}
