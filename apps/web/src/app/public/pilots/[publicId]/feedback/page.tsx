import { PublicPilotFeedback } from '@/components/pilot-registers';
export default async function Page({ params }: { params: Promise<{ publicId: string }> }) {
  return <PublicPilotFeedback {...await params} />;
}
