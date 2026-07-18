import { CollectionPoints } from '@/components/organization-workspace';
export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <CollectionPoints organizationId={organizationId} />;
}
