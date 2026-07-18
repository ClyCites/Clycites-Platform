import { OrganizationAdminDetail } from '@/components/organizations-admin';
export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <OrganizationAdminDetail organizationId={organizationId} />;
}
