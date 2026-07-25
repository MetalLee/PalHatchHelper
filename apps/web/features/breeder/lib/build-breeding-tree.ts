import type {
  BreedingRoute,
  BreedingRouteViewParent,
  BreedingRouteViewStep,
} from "@palhatch/contracts";

export interface BreedingTreePassiveFact {
  rank: number | null;
  isNegative: boolean | null;
}

export interface BreedingTreePassive {
  passiveId: string;
  rank: number | null;
  isNegative: boolean | null;
}

export type BreedingTreeEntityKind =
  | "inventory"
  | "intermediate"
  | "missing"
  | "target"
  | "existing_target";

export interface BreedingTreeEntity {
  id: string;
  kind: BreedingTreeEntityKind;
  palId: string;
  instanceUid: string | null;
  ownerDisplayName: string;
  gender: BreedingRouteViewParent["gender"];
  passiveSkillIds: string[];
  passives: BreedingTreePassive[];
  requiredPassiveIds: string[];
  requiredPassives: BreedingTreePassive[];
  borrowed: boolean;
  producedByStepIndex: number | null;
  locationType: BreedingRouteViewParent["location_type"];
  locationName: string | null;
  generation: number;
  recipeType: BreedingRouteViewStep["recipe_type"] | null;
  isTarget: boolean;
  existingTargetInstanceUid: string | null;
}

export type BreedingTreeOccurrenceRole = "parent_a" | "parent_b" | "child";

export interface BreedingTreeOccurrence {
  id: string;
  entityId: string;
  layer: number;
  stepIndex: number | null;
  role: BreedingTreeOccurrenceRole;
  requiredPassiveIds: string[];
}

export interface BreedingTreeEdge {
  id: string;
  fromOccurrenceId: string;
  toOccurrenceId: string;
  stepIndex: number;
  parentSide: "a" | "b";
  recipeType: BreedingRouteViewStep["recipe_type"];
  requiredPassiveIds: string[];
}

export interface BreedingTreeParentLink {
  side: "a" | "b";
  entityId: string;
  occurrenceId: string;
  sourceType: BreedingRouteViewParent["source_type"];
  requiredPassiveIds: string[];
}

export interface BreedingTreeStep {
  stepIndex: number;
  generation: number;
  recipeType: BreedingRouteViewStep["recipe_type"];
  parentA: BreedingTreeParentLink;
  parentB: BreedingTreeParentLink;
  parentAOccurrenceId: string;
  parentBOccurrenceId: string;
  childEntityId: string;
  childOccurrenceId: string;
  requiredPassiveIds: string[];
}

export interface BreedingTreeLayer {
  generation: number;
  occurrenceIds: string[];
}

export interface BreedingTreeModel {
  empty: boolean;
  emptyReason: "no_route" | "route_without_steps" | null;
  entities: BreedingTreeEntity[];
  occurrences: BreedingTreeOccurrence[];
  edges: BreedingTreeEdge[];
  steps: BreedingTreeStep[];
  layers: BreedingTreeLayer[];
  targetOccurrenceId: string | null;
  feasibilityStatus: BreedingRoute["feasibility_status"] | null;
  adoptable: boolean;
  hasMissing: boolean;
}

export interface BuildBreedingTreeOptions {
  passiveFacts?: ReadonlyMap<string, BreedingTreePassiveFact>;
  targetPalId?: string;
}

export class BreedingTreeBuildError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "BreedingTreeBuildError";
  }
}

const emptyModel: BreedingTreeModel = {
  empty: true,
  emptyReason: "no_route",
  entities: [],
  occurrences: [],
  edges: [],
  steps: [],
  layers: [],
  targetOccurrenceId: null,
  feasibilityStatus: null,
  adoptable: false,
  hasMissing: false,
};

export function buildBreedingTree(
  route: BreedingRoute | null | undefined,
  options: BuildBreedingTreeOptions = {},
): BreedingTreeModel {
  if (route === null || route === undefined) return emptyModel;

  const sortedSteps = [...route.steps].sort(
    (left, right) => left.step_index - right.step_index,
  );
  assertUniqueStepIndexes(sortedSteps);

  if (sortedSteps.length === 0) {
    return buildRouteWithoutSteps(route, options);
  }

  const entities = new Map<string, BreedingTreeEntity>();
  const occurrences = new Map<string, BreedingTreeOccurrence>();
  const steps: BreedingTreeStep[] = [];
  const edges: BreedingTreeEdge[] = [];
  const finalStepIndex = sortedSteps.at(-1)!.step_index;

  for (const step of sortedSteps) {
    const parentA = resolveParent(
      step.parent_a,
      "a",
      step,
      entities,
      occurrences,
      options.passiveFacts,
    );
    const parentB = resolveParent(
      step.parent_b,
      "b",
      step,
      entities,
      occurrences,
      options.passiveFacts,
    );
    const isTarget = step.step_index === finalStepIndex;
    const childEntityId = `step:${step.step_index}:child`;
    const childOccurrenceId = `occurrence:${childEntityId}`;
    const childEntity: BreedingTreeEntity = {
      id: childEntityId,
      kind: isTarget ? "target" : "intermediate",
      palId: step.child_pal_id,
      instanceUid: null,
      ownerDisplayName: isTarget
        ? "本路线最终目标"
        : `步骤 ${step.step_index + 1} 中间产物`,
      gender: step.child_required_gender,
      passiveSkillIds: [...step.required_passive_ids],
      passives: toPassives(step.required_passive_ids, options.passiveFacts),
      requiredPassiveIds: [...step.required_passive_ids],
      requiredPassives: toPassives(
        step.required_passive_ids,
        options.passiveFacts,
      ),
      borrowed: false,
      producedByStepIndex: step.step_index,
      locationType: null,
      locationName: null,
      generation: step.generation,
      recipeType: step.recipe_type,
      isTarget,
      existingTargetInstanceUid: isTarget
        ? route.existing_target_instance_uid
        : null,
    };
    entities.set(childEntityId, childEntity);
    occurrences.set(childOccurrenceId, {
      id: childOccurrenceId,
      entityId: childEntityId,
      layer: step.generation,
      stepIndex: step.step_index,
      role: "child",
      requiredPassiveIds: [...step.required_passive_ids],
    });

    const stepModel: BreedingTreeStep = {
      stepIndex: step.step_index,
      generation: step.generation,
      recipeType: step.recipe_type,
      parentA,
      parentB,
      parentAOccurrenceId: parentA.occurrenceId,
      parentBOccurrenceId: parentB.occurrenceId,
      childEntityId,
      childOccurrenceId,
      requiredPassiveIds: [...step.required_passive_ids],
    };
    steps.push(stepModel);
    edges.push(
      edgeFor(parentA, childOccurrenceId, step),
      edgeFor(parentB, childOccurrenceId, step),
    );
  }

  const occurrenceList = [...occurrences.values()].sort(compareOccurrences);
  return {
    empty: false,
    emptyReason: null,
    entities: [...entities.values()],
    occurrences: occurrenceList,
    edges,
    steps,
    layers: groupLayers(occurrenceList),
    targetOccurrenceId: `occurrence:step:${finalStepIndex}:child`,
    feasibilityStatus: route.feasibility_status,
    adoptable: route.adoptable,
    hasMissing:
      route.feasibility_status === "needs_inventory" ||
      route.missing_pal_count > 0 ||
      [...entities.values()].some((entity) => entity.kind === "missing"),
  };
}

function buildRouteWithoutSteps(
  route: BreedingRoute,
  options: BuildBreedingTreeOptions,
): BreedingTreeModel {
  const instanceUid = route.existing_target_instance_uid;
  const targetPalId = options.targetPalId;
  if (instanceUid === null || targetPalId === undefined) {
    return {
      ...emptyModel,
      emptyReason: "route_without_steps",
      feasibilityStatus: route.feasibility_status,
      adoptable: route.adoptable,
      hasMissing:
        route.feasibility_status === "needs_inventory" ||
        route.missing_pal_count > 0,
    };
  }

  const entityId = `inventory:${instanceUid}`;
  const occurrenceId = `occurrence:existing-target:${instanceUid}`;
  return {
    empty: false,
    emptyReason: null,
    entities: [
      {
        id: entityId,
        kind: "existing_target",
        palId: targetPalId,
        instanceUid,
        ownerDisplayName: "当前库存中的目标实例",
        gender: null,
        passiveSkillIds: [],
        passives: [],
        requiredPassiveIds: [],
        requiredPassives: [],
        borrowed: false,
        producedByStepIndex: null,
        locationType: null,
        locationName: null,
        generation: 0,
        recipeType: null,
        isTarget: true,
        existingTargetInstanceUid: instanceUid,
      },
    ],
    occurrences: [
      {
        id: occurrenceId,
        entityId,
        layer: 0,
        stepIndex: null,
        role: "child",
        requiredPassiveIds: [],
      },
    ],
    edges: [],
    steps: [],
    layers: [{ generation: 0, occurrenceIds: [occurrenceId] }],
    targetOccurrenceId: occurrenceId,
    feasibilityStatus: route.feasibility_status,
    adoptable: route.adoptable,
    hasMissing:
      route.feasibility_status === "needs_inventory" ||
      route.missing_pal_count > 0,
  };
}

function resolveParent(
  parent: BreedingRouteViewParent,
  side: "a" | "b",
  step: BreedingRouteViewStep,
  entities: Map<string, BreedingTreeEntity>,
  occurrences: Map<string, BreedingTreeOccurrence>,
  passiveFacts: ReadonlyMap<string, BreedingTreePassiveFact> | undefined,
): BreedingTreeParentLink {
  if (parent.source_type === "intermediate") {
    const producedBy = parent.produced_by_step_index;
    if (producedBy === null || producedBy >= step.step_index) {
      throw new BreedingTreeBuildError("INVALID_INTERMEDIATE_REFERENCE");
    }
    const entityId = `step:${producedBy}:child`;
    const occurrenceId = `occurrence:${entityId}`;
    const entity = entities.get(entityId);
    const occurrence = occurrences.get(occurrenceId);
    if (
      entity === undefined ||
      occurrence === undefined ||
      entity.palId !== parent.pal_id ||
      entity.generation >= step.generation
    ) {
      throw new BreedingTreeBuildError("INVALID_INTERMEDIATE_REFERENCE");
    }
    return {
      side,
      entityId,
      occurrenceId,
      sourceType: parent.source_type,
      requiredPassiveIds: [...parent.required_passive_ids],
    };
  }

  if (parent.source_type === "inventory") {
    if (parent.instance_uid === null) {
      throw new BreedingTreeBuildError("INVENTORY_INSTANCE_UID_REQUIRED");
    }
    const entityId = `inventory:${parent.instance_uid}`;
    const existing = entities.get(entityId);
    if (existing !== undefined && existing.palId !== parent.pal_id) {
      throw new BreedingTreeBuildError("INCONSISTENT_INVENTORY_ENTITY");
    }
    if (existing === undefined) {
      entities.set(entityId, {
        id: entityId,
        kind: "inventory",
        palId: parent.pal_id,
        instanceUid: parent.instance_uid,
        ownerDisplayName: parent.owner_display_name,
        gender: parent.gender,
        passiveSkillIds: [...parent.passive_skill_ids],
        passives: toPassives(parent.passive_skill_ids, passiveFacts),
        requiredPassiveIds: [],
        requiredPassives: [],
        borrowed: parent.borrowed,
        producedByStepIndex: null,
        locationType: parent.location_type,
        locationName: parent.location_name,
        generation: Math.max(0, step.generation - 1),
        recipeType: null,
        isTarget: false,
        existingTargetInstanceUid: null,
      });
    }
    const occurrenceId = `occurrence:${step.step_index}:${side}:inventory:${parent.instance_uid}`;
    occurrences.set(occurrenceId, {
      id: occurrenceId,
      entityId,
      layer: Math.max(0, step.generation - 1),
      stepIndex: step.step_index,
      role: side === "a" ? "parent_a" : "parent_b",
      requiredPassiveIds: [...parent.required_passive_ids],
    });
    return {
      side,
      entityId,
      occurrenceId,
      sourceType: parent.source_type,
      requiredPassiveIds: [...parent.required_passive_ids],
    };
  }

  const entityId = `missing:${step.step_index}:${side}`;
  const occurrenceId = `occurrence:${step.step_index}:${side}:missing`;
  entities.set(entityId, {
    id: entityId,
    kind: "missing",
    palId: parent.pal_id,
    instanceUid: null,
    ownerDisplayName: parent.owner_display_name,
    gender: parent.gender,
    passiveSkillIds: [],
    passives: [],
    requiredPassiveIds: [...parent.required_passive_ids],
    requiredPassives: toPassives(parent.required_passive_ids, passiveFacts),
    borrowed: false,
    producedByStepIndex: null,
    locationType: null,
    locationName: null,
    generation: Math.max(0, step.generation - 1),
    recipeType: null,
    isTarget: false,
    existingTargetInstanceUid: null,
  });
  occurrences.set(occurrenceId, {
    id: occurrenceId,
    entityId,
    layer: Math.max(0, step.generation - 1),
    stepIndex: step.step_index,
    role: side === "a" ? "parent_a" : "parent_b",
    requiredPassiveIds: [...parent.required_passive_ids],
  });
  return {
    side,
    entityId,
    occurrenceId,
    sourceType: parent.source_type,
    requiredPassiveIds: [...parent.required_passive_ids],
  };
}

function edgeFor(
  parent: BreedingTreeParentLink,
  childOccurrenceId: string,
  step: BreedingRouteViewStep,
): BreedingTreeEdge {
  return {
    id: `edge:${step.step_index}:${parent.side}`,
    fromOccurrenceId: parent.occurrenceId,
    toOccurrenceId: childOccurrenceId,
    stepIndex: step.step_index,
    parentSide: parent.side,
    recipeType: step.recipe_type,
    requiredPassiveIds: [...parent.requiredPassiveIds],
  };
}

function toPassives(
  ids: readonly string[],
  passiveFacts: ReadonlyMap<string, BreedingTreePassiveFact> | undefined,
): BreedingTreePassive[] {
  return ids.map((passiveId) => {
    const fact = passiveFacts?.get(passiveId);
    return {
      passiveId,
      rank: fact?.rank ?? null,
      isNegative: fact?.isNegative ?? null,
    };
  });
}

function assertUniqueStepIndexes(
  steps: readonly BreedingRouteViewStep[],
): void {
  const indexes = new Set<number>();
  for (const step of steps) {
    if (indexes.has(step.step_index)) {
      throw new BreedingTreeBuildError("DUPLICATE_STEP_INDEX");
    }
    indexes.add(step.step_index);
  }
}

function compareOccurrences(
  left: BreedingTreeOccurrence,
  right: BreedingTreeOccurrence,
): number {
  if (left.layer !== right.layer) return left.layer - right.layer;
  if ((left.stepIndex ?? -1) !== (right.stepIndex ?? -1)) {
    return (left.stepIndex ?? -1) - (right.stepIndex ?? -1);
  }
  const roleOrder: Record<BreedingTreeOccurrenceRole, number> = {
    parent_a: 0,
    parent_b: 1,
    child: 2,
  };
  if (roleOrder[left.role] !== roleOrder[right.role]) {
    return roleOrder[left.role] - roleOrder[right.role];
  }
  return left.id.localeCompare(right.id, "en");
}

function groupLayers(
  occurrences: readonly BreedingTreeOccurrence[],
): BreedingTreeLayer[] {
  const layers = new Map<number, string[]>();
  for (const occurrence of occurrences) {
    const ids = layers.get(occurrence.layer) ?? [];
    ids.push(occurrence.id);
    layers.set(occurrence.layer, ids);
  }
  return [...layers.entries()]
    .sort(([left], [right]) => left - right)
    .map(([generation, occurrenceIds]) => ({
      generation,
      occurrenceIds,
    }));
}
