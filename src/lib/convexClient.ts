import { ConvexHttpClient } from 'convex/browser';

const convexUrl = import.meta.env.VITE_CONVEX_URL;

if (!convexUrl) {
  // eslint-disable-next-line no-console
  console.warn('Missing VITE_CONVEX_URL. Convex calls will fail until configured.');
}

let client: ConvexHttpClient | null = null;

export const hasConvexUrl = Boolean(convexUrl);

export const getConvexClient = () => {
  if (!convexUrl) {
    throw new Error('Missing VITE_CONVEX_URL. Convex calls will fail until configured.');
  }
  if (!client) {
    client = new ConvexHttpClient(convexUrl);
  }
  return client;
};
