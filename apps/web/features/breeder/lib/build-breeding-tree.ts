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
  displayNameOverride: string | null;
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
  locationSlotIndex: number | null;
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
  recipeType: BreedingRouteViewStep["recipe_type"] | null;
  requiredPassiveIds: string[];
}

export interface BreedingTreeParentLink {
  side: "a" | "b";
  entityId: string;
  occurrenceId: string;
  sourceType: BreedingTreeSourceParent["sourceType"];
  requiredPassiveIds: string[];
}

export interface BreedingTreeStep {
  stepIndex: number;
  generation: number;
  recipeType: BreedingRouteViewStep["recipe_type"] | null;
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

export interface BreedingTreeSourceParent {
  sourceType: BreedingRouteViewParent["source_type"];
  palId: string;
  displayNameOverride?: string | null;
  instanceUid: string | null;
  ownerDisplayName: string;
  gender: BreedingRouteViewParent["gender"];
  passiveSkillIds: string[];
  requiredPassiveIds: string[];
  borrowed: boolean;
  producedByStepIndex: number | null;
  locationType: BreedingRouteViewParent["location_type"];
  locationName: string | null;
  locationSlotIndex?: number | null;
}

export interface BreedingTreeSourceStep {
  stepIndex: number;
  generation: number | null;
  recipeType: BreedingRouteViewStep["recipe_type"] | null;
  parentA: BreedingTreeSourceParent;
  parentB: BreedingTreeSourceParent;
  childPalId: string;
  childDisplayName?: string | null;
  childRequiredGender: BreedingRouteViewStep["child_required_gender"];
  requiredPassiveIds: string[];
  selectedChildInstanceUid?: string | null;
  childOwnerDisplayName?: string | null;
  childGender?: BreedingRouteViewParent["gender"];
  childPassiveSkillIds?: string[];
  childLocationType?: BreedingRouteViewParent["location_type"];
  childLocationName?: string | null;
  childLocationSlotIndex?: number | null;
}

export interface BreedingTreeSource {
  steps: BreedingTreeSourceStep[];
  feasibilityStatus: BreedingRoute["feasibility_status"] | null;
  adoptable: boolean;
  hasMissing: boolean;
  existingTargetInstanceUid?: string | null;
}

type ResolvedBreedingTreeSourceStep = Omit<
  BreedingTreeSourceStep,
  "generation"
> & {
  generation: number;
};

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

  if (route.steps.length === 0) {
    return buildRouteWithoutSteps(route, options);
  }

  return buildBreedingTreeFromSource(
    {
      steps: route.steps.map(toSourceStep),
      feasibilityStatus: route.feasibility_status,
      adoptable: route.adoptable,
      hasMissing:
        route.feasibility_status === "needs_inventory" ||
        route.missing_pal_count > 0,
      existingTargetInstanceUid: route.existing_target_instance_uid,
    },
    options,
  );
}

export function buildBreedingTreeFromSource(
  source: BreedingTreeSource,
  options: Pick<BuildBreedingTreeOptions, "passiveFacts"> = {},
): BreedingTreeModel {
  const sortedSteps = [...source.steps].sort(
    (left, right) => left.stepIndex - right.stepIndex,
  );
  assertUniqueStepIndexes(sortedSteps);

  if (sortedSteps.length === 0) {
    return {
      ...emptyModel,
      emptyReason: "route_without_steps",
      feasibilityStatus: source.feasibilityStatus,
      adoptable: source.adoptable,
      hasMissing: source.hasMissing,
    };
  }
  const resolvedSteps = resolveSourceGenerations(sortedSteps);

  const entities = new Map<string, BreedingTreeEntity>();
  const occurrences = new Map<string, BreedingTreeOccurrence>();
  const steps: BreedingTreeStep[] = [];
  const edges: BreedingTreeEdge[] = [];
  const finalStepIndex = resolvedSteps.at(-1)!.stepIndex;

  for (const step of resolvedSteps) {
    const parentA = resolveParent(
      step.parentA,
      "a",
      step,
      entities,
      occurrences,
      options.passiveFacts,
    );
    const parentB = resolveParent(
      step.parentB,
      "b",
      step,
      entities,
      occurrences,
      options.passiveFacts,
    );
    const isTarget = step.stepIndex === finalStepIndex;
    const childEntityId = `step:${step.stepIndex}:child`;
    const childOccurrenceId = `occurrence:${childEntityId}`;
    const childPassiveSkillIds =
      step.childPassiveSkillIds ?? step.requiredPassiveIds;
    const childEntity: BreedingTreeEntity = {
      id: childEntityId,
      kind: isTarget ? "target" : "intermediate",
      palId: step.childPalId,
      displayNameOverride: step.childDisplayName ?? null,
      instanceUid: step.selectedChildInstanceUid ?? null,
      ownerDisplayName:
        step.childOwnerDisplayName ??
        (isTarget ? "本路线最终目标" : `步骤 ${step.stepIndex + 1} 中间产物`),
      gender: step.childGender ?? step.childRequiredGender,
      passiveSkillIds: [...childPassiveSkillIds],
      passives: toPassives(childPassiveSkillIds, options.passiveFacts),
      requiredPassiveIds: [...step.requiredPassiveIds],
      requiredPassives: toPassives(
        step.requiredPassiveIds,
        options.passiveFacts,
      ),
      borrowed: false,
      producedByStepIndex: step.stepIndex,
      locationType: step.childLocationType ?? null,
      locationName: step.childLocationName ?? null,
      locationSlotIndex: step.childLocationSlotIndex ?? null,
      generation: step.generation,
      recipeType: step.recipeType,
      isTarget,
      existingTargetInstanceUid: isTarget
        ? (source.existingTargetInstanceUid ?? null)
        : null,
    };
    entities.set(childEntityId, childEntity);
    occurrences.set(childOccurrenceId, {
      id: childOccurrenceId,
      entityId: childEntityId,
      layer: step.generation,
      stepIndex: step.stepIndex,
      role: "child",
      requiredPassiveIds: [...step.requiredPassiveIds],
    });

    const stepModel: BreedingTreeStep = {
      stepIndex: step.stepIndex,
      generation: step.generation,
      recipeType: step.recipeType,
      parentA,
      parentB,
      parentAOccurrenceId: parentA.occurrenceId,
      parentBOccurrenceId: parentB.occurrenceId,
      childEntityId,
      childOccurrenceId,
      requiredPassiveIds: [...step.requiredPassiveIds],
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
    feasibilityStatus: source.feasibilityStatus,
    adoptable: source.adoptable,
    hasMissing:
      source.hasMissing ||
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
        displayNameOverride: null,
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
        locationSlotIndex: null,
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

function toSourceStep(step: BreedingRouteViewStep): BreedingTreeSourceStep {
  return {
    stepIndex: step.step_index,
    generation: step.generation,
    recipeType: step.recipe_type,
    parentA: toSourceParent(step.parent_a),
    parentB: toSourceParent(step.parent_b),
    childPalId: step.child_pal_id,
    childRequiredGender: step.child_required_gender,
    requiredPassiveIds: [...step.required_passive_ids],
  };
}

function toSourceParent(
  parent: BreedingRouteViewParent,
): BreedingTreeSourceParent {
  return {
    sourceType: parent.source_type,
    palId: parent.pal_id,
    instanceUid: parent.instance_uid,
    ownerDisplayName: parent.owner_display_name,
    gender: parent.gender,
    passiveSkillIds: [...parent.passive_skill_ids],
    requiredPassiveIds: [...parent.required_passive_ids],
    borrowed: parent.borrowed,
    producedByStepIndex: parent.produced_by_step_index,
    locationType: parent.location_type,
    locationName: parent.location_name,
    locationSlotIndex: parent.location_slot_index,
  };
}

function resolveParent(
  parent: BreedingTreeSourceParent,
  side: "a" | "b",
  step: ResolvedBreedingTreeSourceStep,
  entities: Map<string, BreedingTreeEntity>,
  occurrences: Map<string, BreedingTreeOccurrence>,
  passiveFacts: ReadonlyMap<string, BreedingTreePassiveFact> | undefined,
): BreedingTreeParentLink {
  if (parent.sourceType === "intermediate") {
    const producedBy = parent.producedByStepIndex;
    if (producedBy === null || producedBy >= step.stepIndex) {
      throw new BreedingTreeBuildError("INVALID_INTERMEDIATE_REFERENCE");
    }
    const entityId = `step:${producedBy}:child`;
    const occurrenceId = `occurrence:${entityId}`;
    const entity = entities.get(entityId);
    const occurrence = occurrences.get(occurrenceId);
    if (
      entity === undefined ||
      occurrence === undefined ||
      entity.palId !== parent.palId ||
      entity.generation >= step.generation
    ) {
      throw new BreedingTreeBuildError("INVALID_INTERMEDIATE_REFERENCE");
    }
    return {
      side,
      entityId,
      occurrenceId,
      sourceType: parent.sourceType,
      requiredPassiveIds: [...parent.requiredPassiveIds],
    };
  }

  if (parent.sourceType === "inventory") {
    if (parent.instanceUid === null) {
      throw new BreedingTreeBuildError("INVENTORY_INSTANCE_UID_REQUIRED");
    }
    const entityId = `inventory:${parent.instanceUid}`;
    const existing = entities.get(entityId);
    if (existing !== undefined && existing.palId !== parent.palId) {
      throw new BreedingTreeBuildError("INCONSISTENT_INVENTORY_ENTITY");
    }
    if (existing === undefined) {
      entities.set(entityId, {
        id: entityId,
        kind: "inventory",
        palId: parent.palId,
        displayNameOverride: parent.displayNameOverride ?? null,
        instanceUid: parent.instanceUid,
        ownerDisplayName: parent.ownerDisplayName,
        gender: parent.gender,
        passiveSkillIds: [...parent.passiveSkillIds],
        passives: toPassives(parent.passiveSkillIds, passiveFacts),
        requiredPassiveIds: [],
        requiredPassives: [],
        borrowed: parent.borrowed,
        producedByStepIndex: null,
        locationType: parent.locationType,
        locationName: parent.locationName,
        locationSlotIndex: parent.locationSlotIndex ?? null,
        generation: Math.max(0, step.generation - 1),
        recipeType: null,
        isTarget: false,
        existingTargetInstanceUid: null,
      });
    }
    const occurrenceId = `occurrence:${step.stepIndex}:${side}:inventory:${parent.instanceUid}`;
    occurrences.set(occurrenceId, {
      id: occurrenceId,
      entityId,
      layer: Math.max(0, step.generation - 1),
      stepIndex: step.stepIndex,
      role: side === "a" ? "parent_a" : "parent_b",
      requiredPassiveIds: [...parent.requiredPassiveIds],
    });
    return {
      side,
      entityId,
      occurrenceId,
      sourceType: parent.sourceType,
      requiredPassiveIds: [...parent.requiredPassiveIds],
    };
  }

  const entityId = `missing:${step.stepIndex}:${side}`;
  const occurrenceId = `occurrence:${step.stepIndex}:${side}:missing`;
  entities.set(entityId, {
    id: entityId,
    kind: "missing",
    palId: parent.palId,
    displayNameOverride: parent.displayNameOverride ?? null,
    instanceUid: null,
    ownerDisplayName: parent.ownerDisplayName,
    gender: parent.gender,
    passiveSkillIds: [],
    passives: [],
    requiredPassiveIds: [...parent.requiredPassiveIds],
    requiredPassives: toPassives(parent.requiredPassiveIds, passiveFacts),
    borrowed: false,
    producedByStepIndex: null,
    locationType: null,
    locationName: null,
    locationSlotIndex: null,
    generation: Math.max(0, step.generation - 1),
    recipeType: null,
    isTarget: false,
    existingTargetInstanceUid: null,
  });
  occurrences.set(occurrenceId, {
    id: occurrenceId,
    entityId,
    layer: Math.max(0, step.generation - 1),
    stepIndex: step.stepIndex,
    role: side === "a" ? "parent_a" : "parent_b",
    requiredPassiveIds: [...parent.requiredPassiveIds],
  });
  return {
    side,
    entityId,
    occurrenceId,
    sourceType: parent.sourceType,
    requiredPassiveIds: [...parent.requiredPassiveIds],
  };
}

function edgeFor(
  parent: BreedingTreeParentLink,
  childOccurrenceId: string,
  step: ResolvedBreedingTreeSourceStep,
): BreedingTreeEdge {
  return {
    id: `edge:${step.stepIndex}:${parent.side}`,
    fromOccurrenceId: parent.occurrenceId,
    toOccurrenceId: childOccurrenceId,
    stepIndex: step.stepIndex,
    parentSide: parent.side,
    recipeType: step.recipeType,
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
  steps: readonly BreedingTreeSourceStep[],
): void {
  const indexes = new Set<number>();
  for (const step of steps) {
    if (indexes.has(step.stepIndex)) {
      throw new BreedingTreeBuildError("DUPLICATE_STEP_INDEX");
    }
    indexes.add(step.stepIndex);
  }
}

function resolveSourceGenerations(
  steps: readonly BreedingTreeSourceStep[],
): ResolvedBreedingTreeSourceStep[] {
  const generations = new Map<number, number>();
  return steps.map((step) => {
    const parentStepIndexes = [step.parentA, step.parentB]
      .filter((parent) => parent.sourceType === "intermediate")
      .map((parent) => parent.producedByStepIndex);
    const parentGenerations = parentStepIndexes.map((stepIndex) => {
      if (
        stepIndex === null ||
        stepIndex >= step.stepIndex ||
        !generations.has(stepIndex)
      ) {
        throw new BreedingTreeBuildError("INVALID_INTERMEDIATE_REFERENCE");
      }
      return generations.get(stepIndex)!;
    });
    const generation = step.generation ?? Math.max(0, ...parentGenerations) + 1;
    generations.set(step.stepIndex, generation);
    return { ...step, generation };
  });
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
