import type {
  OffspringCandidate,
  PlanDetail,
  PlanStep,
} from "@palhatch/contracts";

import {
  BreedingTreeBuildError,
  buildBreedingTreeFromSource,
  type BreedingTreeModel,
  type BreedingTreeSourceParent,
  type BreedingTreeSourceStep,
} from "@/features/breeder/lib/build-breeding-tree";

import { buildPlanPassiveFacts } from "./passive-facts";

export function buildPlanBreedingTree(detail: PlanDetail): BreedingTreeModel {
  const sortedSteps = [...detail.steps].sort(
    (left, right) => left.step_index - right.step_index,
  );
  const stepByIndex = new Map(
    sortedSteps.map((step) => [step.step_index, step]),
  );

  const sourceSteps: BreedingTreeSourceStep[] = sortedSteps.map((step) => {
    const selectedCandidate = selectedCandidateFor(detail, step);
    return {
      stepIndex: step.step_index,
      generation: null,
      recipeType: null,
      parentA: planParentToSource(step, "a", stepByIndex, detail.candidates),
      parentB: planParentToSource(step, "b", stepByIndex, detail.candidates),
      childPalId: step.expected_child_pal_id,
      childDisplayName:
        selectedCandidate?.pal_display_name ??
        (step.expected_child_pal_id === detail.summary.target_pal_id
          ? detail.summary.target_pal_display_name
          : null),
      childRequiredGender: step.preferred_gender,
      requiredPassiveIds: [...step.required_passive_ids],
      selectedChildInstanceUid: step.selected_child_instance_uid,
      childOwnerDisplayName:
        selectedCandidate?.owner_display_name ??
        (step.selected_child_instance_uid === null
          ? "尚未选择真实子代（无所有者事实）"
          : "已选真实子代（所有者未包含在当前计划投影）"),
      childGender: selectedCandidate?.gender,
      childPassiveSkillIds: selectedCandidate?.matched_passive_ids ?? [],
      childLocationType: selectedCandidate?.location_type ?? null,
      childLocationName: selectedCandidate?.location_name ?? null,
      childLocationSlotIndex: selectedCandidate?.location_slot_index ?? null,
    };
  });

  return buildBreedingTreeFromSource(
    {
      steps: sourceSteps,
      feasibilityStatus: null,
      adoptable: false,
      hasMissing: false,
    },
    { passiveFacts: buildPlanPassiveFacts(detail.summary) },
  );
}

function planParentToSource(
  step: PlanStep,
  side: "a" | "b",
  stepByIndex: ReadonlyMap<number, PlanStep>,
  candidates: readonly OffspringCandidate[],
): BreedingTreeSourceParent {
  const sourceKind =
    side === "a" ? step.parent_a_source_kind : step.parent_b_source_kind;
  const instanceUid =
    side === "a" ? step.parent_a_instance_uid : step.parent_b_instance_uid;
  const parentStepIndex =
    side === "a" ? step.parent_a_step_index : step.parent_b_step_index;

  if (sourceKind === "prior_step") {
    if (parentStepIndex === null) {
      throw new BreedingTreeBuildError("INVALID_INTERMEDIATE_REFERENCE");
    }
    const parentStep = stepByIndex.get(parentStepIndex);
    if (parentStep === undefined) {
      throw new BreedingTreeBuildError("INVALID_INTERMEDIATE_REFERENCE");
    }
    const selectedCandidate = selectedCandidateForStep(candidates, parentStep);
    return {
      sourceType: "intermediate",
      palId: parentStep.expected_child_pal_id,
      displayNameOverride: selectedCandidate?.pal_display_name ?? null,
      instanceUid: null,
      ownerDisplayName:
        selectedCandidate?.owner_display_name ??
        (parentStep.selected_child_instance_uid === null
          ? `步骤 ${parentStepIndex + 1} 尚未选择真实子代`
          : "所有者未包含在当前计划投影"),
      gender: selectedCandidate?.gender ?? parentStep.preferred_gender,
      passiveSkillIds: selectedCandidate?.matched_passive_ids ?? [],
      requiredPassiveIds: [],
      borrowed: false,
      producedByStepIndex: parentStepIndex,
      locationType: selectedCandidate?.location_type ?? null,
      locationName: selectedCandidate?.location_name ?? null,
      locationSlotIndex: selectedCandidate?.location_slot_index ?? null,
    };
  }

  if (instanceUid === null) {
    throw new BreedingTreeBuildError("INVENTORY_INSTANCE_UID_REQUIRED");
  }
  return {
    sourceType: "inventory",
    palId: "plan-inventory-parent",
    displayNameOverride: "固定库存亲本",
    instanceUid,
    ownerDisplayName: "所有者未包含在当前计划安全投影",
    gender: null,
    passiveSkillIds: [],
    requiredPassiveIds: [],
    borrowed: false,
    producedByStepIndex: null,
    locationType:
      side === "a" ? step.parent_a_location_type : step.parent_b_location_type,
    locationName:
      side === "a" ? step.parent_a_location_name : step.parent_b_location_name,
    locationSlotIndex:
      side === "a"
        ? step.parent_a_location_slot_index
        : step.parent_b_location_slot_index,
  };
}

function selectedCandidateFor(
  detail: PlanDetail,
  step: PlanStep,
): OffspringCandidate | undefined {
  return selectedCandidateForStep(detail.candidates, step);
}

function selectedCandidateForStep(
  candidates: readonly OffspringCandidate[],
  step: PlanStep,
): OffspringCandidate | undefined {
  return candidates.find(
    (candidate) =>
      candidate.step_id === step.step_id &&
      (candidate.confirmed ||
        candidate.pal_instance_uid === step.selected_child_instance_uid),
  );
}
