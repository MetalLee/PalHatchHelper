import { NextResponse } from "next/server";
import { describe, expect, it } from "vitest";

import { withPrivateCacheHeaders } from "../middleware";

describe("protected response caching", () => {
  it("marks authentication redirects private and non-cacheable", () => {
    const response = withPrivateCacheHeaders(
      NextResponse.redirect("https://example.invalid/login"),
    );

    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("vary")).toBe("Cookie");
  });
});
