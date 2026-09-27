import {describe, expect, it} from "vitest";
import {PICOMART_TEMPO_ABI, PICOMART_TEMPO_BUILD, PICOMART_TEMPO_ORDER_FIELDS, PICOMART_TEMPO_ORDER_STATES} from "./tempoContract.js";
describe("generated isolated Tempo contract exports", () => {
  it("uses the pinned Osaka build and bounded states without inherited chain fields", () => {
    expect(PICOMART_TEMPO_BUILD.compiler).toBe("0.8.37+commit.f401782d");
    expect(PICOMART_TEMPO_BUILD.evmVersion).toBe("osaka");
    expect(PICOMART_TEMPO_ORDER_STATES).toEqual({None:0,Initial:1,Paid:2,Delivering:3,Completed:4,RefundReq:5,RefundedToBuyer:6,RefundedToSeller:7,Canceled:8});
    expect(PICOMART_TEMPO_ORDER_FIELDS.map(field=>field.name)).toContain("deadline");
    expect(PICOMART_TEMPO_ORDER_FIELDS.find(field=>field.name === "catalogId")?.type).toBe("bytes16");
    const text=JSON.stringify(PICOMART_TEMPO_ABI);
    for (const retired of ["hcsTopicId","encSymKeyBuyer","symKeyHash"]) expect(text).not.toContain(retired);
    expect(PICOMART_TEMPO_ABI.some(item=>item.type === "receive" || item.type === "fallback")).toBe(false);
  });
  it("exports typed tuple creation/reference inputs and bounded message events", () => {
    const create=PICOMART_TEMPO_ABI.find(item=>item.type === "function" && item.name === "createOrderPaid");
    expect(create?.type === "function" && create.inputs.map(input=>input.type)).toEqual(["tuple","tuple"]);
    expect(PICOMART_TEMPO_ABI.find(item=>item.type === "event" && item.name === "OrderMessage")).toBeDefined();
    expect(PICOMART_TEMPO_BUILD.creationBytecodeHash).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
