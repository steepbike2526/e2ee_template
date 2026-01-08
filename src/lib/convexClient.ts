import { ConvexHttpClient } from 'convex/browser';

const convexUrl = import.meta.env.VITE_CONVEX_URL;

if (!convexUrl) {
  // eslint-disable-next-line no-console
  console.warn('Missing VITE_CONVEX_URL. Convex calls will fail until configured.');
}

export const convexClient = new ConvexHttpClient(convexUrl || '');
