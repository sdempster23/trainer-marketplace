// CI runs `tsc --noEmit` without a prior `next build`, and next-env.d.ts
// (which normally pulls these in) is gitignored per Next's default. This
// committed reference gives static image imports (.jpg/.png/...) their
// module declarations everywhere, including cold CI checkouts.
/// <reference types="next/image-types/global" />
