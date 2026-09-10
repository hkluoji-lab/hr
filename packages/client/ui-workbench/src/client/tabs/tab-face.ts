/**
 * Browser faces for the four workbench tabs: everything they ask the Host for,
 * expressed as injected functions and Hooks so the components stay presenters.
 *
 * The deliverables face folds the current Session's event window through the
 * `sessionDeliverables` Cordis service (the mutation policy stays owned by the
 * ui-deliverables plugin; its absence is the composed-out off state) and
 * memoizes the answer on the window revision. The progress face only forwards
 * navigation; the child list itself comes from the Session list store's
 * standard Hook.
 *
 * The credits and team-status tabs are deployment-wide, not session-owned:
 * both read the workbench controller the hero and the page surface already
 * share, so a tab and a page never hold two answers to the same question.
 */
import { useSyncExternalStore } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session/types'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
// Type-only: the produced-entry type and the optional `sessionDeliverables`
// Context merge; the fold itself is a runtime Cordis service, not an import.
import type { ProducedFileEntry } from '@deepseek-ai/dsh-client-ui-deliverables/client'
import type { LedgerState, WorkbenchController, WorkbenchState } from '../workbench-store.ts'

/** Deliverables body face: reactive produced files of the mounted Session. */
export interface DeliverablesInjected {
  readonly useProducedPaths: () => readonly ProducedFileEntry[]
}

/** Progress body face: navigate to one of the current Session's subtasks. */
export interface ProgressInjected {
  readonly openSession: (id: SessionId) => void
}

/** Credits body face: the deployment balance beside its recent ledger. */
export interface CreditsInjected {
  hooks: {
    /** Balance snapshot bound by the renderer as useWorkbench. */
    workbench: SnapshotStore<WorkbenchState>
    /** Credits-ledger snapshot bound by the renderer as useLedger. */
    ledger: SnapshotStore<LedgerState>
  }
  /** Read the balance and the roster. */
  load: () => Promise<void>
  /** Read the bounded ledger. */
  loadLedger: () => Promise<void>
}

/** Team-status body face: the roster folded against the live Sessions. */
export interface TeamStatusInjected {
  hooks: {
    /** Balance and roster snapshot bound by the renderer as useWorkbench. */
    workbench: SnapshotStore<WorkbenchState>
  }
  /** Read the balance and the roster. */
  load: () => Promise<void>
}

const NO_FILES: readonly ProducedFileEntry[] = Object.freeze([])

interface ProducedCache {
  readonly revision: number
  readonly files: readonly ProducedFileEntry[]
}

/**
 * Build the deliverables tab's session-scoped face.
 * @param ctx - client root context carrying the Session Controller.
 * @returns the slot inject factory, one closure per mounted Session tab.
 */
export function deliverablesFace(
  ctx: ClientContext,
): (sessionId: SessionId) => DeliverablesInjected {
  return (sessionId) => {
    let cache: ProducedCache | null = null
    const source = ctx.sessions.binding(sessionId)?.eventSource
    const subscribe = (listener: () => void): (() => void) =>
      source === undefined ? () => {} : source.subscribe(listener)
    const getFiles = (): readonly ProducedFileEntry[] => {
      if (source === undefined) return NO_FILES
      const window = source.getSnapshot()
      if (cache === null || cache.revision !== window.revision) {
        const events: SessionEvent[] = []
        for (const entry of window.entries) {
          if (entry.type === 'event') events.push(entry.event)
        }
        cache = {
          revision: window.revision,
          files: ctx.get('sessionDeliverables')?.produced(events) ?? NO_FILES,
        }
      }
      return cache.files
    }
    return { useProducedPaths: () => useSyncExternalStore(subscribe, getFiles) }
  }
}

/**
 * Build the progress tab's face; the face ignores the Session key because
 * navigation targets the child id the row carries.
 * @param ctx - client root context carrying the Session Controller.
 * @returns the slot inject factory.
 */
export function progressFace(ctx: ClientContext): () => ProgressInjected {
  return () => ({ openSession: (id) => { ctx.sessions.open(id) } })
}

/**
 * Build the credits tab's face. The tab is deployment-wide, so the session key
 * is ignored; both snapshots belong to the shared controller.
 * @param controller - the workbench data owner.
 * @returns the slot inject factory.
 */
export function creditsFace(controller: WorkbenchController): () => CreditsInjected {
  return () => ({
    hooks: { workbench: controller.store, ledger: controller.ledger },
    load: () => controller.load(),
    loadLedger: () => controller.loadLedger(),
  })
}

/**
 * Build the team-status tab's face. The tab is deployment-wide, so the session
 * key is ignored.
 * @param controller - the workbench data owner.
 * @returns the slot inject factory.
 */
export function teamStatusFace(controller: WorkbenchController): () => TeamStatusInjected {
  return () => ({
    hooks: { workbench: controller.store },
    load: () => controller.load(),
  })
}
