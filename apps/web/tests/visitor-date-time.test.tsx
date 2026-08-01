import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  VisitorDateTime,
  formatVisitorDateTime,
} from "../components/formatters/visitor-date-time";

const timestamp = "2026-07-24T08:00:00.000Z";
const formatterOptions = { dateStyle: "short", timeStyle: "short" } as const;

describe("visitor date and time", () => {
  it("formats an instant in the visitor's supplied IANA time zone", () => {
    const visitorTime = new Intl.DateTimeFormat("en-US", {
      ...formatterOptions,
      timeZone: "America/Los_Angeles",
    }).format(new Date(timestamp));
    const ShanghaiTime = new Intl.DateTimeFormat("en-US", {
      ...formatterOptions,
      timeZone: "Asia/Shanghai",
    }).format(new Date(timestamp));

    expect(
      formatVisitorDateTime(timestamp, "en-US", formatterOptions, {
        timeZone: "America/Los_Angeles",
      }),
    ).toBe(visitorTime);
    expect(visitorTime).not.toBe(ShanghaiTime);
  });

  it("renders a semantic time element after resolving the visitor time zone", () => {
    const expected = formatVisitorDateTime(
      timestamp,
      "en-US",
      formatterOptions,
      {
        timeZone: "America/Los_Angeles",
      },
    );

    render(
      <VisitorDateTime
        value={timestamp}
        locale="en-US"
        options={formatterOptions}
        timeZone="America/Los_Angeles"
      />,
    );

    const time = screen.getByText(expected);
    expect(time.tagName).toBe("TIME");
    expect(time.getAttribute("dateTime")).toBe(timestamp);
  });
});
