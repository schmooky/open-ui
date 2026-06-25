/**
 * Turns a declarative PanelSpec into a PanelControl plus one Control per leaf
 * block (resolved through the registry, so blocks are swappable too — Charter P7).
 * Pure assembly: it instantiates and returns; action wiring + registration is the
 * caller's job (createUI / OpenUIPixi), so buildPanel stays leak-free and testable.
 */
import { PanelControl } from '../controls/PanelControl';
import type { Control } from '../control/Control';
import type { EventBus } from '../events';
import type { OpenUIEvents } from '../types';
import type { BlockSpec, PanelSpec, BuiltPanel } from './types';
import { ControlRegistry } from '../registry/ControlRegistry';

/** Resolve a block tree to its flat leaf controls, in render order. text/group carry none. */
export function buildBlocks(
  blocks: BlockSpec[],
  bus: EventBus<OpenUIEvents>,
  registry: ControlRegistry = ControlRegistry.defaults(),
  /** If a block id already resolves to a control (e.g. a built-in like 'music'),
   *  reuse it instead of building a shadow copy that would overwrite it. */
  reuse?: (id: string) => Control | undefined,
): Control[] {
  const controls: Control[] = [];
  const walk = (bs: BlockSpec[]): void => {
    for (const b of bs) {
      if (b.kind === 'group') {
        walk(b.children);
        continue;
      }
      if (b.kind === 'text') continue;
      const existing = reuse?.(b.id);
      if (existing) {
        controls.push(existing);
        continue;
      }
      const c = registry.resolve(b, bus);
      if (c) controls.push(c);
    }
  };
  walk(blocks);
  return controls;
}

export function buildPanel(
  spec: PanelSpec,
  bus: EventBus<OpenUIEvents>,
  registry: ControlRegistry = ControlRegistry.defaults(),
): BuiltPanel {
  const panel = new PanelControl(
    { id: spec.id, variant: spec.variant, title: spec.title, layout: spec.layout },
    bus,
  );
  const controls = buildBlocks(spec.blocks, bus, registry);
  return { panel, controls, blocks: spec.blocks };
}

/** Flatten a block tree to its button blocks (used to wire panel actions). */
export function buttonBlocks(blocks: BlockSpec[]): Array<Extract<BlockSpec, { kind: 'button' }>> {
  const out: Array<Extract<BlockSpec, { kind: 'button' }>> = [];
  const walk = (bs: BlockSpec[]): void => {
    for (const b of bs) {
      if (b.kind === 'button') out.push(b);
      else if (b.kind === 'group') walk(b.children);
    }
  };
  walk(blocks);
  return out;
}
