import { useRouter } from 'next/router';
import type { GetServerSideProps } from 'next';
import RequestPage from '../request';

export default function RequestWithEthAddress() {
  const router = useRouter();
  const { 'eth-address': ethAddress } = router.query as { 'eth-address'?: string };
  return <RequestPage prefilledAddress={ethAddress || ''} />;
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const countryHeader = (ctx.req.headers['x-vercel-ip-country'] as string) || '';
  const country = countryHeader.toUpperCase();
  const isNorthAmerica = country === 'US' || country === 'CA';
  return { props: { isNorthAmerica } };
};
