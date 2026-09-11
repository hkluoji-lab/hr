// @vitest-environment jsdom
/**
 * SidebarBrand: the deployment-brand occupants of the sidebar shell's two
 * `single` brand slots. The tile renders at the shell-requested size with the
 * drawn stacked-layers mark and an accessible name; the wordmark renders
 * 星耀智 and the red 秘 badge (decorative, so hidden from the accessibility
 * tree).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import {
  SidebarBrandMark, SidebarBrandName,
  type SidebarBrandMarkProps, type SidebarBrandNameProps,
} from '../src/client/SidebarBrand.tsx'
import { zh } from '../src/client/locales.ts'

const t: SidebarBrandMarkProps['t'] = makeTranslate(zh)

afterEach(() => { cleanup() })

describe('SidebarBrand', () => {
  it('renders the logo tile at the requested edge with the drawn mark', () => {
    render(<SidebarBrandMark {...{ size: 24, t } as unknown as SidebarBrandMarkProps} />)
    const tile = screen.getByRole('img', { name: zh['brand.name'] })
    expect(tile.getAttribute('style')).toContain('width: 24px')
    expect(tile.getAttribute('style')).toContain('height: 24px')
    const glyph = tile.querySelector('svg')
    expect(glyph).toBeTruthy()
    expect(glyph!.getAttribute('width')).toBe('15')
    expect(glyph!.getAttribute('aria-hidden')).toBe('true')
  })

  it('renders the wordmark with the decorative badge', () => {
    render(<SidebarBrandName {...{ t } as unknown as SidebarBrandNameProps} />)
    expect(screen.getByText(zh['brand.name'])).toBeTruthy()
    const badge = screen.getByText(zh['brand.badge'])
    expect(badge.getAttribute('aria-hidden')).toBe('true')
  })
})
