import { PublicCooperative } from '@/components/public-cooperative';
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <PublicCooperative {...await params} />;
}
