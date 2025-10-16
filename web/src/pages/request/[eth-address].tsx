import { useRouter } from 'next/router';
import type { GetServerSideProps } from 'next';
import RequestPage from '../request';

type RequestWithEthAddressProps = {
  isNorthAmerica: boolean;
};

export default function RequestWithEthAddress({ isNorthAmerica }: RequestWithEthAddressProps) {
  const router = useRouter();
  const { 'eth-address': ethAddress } = router.query as { 'eth-address'?: string };
  return <RequestPage prefilledAddress={ethAddress || ''} isNorthAmerica={isNorthAmerica} />;
}

export const getServerSideProps: GetServerSideProps<RequestWithEthAddressProps> = async (ctx) => {
  const countryHeader = (ctx.req.headers['x-vercel-ip-country'] as string) || '';
  const country = countryHeader.toUpperCase();
  const isNorthAmerica = country === 'US' || country === 'CA';
  return { props: { isNorthAmerica } };
};
