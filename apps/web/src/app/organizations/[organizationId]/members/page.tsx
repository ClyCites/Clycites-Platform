import { OrganizationMembers } from '@/components/organization-workspace';
export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <OrganizationMembers organizationId={organizationId} />;
}
