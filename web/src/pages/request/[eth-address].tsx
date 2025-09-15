import { useRouter } from 'next/router';
import RequestPage from '../request';

export default function RequestWithEthAddress() {
  const router = useRouter();
  const { 'eth-address': ethAddress } = router.query as { 'eth-address'?: string };
  return <RequestPage prefilledAddress={ethAddress || ''} />;
}
