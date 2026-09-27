import {describe, expect, it} from "vitest";
import {hederaEntityIdToSolidityAddress, solidityEntityAddressToId} from "./hederaAddress.js";

describe("legacy packed entity address compatibility", () => {
  it("pins the inherited token conversion used by paid checkout", () => {
    expect(hederaEntityIdToSolidityAddress("0.0.429274")).toBe("0x0000000000000000000000000000000000068cda");
  });
  it("roundtrips nonzero shard/realm and maximum unsigned field widths", () => {
    for (const id of ["1.2.3",`${2n ** 32n - 1n}.${2n ** 64n - 1n}.${2n ** 64n - 1n}`]) {
      expect(solidityEntityAddressToId(hederaEntityIdToSolidityAddress(id)!)).toBe(id);
    }
  });
  it("rejects malformed, signed, noncanonical and out-of-range IDs", () => {
    for (const id of ["01.0.1","-1.0.1","0.0.1.2",`${2n ** 32n}.0.1`,`0.${2n ** 64n}.1`,`0.0.${2n ** 64n}`]) expect(hederaEntityIdToSolidityAddress(id)).toBeNull();
  });
});
