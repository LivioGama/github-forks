import OpenGraphImage from "./opengraph-image";

// Twitter `summary_large_image` uses the same 1200x630 frame as Open Graph,
// so we render the OG image generator. Config values must be statically
// declared here — Next.js's metadata-route compiler can't follow
// `export { ... } from "./..."` for `runtime`/`size`/etc.

export const runtime = "edge";
export const alt = "GitHub Fork Intelligence — Find Meaningful Forks";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default OpenGraphImage;
