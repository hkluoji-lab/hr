# Agent Note: Assistant collaboration mode rides the model-written workflow

Status: implemented

English | [中文](2026-09-11-assistant-collaboration-workflow-mode.zh.md)

## Problem

The company-team design implies automatic cross-role orchestration — the secretary takes a brief, dispatches the accountant, legal, and audit roles, and consolidates their results. Nothing in the product did that: cross-role work meant the user opening one session per preset by hand, or a session's model choosing delegation on its own. The workbench's task assistant could start exactly one preset per brief.

## Decision

Collaboration mode is a client-side first-message template, not new orchestration machinery. The assistant page grows a switch; when it is on, the page hides the member picker, resolves the AI secretary's preset from the role roster, and submits the brief through the existing `assignTask` path with a locale-owned template prepended. The template instructs the secretary to compose one workflow script through `tool-workflow` — a triage `agent()` that splits the brief into three work orders, `parallel()` accountant/legal/audit `agent()` calls whose prompts carry the triaged order plus the role instruction, an audit-review `agent()` over the three results, and a `return` of a JSON summary.

Role instructions live in the prompt text, not in a persona option: the workflow runtime's `agent()` accepts only `label/phase/schema/provider/model` and rejects unknown keys, so injecting personas would mean threading the subagent persona capability through the worker protocol. Because the four role presets are compositionally identical except their persona prefix, prompt-carried instructions deliver the same behavior. The `label`s keep the right rail's progress tab readable, and the secretary preset already mounts `workflow-worker-thread` + `tool-workflow`, so no preset or engine changes ship.

## Alternatives considered

**Persona option on workflow `agent()`.** The subagent service has a persona capability, but the workflow engine never passes it: the worker host starts children with prompt/parent/signal/outputSchema/provider/model only. Plumbing it through would touch the worker runtime, its host, and the provider contract — an engine change for a deployment-level want, rejected to keep the harness core untouched.

**A dedicated orchestrator preset.** A fifth preset with an orchestration persona would duplicate the four existing compositions and still need the template text delivered somehow. The secretary preset already owns "receive a brief, route work", so the mode rides it.

**Host-side multi-session orchestration.** The workbench host could start one session per preset and poll projections to chain them — true per-role sessions, but a new storage domain, wait/cancel machinery, and more UI. Rejected for this iteration; the workflow run keeps every role inside one traceable session.

## Consequences

Subagent personas come from prompt text, so a child that ignores instructions has no persona backstop. The progress tab shows workflow children by label, and the workflow's JSON summary lands in the session as the tool result. The template is locale-owned copy and follows the dictionary, so both languages must stay behaviorally identical when edited.
