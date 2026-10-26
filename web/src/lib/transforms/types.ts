import type { GraphBuilder } from "../graph";
import type { Entity, EntityType, Finding } from "../types";

export interface TransformContext {
  graph: GraphBuilder;
  signal: AbortSignal;
  finding: (f: Omit<Finding, "id"> & { id?: string }) => void;
}

export interface Transform {
  id: string;
  label: string;
  accepts: EntityType[];
  /** Maximum times this transform may run in a single investigation. */
  budget: number;
  run(entity: Entity, ctx: TransformContext): Promise<void>;
}
