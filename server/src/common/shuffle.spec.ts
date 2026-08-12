import { describe, it, expect } from "vitest";
import { shuffle } from "./shuffle";

describe("shuffle", () => {
  it("returns the same array mutated", () => {
    const array = [1, 2, 3, 4];
    const result = shuffle(array);
    expect(result).toBe(array);
  });

  it("contains all original elements", () => {
    const array = [1, 2, 3, 4, 5];
    shuffle(array);
    expect(array).toContain(1);
    expect(array).toContain(2);
    expect(array).toContain(3);
    expect(array).toContain(4);
    expect(array).toContain(5);
  });

  it("maintains array length", () => {
    const array = [1, 2, 3, 4, 5];
    shuffle(array);
    expect(array).toHaveLength(5);
  });

  it("handles single element arrays", () => {
    const array = [1];
    shuffle(array);
    expect(array).toEqual([1]);
  });

  it("handles empty arrays", () => {
    const array: number[] = [];
    shuffle(array);
    expect(array).toEqual([]);
  });
});
