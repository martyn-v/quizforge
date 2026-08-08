import { BadRequestException } from "@nestjs/common";
import { z } from "zod/v4";
import { ZodValidationPipe } from "./zod-validation.pipe";

const schema = z.object({ url: z.url() });

describe("ZodValidationPipe", () => {
  it("returns the parsed value when the body matches the schema", () => {
    const pipe = new ZodValidationPipe(schema);

    const result = pipe.transform({ url: "https://example.com/README.md" });

    expect(result).toEqual({ url: "https://example.com/README.md" });
  });

  it("strips unknown keys from the body", () => {
    const pipe = new ZodValidationPipe(schema);

    const result = pipe.transform({
      url: "https://example.com/README.md",
      extra: "ignored",
    });

    expect(result).toEqual({ url: "https://example.com/README.md" });
  });

  it("throws a 400 with the field name when the body does not match", () => {
    const pipe = new ZodValidationPipe(schema);

    expect(() => pipe.transform({ url: 42 })).toThrow(BadRequestException);
    expect(() => pipe.transform({ url: 42 })).toThrow(/url/);
  });
});
