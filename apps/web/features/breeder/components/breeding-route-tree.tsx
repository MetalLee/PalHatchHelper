import type { BreedingRoute } from "@palhatch/contracts";
import { ArrowDown, GitBranch, Plus, TriangleAlert } from "lucide-react";
import type { CSSProperties } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import {
  BreedingTreeBuildError,
  buildBreedingTree,
  type BreedingTreeEntity,
  type BreedingTreeModel,
  type BreedingTreeOccurrence,
  type BreedingTreePassiveFact,
} from "../lib/build-breeding-tree";
import { genderLabel } from "../presentation";
import { BreedingTreeNode } from "./breeding-tree-node";

const cardWidth = 244;
const columnGap = 72;
const rowGap = 28;

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
  width: number;
  height: number;
}

export function BreedingRouteTree({
  route,
  targetPalId,
  palNames,
  passiveNames,
  passiveFacts,
}: Readonly<{
  route: BreedingRoute | null;
  targetPalId: string;
  palNames: ReadonlyMap<string, string>;
  passiveNames: ReadonlyMap<string, string>;
  passiveFacts?: ReadonlyMap<string, BreedingTreePassiveFact>;
}>) {
  let model: BreedingTreeModel;
  try {
    model = buildBreedingTree(route, { targetPalId, passiveFacts });
  } catch (error) {
    const code =
      error instanceof BreedingTreeBuildError
        ? error.code
        : "INVALID_BREEDING_TREE";
    return (
      <section className="min-w-0 max-w-full" aria-label="当前路线的配种路径树">
        <Alert
          variant="destructive"
          className="rounded-3xl border-rose-200 bg-rose-50/94"
        >
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>路线树数据不一致</AlertTitle>
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
        aria-label="当前路线的配种路径树"
      >
        <GitBranch
          aria-hidden="true"
          className="mx-auto size-8 text-muted-foreground"
        />
        <h3 className="mt-3 font-bold text-foreground">没有可绘制的路线</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          当前结果未提供合法配种步骤，不会生成虚构节点。
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
  const layout = createTreeLayout(model, entityById);

  return (
    <section
      className="min-w-0 max-w-full overflow-hidden rounded-[1.75rem] border border-glass-border bg-white/72 shadow-soft"
      aria-label="当前路线的配种路径树"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-border bg-white/70 px-4 py-4 sm:px-6">
        <div>
          <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">
            Breeding route tree
          </p>
          <h3 className="mt-1 text-xl font-bold text-foreground">
            当前路线的配种路径
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            初始亲本 → 中间代 → 最终目标；连接线只表达确定的配种关系。
          </p>
        </div>
        <p className="rounded-full border border-border bg-white px-3 py-2 text-xs font-semibold text-muted-foreground">
          {model.steps.length} 个步骤 ·{" "}
          {model.feasibilityStatus === "ready" ? "库存可执行" : "需要补充库存"}
        </p>
      </div>

      <DesktopTree
        model={model}
        layout={layout}
        entityById={entityById}
        palNames={palNames}
        passiveNames={passiveNames}
      />
      <MobileTree
        model={model}
        entityById={entityById}
        occurrenceById={occurrenceById}
        palNames={palNames}
        passiveNames={passiveNames}
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
}: Readonly<{
  model: BreedingTreeModel;
  layout: TreeLayout;
  entityById: ReadonlyMap<string, BreedingTreeEntity>;
  palNames: ReadonlyMap<string, string>;
  passiveNames: ReadonlyMap<string, string>;
}>) {
  const gridStyle: CSSProperties = {
    width: layout.width,
    minHeight: layout.height,
    gridTemplateColumns: `repeat(${layout.columnCount}, ${cardWidth}px)`,
    gridTemplateRows: `repeat(${layout.maxRows}, ${layout.rowHeight}px)`,
    columnGap,
    rowGap,
  };
  const headerStyle: CSSProperties = {
    width: layout.width,
    gridTemplateColumns: `repeat(${layout.columnCount}, ${cardWidth}px)`,
    columnGap,
  };

  return (
    <div className="hidden lg:block">
      <div
        className="max-w-full overflow-x-auto overscroll-x-contain px-6 pt-5 pb-7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        tabIndex={0}
        aria-label="桌面配种树，可在树区域内横向滚动"
      >
        <div className="mb-3 grid" style={headerStyle}>
          {Array.from({ length: layout.columnCount }, (_, generation) => (
            <p
              key={generation}
              className="text-center text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase"
              style={{ gridColumn: generation + 1 }}
            >
              {generation === 0 ? "初始亲本" : `第 ${generation} 代`}
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
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
              >
                <path d="M0 0L8 4L0 8Z" fill="#6b9d8b" />
              </marker>
              <marker
                id="breeding-tree-arrow-special"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
              >
                <path d="M0 0L8 4L0 8Z" fill="#d97706" />
              </marker>
            </defs>
            {model.edges.map((edge) => {
              const from = layout.positionByOccurrenceId.get(
                edge.fromOccurrenceId,
              );
              const to = layout.positionByOccurrenceId.get(edge.toOccurrenceId);
              if (from === undefined || to === undefined) return null;
              const startX = from.column * (cardWidth + columnGap) + cardWidth;
              const endX = to.column * (cardWidth + columnGap);
              const startY =
                (from.row - 1) * (layout.rowHeight + rowGap) +
                layout.rowHeight / 2;
              const endY =
                (to.row - 1) * (layout.rowHeight + rowGap) +
                layout.rowHeight / 2;
              const controlX = startX + Math.max(32, (endX - startX) / 2);
              return (
                <path
                  key={edge.id}
                  d={`M ${startX} ${startY} C ${controlX} ${startY}, ${controlX} ${endY}, ${endX - 8} ${endY}`}
                  fill="none"
                  stroke={edge.recipeType === "special" ? "#d97706" : "#6b9d8b"}
                  strokeWidth="2"
                  strokeDasharray={
                    edge.recipeType === "special" ? "7 6" : undefined
                  }
                  markerEnd={
                    edge.recipeType === "special"
                      ? "url(#breeding-tree-arrow-special)"
                      : "url(#breeding-tree-arrow-normal)"
                  }
                />
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
                  roleLabel={occurrenceRoleLabel(occurrence, entity)}
                  palNames={palNames}
                  passiveNames={passiveNames}
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
}: Readonly<{
  model: BreedingTreeModel;
  entityById: ReadonlyMap<string, BreedingTreeEntity>;
  occurrenceById: ReadonlyMap<string, BreedingTreeOccurrence>;
  palNames: ReadonlyMap<string, string>;
  passiveNames: ReadonlyMap<string, string>;
}>) {
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
          roleLabel="库存中的目标"
          palNames={palNames}
          passiveNames={passiveNames}
        />
      </div>
    );
  }

  return (
    <ol className="grid min-w-0 gap-5 p-4 sm:p-6 lg:hidden">
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
                步骤 {index + 1} · 第 {step.generation} 代
              </h4>
              <span className="text-xs font-semibold text-muted-foreground">
                {step.recipeType === "special" ? "特殊配方" : "常规配方"}
              </span>
            </div>
            <BreedingTreeNode
              entity={parentAEntity}
              occurrence={{
                ...parentAOccurrence,
                requiredPassiveIds: step.parentA.requiredPassiveIds,
              }}
              roleLabel={parentRoleLabel(parentAEntity, "a")}
              palNames={palNames}
              passiveNames={passiveNames}
            />
            <Connector icon={Plus} label="与" />
            <BreedingTreeNode
              entity={parentBEntity}
              occurrence={{
                ...parentBOccurrence,
                requiredPassiveIds: step.parentB.requiredPassiveIds,
              }}
              roleLabel={parentRoleLabel(parentBEntity, "b")}
              palNames={palNames}
              passiveNames={passiveNames}
            />
            <Connector icon={ArrowDown} label="配种产出" />
            <BreedingTreeNode
              entity={childEntity}
              occurrence={childOccurrence}
              roleLabel={childEntity.isTarget ? "最终目标" : "中间子代"}
              palNames={palNames}
              passiveNames={passiveNames}
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

function createTreeLayout(
  model: BreedingTreeModel,
  entityById: ReadonlyMap<string, BreedingTreeEntity>,
): TreeLayout {
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
      return (
        (entity?.passives.length ?? 0) + occurrence.requiredPassiveIds.length
      );
    }),
  );
  const rowHeight = 300 + Math.ceil(maximumPassiveCount / 2) * 34;
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
): string {
  if (occurrence.role === "child") {
    return entity.isTarget ? "最终目标" : "中间子代";
  }
  return parentRoleLabel(entity, occurrence.role === "parent_a" ? "a" : "b");
}

function parentRoleLabel(entity: BreedingTreeEntity, side: "a" | "b"): string {
  if (genderLabel(entity.gender) === "雄性") return "父本";
  if (genderLabel(entity.gender) === "雌性") return "母本";
  return side === "a" ? "亲本 A" : "亲本 B";
}
