import { FarmDetailView } from '@/components/farm-detail';
export default async function Page({
  params,
}: {
  params: Promise<{ organizationId: string; farmerId: string; farmId: string }>;
}) {
  return <FarmDetailView {...await params} />;
}
