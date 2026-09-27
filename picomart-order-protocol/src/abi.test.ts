import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { PICOMART_ABI } from "./abi.js";

type AbiParameter = {
  type: string;
};

type AbiFunction = {
  type: "function";
  name: string;
  inputs: AbiParameter[];
  outputs: AbiParameter[];
  stateMutability: "nonpayable" | "payable" | "pure" | "view";
};

type ContractArtifact = {
  abi: Array<AbiFunction | { type: string }>;
};

type FunctionFragment = {
  name: string;
  inputs: string[];
  outputs: string[];
  stateMutability: AbiFunction["stateMutability"];
};

function parameterTypes(parameters: string | undefined): string[] {
  if (!parameters?.trim()) return [];
  return parameters.split(",").map(parameter => parameter.trim().split(/\s+/)[0]);
}

function parseFunctionFragment(fragment: string): FunctionFragment {
  const match = fragment.match(
    /^function\s+(\w+)\(([^)]*)\)(?:\s+(nonpayable|payable|pure|view))?(?:\s+returns\s+\(([^)]*)\))?$/,
  );
  if (!match) throw new Error(`Unsupported ABI fragment: ${fragment}`);

  return {
    name: match[1],
    inputs: parameterTypes(match[2]),
    outputs: parameterTypes(match[4]),
    stateMutability: (match[3] ?? "nonpayable") as AbiFunction["stateMutability"],
  };
}

describe("PICOMART_ABI", async () => {
  const artifactUrl = new URL(
    "../../picomart-frontend/src/contracts/Picomart.json",
    import.meta.url,
  );
  const artifact = JSON.parse(await readFile(artifactUrl, "utf8")) as ContractArtifact;
  const functions = artifact.abi.filter(
    (entry): entry is AbiFunction => entry.type === "function",
  );

  it.each(PICOMART_ABI)("matches the canonical contract artifact: %s", fragment => {
    const parsed = parseFunctionFragment(fragment);
    const canonical = functions.find(entry =>
      entry.name === parsed.name &&
      entry.inputs.map(input => input.type).join(",") === parsed.inputs.join(","),
    );

    expect(canonical, `Missing canonical function for ${fragment}`).toBeDefined();
    expect(canonical?.outputs.map(output => output.type)).toEqual(parsed.outputs);
    expect(canonical?.stateMutability).toBe(parsed.stateMutability);
  });
});
