import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MESSAGE_TYPES } from "../../../src/network/protocol/messages";

const DOC_PATH = resolve(__dirname, "../../../docs/NETWORK_PROTOCOL.md");

function sectionBody(markdown: string, heading: string): string {
  const start = markdown.indexOf(heading);
  if (start < 0) throw new Error(`missing section ${heading}`);
  const rest = markdown.slice(start + heading.length);
  const next = rest.search(/\n#{2,3} /);
  return next < 0 ? rest : rest.slice(0, next);
}

function tableFirstColumnNames(body: string): string[] {
  const names: string[] = [];
  let afterSeparator = false;
  for (const line of body.split("\n")) {
    if (/^\|-+\|/.test(line)) {
      afterSeparator = true;
      continue;
    }
    if (!afterSeparator) continue;
    const match = /^\|\s*`([A-Za-z]+)`\s*\|/.exec(line);
    if (match?.[1] !== undefined) names.push(match[1]);
  }
  return names;
}

describe("MESSAGE_TYPES vs NETWORK_PROTOCOL.md", () => {
  const markdown = readFileSync(DOC_PATH, "utf8");
  const controlNames = tableFirstColumnNames(
    sectionBody(markdown, "### 4.1 Control (reliable)"),
  );
  const highRateNames = tableFirstColumnNames(
    sectionBody(markdown, "### 4.2 High-rate (unreliable)"),
  );

  it("extracts the 4.1 control table", () => {
    expect(controlNames).toHaveLength(15);
    expect(highRateNames).toEqual(["in", "snap"]);
  });

  it("matches exactly the 4.1 names plus snap and in from 4.2", () => {
    const expected = new Set([...controlNames, ...highRateNames]);
    expect(new Set(MESSAGE_TYPES)).toEqual(expected);
    expect(MESSAGE_TYPES).toHaveLength(expected.size);
  });
});
