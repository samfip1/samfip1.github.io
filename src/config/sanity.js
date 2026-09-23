import { createClient } from '@sanity/client';
import { createImageUrlBuilder } from '@sanity/image-url';

// Sanity CMS is optional. Without VITE_SANITY_PROJECT_ID the app uses the hardcoded content in each room.
const projectId = import.meta.env.VITE_SANITY_PROJECT_ID;

export const sanityClient = projectId ? createClient({
    projectId,
    dataset: 'production',
    useCdn: true,
    apiVersion: '2024-03-01',
}) : null;

const builder = sanityClient && createImageUrlBuilder(sanityClient);

// Funkcja pomocnicza do generowania adresów URL obrazków z Sanity
export const urlFor = (source) => builder.image(source);

// Funkcja pomocnicza do zamiany domeny Sanity na proxy w Cloudflare
export const getProxyUrl = (imageBuilder) => {
    if (!imageBuilder) return null;
    const url = imageBuilder.url();
    if (url && typeof window !== 'undefined') {
        return url.replace('https://cdn.sanity.io', '/sanity-cdn');
    }
    return url;
};
