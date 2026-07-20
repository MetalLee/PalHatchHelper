import { afterEach, describe, expect, it, vi } from "vitest";

describe("breeder client CSP compatibility", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("loads client components without dynamic JavaScript compilation", async () => {
    vi.resetModules();
    vi.stubGlobal(
      "Function",
      class BlockedFunction {
        constructor() {
          throw new EvalError("unsafe-eval is blocked by production CSP");
        }
      },
    );

    await expect(
      Promise.all([
        import("../features/breeder/breeder-form"),
        import("../features/breeder/breeding-job-view"),
      ]),
    ).resolves.toEqual([
      expect.objectContaining({ BreederForm: expect.any(Function) }),
      expect.objectContaining({ BreedingJobView: expect.any(Function) }),
    ]);
  });
});
