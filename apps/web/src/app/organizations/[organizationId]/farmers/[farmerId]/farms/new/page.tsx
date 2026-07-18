import { NewFarm } from '@/components/farmers-workspace';
export default async function Page({
  params,
}: {
  params: Promise<{ organizationId: string; farmerId: string }>;
}) {
  const { organizationId, farmerId } = await params;
  return <NewFarm organizationId={organizationId} farmerId={farmerId} />;
}
