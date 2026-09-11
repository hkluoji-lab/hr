/**
 * Deployment branding occupants for the sidebar shell's two `single` brand
 * slots. The pink logo tile replaces the shell's fish fallback in both the
 * expanded brand row and the collapsed rail; the wordmark occupant replaces
 * the generic local-build name with 星耀智 plus the red 秘 badge. Both are
 * text placeholders reproducing the design until brand image assets land.
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
 * Render the pink logo tile with the placeholder 星 glyph.
 * @param props - the shell's requested square edge and the translate seat.
 * @returns the tile at the requested size.
 */
export function SidebarBrandMark({ size, t }: SidebarBrandMarkProps) {
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
      <span
        className={css.markGlyph}
        style={{ fontSize: Math.round(size * 0.58) }}
        aria-hidden="true"
      >
        {t('brand.markGlyph')}
      </span>
    </span>
  )
}

/** Full props of the wordmark occupant (the shell passes no owner share). */
export type SidebarBrandNameProps =
  & PropsRuntime<'sidebar.brand.name'>
  & PropsLocale<typeof NS>

/**
 * Render the 星耀智 wordmark with the red 秘 badge.
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
