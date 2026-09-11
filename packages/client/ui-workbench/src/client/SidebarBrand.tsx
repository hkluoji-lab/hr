/**
 * Deployment branding occupants for the sidebar shell's two `single` brand
 * slots. The logo tile draws the design's pink-gradient rounded square with
 * the white stacked-layers mark, in both the expanded brand row and the
 * collapsed rail; the wordmark occupant renders 星躍智 plus the red 秘 badge.
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-sidebar's SlotMap merge (the two brand seats).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { NS } from './locales.ts'
import css from './SidebarBrand.module.css'

/** Full props of the logo-tile occupant. */
export type SidebarBrandMarkProps =
  & PropsRuntime<'sidebar.brand.mark'>
  & PropsLocale<typeof NS>

/**
 * Render the pink logo tile with the white stacked-layers mark.
 * @param props - the shell's requested square edge and the translate seat.
 * @returns the tile at the requested size.
 */
export function SidebarBrandMark({ size, t }: SidebarBrandMarkProps) {
  const glyph = Math.round(size * 0.62)
  return (
    <span
      className={css.mark}
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(6, Math.round(size * 0.28)),
      }}
      role="img"
      aria-label={t('brand.name')}
    >
      <svg
        className={css.markGlyph}
        viewBox="0 0 24 24"
        width={glyph}
        height={glyph}
        fill="none"
        stroke="#ffffff"
        strokeWidth={2.4}
        strokeLinejoin="round"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M12 3.5 20.5 8 12 12.5 3.5 8Z" fill="#ffffff" />
        <path d="m5 12.4 7 3.8 7-3.8" />
        <path d="m5 16.8 7 3.7 7-3.7" />
      </svg>
    </span>
  )
}

/** Full props of the wordmark occupant (the shell passes no owner share). */
export type SidebarBrandNameProps =
  & PropsRuntime<'sidebar.brand.name'>
  & PropsLocale<typeof NS>

/**
 * Render the 星躍智 wordmark with the red 秘 badge.
 * @param props - the translate seat.
 * @returns the wordmark row.
 */
export function SidebarBrandName({ t }: SidebarBrandNameProps) {
  return (
    <span className={css.name}>
      <span className={css.wordmark}>{t('brand.name')}</span>
      <span className={css.badge} aria-hidden="true">{t('brand.badge')}</span>
    </span>
  )
}
