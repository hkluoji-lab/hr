/**
 * Session-wide produced-file vocabulary, published as a Cordis service so
 * other browser surfaces consume the mutation policy without a cross-plugin
 * value import. The chat turn-tail row answers per turn; this answers for a
 * whole Session event window.
 */
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'

/** One produced file as a session-wide list surface renders it. */
export interface ProducedFileEntry {
  /** Workspace-relative or absolute path, as the successful mutation carried it. */
  readonly path: string
  /** Final path segment (`/` and `\\` aware), for the row's visible label. */
  readonly name: string
}

/**
 * Optional Session deliverables provider. Absent when the deliverables plugin
 * is composed out; consumers treat that as "this surface contributes nothing".
 */
export interface SessionDeliverables {
  /**
   * Fold one Session's durable events into its produced files.
   * @param events - durable session events in log order (transient rows dropped by the caller).
   * @returns produced files, unique and first-seen ordered; empty when nothing was produced.
   */
  produced(events: readonly SessionEvent[]): readonly ProducedFileEntry[]
}
