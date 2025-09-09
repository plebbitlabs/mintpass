import { useRouter } from 'next/router';
import RequestPage from '../request';

export default function RequestWithAddress() {
  const router = useRouter();
  const { address } = router.query as { address?: string };
  return <RequestPage prefilledAddress={address || ''} />;
}
