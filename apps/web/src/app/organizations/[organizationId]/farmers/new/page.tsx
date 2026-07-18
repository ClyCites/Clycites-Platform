import { NewFarmer } from '@/components/farmers-workspace';
export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <NewFarmer organizationId={organizationId} />;
}
