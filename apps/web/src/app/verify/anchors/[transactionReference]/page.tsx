import { PublicAnchor } from '@/components/public-anchor';
export default async function Page({
  params,
}: {
  params: Promise<{ transactionReference: string }>;
}) {
  return <PublicAnchor {...await params} />;
}
