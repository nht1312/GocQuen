/**
 * Build-time feature flags.
 *
 * `NEXT_PUBLIC_*` values are inlined by Next during `next build`, so these are
 * decided when the bundle is produced, not at run time:
 *
 *   NEXT_PUBLIC_DEMO_MODE=1 npm run build
 */

/**
 * Demo mode hides in-room moderation controls (mute / block / report).
 *
 * They are hidden rather than deleted: SPEC 9 lists client-side mute, block
 * and report as user capabilities, and the server keeps the `moderation_reports`
 * and `user_blocks` tables and endpoints either way. This only removes the
 * per-person menu from the People panel so the screen is quieter while
 * presenting, and nothing can be opened by a stray click.
 */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === '1';

/**
 * Which renderer draws the café: `3d` = React Three Fiber (stylised low-poly,
 * isometric camera), anything else = the original Canvas2D renderer. The 2D
 * one stays the default until the 3D scene reaches feature parity.
 */
export const RENDERER_3D = process.env.NEXT_PUBLIC_RENDERER === '3d';

/**
 * 3D renderer only: use the Kenney Furniture Kit models in
 * /public/models/kenney instead of the built-in low-poly shapes. On by
 * default; `NEXT_PUBLIC_3D_MODELS=0` keeps the procedural furniture.
 */
export const USE_MODELS = process.env.NEXT_PUBLIC_3D_MODELS !== '0';
