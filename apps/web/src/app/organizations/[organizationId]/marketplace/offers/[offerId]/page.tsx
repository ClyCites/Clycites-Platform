import { OfferDetailView } from '@/components/marketplace-actions';
export default async function Page({
  params,
}: {
  params: Promise<{ organizationId: string; offerId: string }>;
}) {
  return <OfferDetailView {...await params} />;
}
