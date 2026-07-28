"use client";

import type { BreedingRoute } from "@palhatch/contracts";
import { ArrowDown, GitBranch, Plus, TriangleAlert } from "lucide-react";
import type { CSSProperties } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useCopy } from "@/i18n/client";
import { cn } from "@/lib/utils";

import {
  BreedingTreeBuildError,
  buildBreedingTree,
  type BreedingTreeEntity,
  type BreedingTreeModel,
  type BreedingTreeOccurrence,
  type BreedingTreePassiveFact,
} from "../lib/build-breeding-tree";
import {
  BreedingTreeNode,
  type BreedingTreeNodeOverlay,
} from "./breeding-tree-node";

interface PositionedOccurrence {
  occurrence: BreedingTreeOccurrence;
  column: number;
  row: number;
}

interface TreeLayout {
  positioned: PositionedOccurrence[];
  positionByOccurrenceId: ReadonlyMap<string, PositionedOccurrence>;
  columnCount: number;
  maxRows: number;
  rowHeight: number;
  cardWidth: number;
  columnGap: number;
  rowGap: number;
  width: number;
  height: number;
}

const TREE_ARROW_WIDTH = 12;
const TREE_ARROW_HEIGHT = 10;
const TREE_ARROW_GAP = 8;

export function BreedingRouteTree({
  route,
  treeModel,
  targetPalId,
  palNames,
  passiveNames,
  passiveFacts,
  stepOverlays,
  compactPreview = false,
  ariaLabel,
  eyebrow,
  title,
  description,
  summary,
}: Readonly<{
  route?: BreedingRoute | null;
  treeModel?: BreedingTreeModel;
  targetPalId: string;
  palNames: ReadonlyMap<string, string>;
  passiveNames: ReadonlyMap<string, string>;
  passiveFacts?: ReadonlyMap<string, BreedingTreePassiveFact>;
  stepOverlays?: ReadonlyMap<number, BreedingTreeNodeOverlay>;
  compactPreview?: boolean;
  ariaLabel?: string;
  eyebrow?: string | null;
  title?: string;
  description?: string | null;
  summary?: string;
}>) {
  const t = useCopy("Breeder");
  const effectiveAriaLabel = ariaLabel ?? t("treeDefaultLabel");
  const effectiveEyebrow = eyebrow === undefined ? t("treeEyebrow") : eyebrow;
  const effectiveTitle = title ?? t("treeDefaultTitle");
  const effectiveDescription =
    description === undefined ? t("treeDefaultDescription") : description;
  let model: BreedingTreeModel;
  try {
    model =
      treeModel ??
      buildBreedingTree(route ?? null, { targetPalId, passiveFacts });
  } catch (error) {
    const code =
      error instanceof BreedingTreeBuildError
        ? error.code
        : "INVALID_BREEDING_TREE";
    return (
      <section className="min-w-0 max-w-full" aria-label={effectiveAriaLabel}>
        <Alert
          variant="destructive"
          className="rounded-3xl border-rose-200 bg-rose-50/94"
        >
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>{t("treeInvalid")}</AlertTitle>
          <AlertDescription className="font-mono break-all">
            {code}
          </AlertDescription>
        </Alert>
      </section>
    );
  }

  if (model.empty) {
    return (
      <section
        className="min-w-0 max-w-full rounded-3xl border border-dashed border-border bg-white/68 p-6 text-center"
        aria-label={effectiveAriaLabel}
      >
        <GitBranch
          aria-hidden="true"
          className="mx-auto size-8 text-muted-foreground"
        />
        <h3 className="mt-3 font-bold text-foreground">{t("treeEmpty")}</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("treeEmptyDescription")}
        </p>
      </section>
    );
  }

  const entityById = new Map(
    model.entities.map((entity) => [entity.id, entity]),
  );
  const occurrenceById = new Map(
    model.occurrences.map((occurrence) => [occurrence.id, occurrence]),
  );
  const layout = createTreeLayout(model, entityById, compactPreview);

  return (
    <section
      className="min-w-0 max-w-full overflow-hidden rounded-[1.75rem] border border-glass-border bg-white/72 shadow-soft"
      aria-label={effectiveAriaLabel}
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-border bg-white/70 px-4 py-4 sm:px-6">
        <div>
          {effectiveEyebrow === null ? null : (
            <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">
              {effectiveEyebrow}
            </p>
          )}
          <h3
            className={cn(
              "text-xl font-bold text-foreground",
              effectiveEyebrow === null && "mt-0",
              effectiveEyebrow !== null && "mt-1",
            )}
          >
            {effectiveTitle}
          </h3>
          {description === null ? null : (
            <p className="mt-1 text-sm text-muted-foreground">
              {effectiveDescription}
            </p>
          )}
        </div>
        <p className="rounded-full border border-border bg-white px-3 py-2 text-xs font-semibold text-muted-foreground">
          {summary ??
            t("treeSummary", {
              steps: model.steps.length,
              status:
                model.feasibilityStatus === "ready"
                  ? t("ready")
                  : model.feasibilityStatus === "needs_inventory"
                    ? t("needsInventory")
                    : t("adoptedRoute"),
            })}
        </p>
      </div>

      <DesktopTree
        model={model}
        layout={layout}
        entityById={entityById}
        palNames={palNames}
        passiveNames={passiveNames}
        stepOverlays={stepOverlays}
        compactPreview={compactPreview}
      />
      <MobileTree
        model={model}
        entityById={entityById}
        occurrenceById={occurrenceById}
        palNames={palNames}
        passiveNames={passiveNames}
        stepOverlays={stepOverlays}
        compactPreview={compactPreview}
      />
    </section>
  );
}

function DesktopTree({
  model,
  layout,
  entityById,
  palNames,
  passiveNames,
  stepOverlays,
  compactPreview,
}: Readonly<{
  model: BreedingTreeModel;
  layout: TreeLayout;
  entityById: ReadonlyMap<string, BreedingTreeEntity>;
  palNames: ReadonlyMap<string, string>;
  passiveNames: ReadonlyMap<string, string>;
  stepOverlays?: ReadonlyMap<number, BreedingTreeNodeOverlay>;
  compactPreview: boolean;
}>) {
  const t = useCopy("Breeder");
  const gridStyle: CSSProperties = {
    width: layout.width,
    minHeight: layout.height,
    gridTemplateColumns: `repeat(${layout.columnCount}, ${layout.cardWidth}px)`,
    gridTemplateRows: `repeat(${layout.maxRows}, ${layout.rowHeight}px)`,
    columnGap: layout.columnGap,
    rowGap: layout.rowGap,
  };
  const headerStyle: CSSProperties = {
    width: layout.width,
    gridTemplateColumns: `repeat(${layout.columnCount}, ${layout.cardWidth}px)`,
    columnGap: layout.columnGap,
  };

  return (
    <div className="hidden lg:block">
      <div
        className="max-w-full overflow-x-auto overscroll-x-contain px-6 pt-5 pb-7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        tabIndex={0}
        aria-label={t("desktopTreeLabel")}
      >
        <div className="mb-3 grid" style={headerStyle}>
          {Array.from({ length: layout.columnCount }, (_, generation) => (
            <p
              key={generation}
              className="text-center text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase"
              style={{ gridColumn: generation + 1 }}
            >
              {generation === 0
                ? t("initialParents")
                : t("generation", { generation })}
            </p>
          ))}
        </div>
        <div className="relative grid" style={gridStyle}>
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 overflow-visible"
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
          >
            <defs>
              <marker
                id="breeding-tree-arrow-normal"
                markerUnits="userSpaceOnUse"
                markerWidth={TREE_ARROW_WIDTH}
                markerHeight={TREE_ARROW_HEIGHT}
                refX={TREE_ARROW_WIDTH}
                refY={TREE_ARROW_HEIGHT / 2}
                orient="auto"
                viewBox={`0 0 ${TREE_ARROW_WIDTH} ${TREE_ARROW_HEIGHT}`}
              >
                <path
                  d={`M0 0L${TREE_ARROW_WIDTH} ${TREE_ARROW_HEIGHT / 2}L0 ${TREE_ARROW_HEIGHT}Z`}
                  fill="#6b9d8b"
                />
              </marker>
              <marker
                id="breeding-tree-arrow-special"
                markerUnits="userSpaceOnUse"
                markerWidth={TREE_ARROW_WIDTH}
                markerHeight={TREE_ARROW_HEIGHT}
                refX={TREE_ARROW_WIDTH}
                refY={TREE_ARROW_HEIGHT / 2}
                orient="auto"
                viewBox={`0 0 ${TREE_ARROW_WIDTH} ${TREE_ARROW_HEIGHT}`}
              >
                <path
                  d={`M0 0L${TREE_ARROW_WIDTH} ${TREE_ARROW_HEIGHT / 2}L0 ${TREE_ARROW_HEIGHT}Z`}
                  fill="#d97706"
                />
              </marker>
            </defs>
            {model.steps.map((step) => {
              const parentA = layout.positionByOccurrenceId.get(
                step.parentAOccurrenceId,
              );
              const parentB = layout.positionByOccurrenceId.get(
                step.parentBOccurrenceId,
              );
              const child = layout.positionByOccurrenceId.get(
                step.childOccurrenceId,
              );
              if (
                parentA === undefined ||
                parentB === undefined ||
                child === undefined
              ) {
                return null;
              }

              const endX = child.column * (layout.cardWidth + layout.columnGap);
              const endY =
                (child.row - 1) * (layout.rowHeight + layout.rowGap) +
                layout.rowHeight / 2;
              const arrowTipX = endX - TREE_ARROW_GAP;
              const joinX = arrowTipX - TREE_ARROW_WIDTH;
              const stroke =
                step.recipeType === "special" ? "#d97706" : "#6b9d8b";
              const markerEnd =
                step.recipeType === "special"
                  ? "url(#breeding-tree-arrow-special)"
                  : "url(#breeding-tree-arrow-normal)";

              return (
                <g key={step.stepIndex} data-step-connector={step.stepIndex}>
                  {[parentA, parentB].map((parent, parentIndex) => {
                    const startX =
                      parent.column * (layout.cardWidth + layout.columnGap) +
                      layout.cardWidth;
                    const startY =
                      (parent.row - 1) * (layout.rowHeight + layout.rowGap) +
                      layout.rowHeight / 2;
                    const controlX =
                      startX + Math.max(16, (joinX - startX) / 2);
                    return (
                      <path
                        key={parentIndex}
                        d={`M ${startX} ${startY} C ${controlX} ${startY}, ${controlX} ${endY}, ${joinX} ${endY}`}
                        fill="none"
                        stroke={stroke}
                        strokeWidth="2"
                        strokeDasharray={
                          step.recipeType === "special" ? "7 6" : undefined
                        }
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        data-connector-role="branch"
                        data-end-x={joinX}
                        data-end-y={endY}
                      />
                    );
                  })}
                  <path
                    d={`M ${joinX} ${endY} H ${arrowTipX}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth="2"
                    strokeDasharray={
                      step.recipeType === "special" ? "7 6" : undefined
                    }
                    strokeLinecap="round"
                    markerEnd={markerEnd}
                    data-connector-role="trunk"
                    data-start-x={joinX}
                    data-start-y={endY}
                  />
                </g>
              );
            })}
          </svg>

          {layout.positioned.map(({ occurrence, column, row }) => {
            const entity = entityById.get(occurrence.entityId);
            if (entity === undefined) return null;
            return (
              <div
                key={occurrence.id}
                className="z-10 min-w-0"
                style={{ gridColumn: column + 1, gridRow: row }}
              >
                <BreedingTreeNode
                  entity={entity}
                  occurrence={occurrence}
                  roleLabel={occurrenceRoleLabel(occurrence, entity, t)}
                  palNames={palNames}
                  passiveNames={passiveNames}
                  overlay={overlayFor(occurrence, stepOverlays)}
                  compactPreview={compactPreview}
                  className="h-full"
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MobileTree({
  model,
  entityById,
  occurrenceById,
  palNames,
  passiveNames,
  stepOverlays,
  compactPreview,
}: Readonly<{
  model: BreedingTreeModel;
  entityById: ReadonlyMap<string, BreedingTreeEntity>;
  occurrenceById: ReadonlyMap<string, BreedingTreeOccurrence>;
  palNames: ReadonlyMap<string, string>;
  passiveNames: ReadonlyMap<string, string>;
  stepOverlays?: ReadonlyMap<number, BreedingTreeNodeOverlay>;
  compactPreview: boolean;
}>) {
  const t = useCopy("Breeder");
  if (model.steps.length === 0 && model.targetOccurrenceId !== null) {
    const targetOccurrence = occurrenceById.get(model.targetOccurrenceId);
    const targetEntity =
      targetOccurrence === undefined
        ? undefined
        : entityById.get(targetOccurrence.entityId);
    if (targetOccurrence === undefined || targetEntity === undefined) {
      return null;
    }
    return (
      <div className="p-4 sm:p-6 lg:hidden">
        <BreedingTreeNode
          entity={targetEntity}
          occurrence={targetOccurrence}
          roleLabel={t("inventoryTarget")}
          palNames={palNames}
          passiveNames={passiveNames}
          overlay={overlayFor(targetOccurrence, stepOverlays)}
          compactPreview={compactPreview}
        />
      </div>
    );
  }

  return (
    <ol
      className={cn(
        "grid min-w-0 p-4 lg:hidden",
        compactPreview ? "gap-3 sm:p-4" : "gap-5 sm:p-6",
      )}
      data-tree-layout="mobile-vertical"
    >
      {model.steps.map((step, index) => {
        const parentAEntity = entityById.get(step.parentA.entityId);
        const parentBEntity = entityById.get(step.parentB.entityId);
        const childEntity = entityById.get(step.childEntityId);
        const parentAOccurrence = occurrenceById.get(step.parentA.occurrenceId);
        const parentBOccurrence = occurrenceById.get(step.parentB.occurrenceId);
        const childOccurrence = occurrenceById.get(step.childOccurrenceId);
        if (
          parentAEntity === undefined ||
          parentBEntity === undefined ||
          childEntity === undefined ||
          parentAOccurrence === undefined ||
          parentBOccurrence === undefined ||
          childOccurrence === undefined
        ) {
          return null;
        }
        return (
          <li
            key={step.stepIndex}
            className="min-w-0 rounded-3xl border border-border bg-white/76 p-3 sm:p-4"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-bold text-foreground">
                {t("stepGeneration", {
                  step: index + 1,
                  generation: step.generation,
                })}
              </h4>
              <span className="text-xs font-semibold text-muted-foreground">
                {step.recipeType === "special"
                  ? t("specialRecipe")
                  : step.recipeType === "normal"
                    ? t("normalRecipe")
                    : t("unknownRecipe")}
              </span>
            </div>
            <BreedingTreeNode
              entity={parentAEntity}
              occurrence={{
                ...parentAOccurrence,
                requiredPassiveIds: step.parentA.requiredPassiveIds,
              }}
              roleLabel={parentRoleLabel(parentAEntity, "a", t)}
              palNames={palNames}
              passiveNames={passiveNames}
              overlay={overlayFor(parentAOccurrence, stepOverlays)}
              compactPreview={compactPreview}
            />
            <Connector icon={Plus} label={t("with")} />
            <BreedingTreeNode
              entity={parentBEntity}
              occurrence={{
                ...parentBOccurrence,
                requiredPassiveIds: step.parentB.requiredPassiveIds,
              }}
              roleLabel={parentRoleLabel(parentBEntity, "b", t)}
              palNames={palNames}
              passiveNames={passiveNames}
              overlay={overlayFor(parentBOccurrence, stepOverlays)}
              compactPreview={compactPreview}
            />
            <Connector icon={ArrowDown} label={t("breedingOutput")} />
            <BreedingTreeNode
              entity={childEntity}
              occurrence={childOccurrence}
              roleLabel={
                childEntity.isTarget ? t("finalTarget") : t("intermediateChild")
              }
              palNames={palNames}
              passiveNames={passiveNames}
              overlay={overlayFor(childOccurrence, stepOverlays)}
              compactPreview={compactPreview}
            />
          </li>
        );
      })}
    </ol>
  );
}

function Connector({
  icon: Icon,
  label,
}: Readonly<{ icon: typeof Plus; label: string }>) {
  return (
    <div className="flex min-h-12 items-center justify-center gap-2 py-2 text-xs font-semibold text-muted-foreground">
      <Icon aria-hidden="true" className="size-5 text-primary" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

function overlayFor(
  occurrence: BreedingTreeOccurrence,
  overlays: ReadonlyMap<number, BreedingTreeNodeOverlay> | undefined,
): BreedingTreeNodeOverlay | undefined {
  return occurrence.stepIndex === null
    ? undefined
    : overlays?.get(occurrence.stepIndex);
}

function createTreeLayout(
  model: BreedingTreeModel,
  entityById: ReadonlyMap<string, BreedingTreeEntity>,
  compactPreview: boolean,
): TreeLayout {
  const cardWidth = compactPreview ? 224 : 244;
  const columnGap = compactPreview ? 52 : 72;
  const rowGap = compactPreview ? 20 : 28;
  const maxGeneration = Math.max(
    0,
    ...model.layers.map((layer) => layer.generation),
  );
  const columnCount = maxGeneration + 1;
  const maxRows = Math.max(
    1,
    ...model.layers.map((layer) => layer.occurrenceIds.length),
  );
  const maximumPassiveCount = Math.max(
    0,
    ...model.occurrences.map((occurrence) => {
      const entity = entityById.get(occurrence.entityId);
      if (entity === undefined) return 0;
      if (entity.kind === "inventory" || entity.kind === "existing_target") {
        return entity.passives.length;
      }
      return entity.requiredPassives.length > 0
        ? entity.requiredPassives.length
        : entity.passives.length;
    }),
  );
  const rowHeight =
    (compactPreview ? 236 : 300) + Math.ceil(maximumPassiveCount / 2) * 34;
  const positioned: PositionedOccurrence[] = [];

  for (const layer of model.layers) {
    const rows = spreadRows(layer.occurrenceIds.length, maxRows);
    layer.occurrenceIds.forEach((occurrenceId, index) => {
      const occurrence = model.occurrences.find(
        (candidate) => candidate.id === occurrenceId,
      );
      const row = rows[index];
      if (occurrence !== undefined && row !== undefined) {
        positioned.push({
          occurrence,
          column: layer.generation,
          row,
        });
      }
    });
  }

  const width = columnCount * cardWidth + (columnCount - 1) * columnGap;
  const height = maxRows * rowHeight + (maxRows - 1) * rowGap;
  return {
    positioned,
    positionByOccurrenceId: new Map(
      positioned.map((position) => [position.occurrence.id, position]),
    ),
    columnCount,
    maxRows,
    rowHeight,
    cardWidth,
    columnGap,
    rowGap,
    width,
    height,
  };
}

function spreadRows(count: number, maximum: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [Math.ceil(maximum / 2)];
  return Array.from({ length: count }, (_, index) => {
    return Math.round((index * (maximum - 1)) / (count - 1)) + 1;
  });
}

function occurrenceRoleLabel(
  occurrence: BreedingTreeOccurrence,
  entity: BreedingTreeEntity,
  t: ReturnType<typeof useCopy<"Breeder">>,
): string {
  if (occurrence.role === "child") {
    return entity.isTarget ? t("finalTarget") : t("intermediateChild");
  }
  return parentRoleLabel(entity, occurrence.role === "parent_a" ? "a" : "b", t);
}

function parentRoleLabel(
  entity: BreedingTreeEntity,
  side: "a" | "b",
  t: ReturnType<typeof useCopy<"Breeder">>,
): string {
  if (entity.gender === "male") return t("father");
  if (entity.gender === "female") return t("mother");
  return side === "a" ? t("parentA") : t("parentB");
}
