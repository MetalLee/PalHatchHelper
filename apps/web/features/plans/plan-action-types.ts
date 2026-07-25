export type PlanActionPayload = Record<string, boolean | number | string> & {
  action: string;
};

export type RunPlanAction = (payload: PlanActionPayload) => Promise<void>;
