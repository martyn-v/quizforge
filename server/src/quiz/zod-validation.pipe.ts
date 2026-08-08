import { BadRequestException, type PipeTransform } from "@nestjs/common";
import { z, type ZodType } from "zod/v4";

/** Parses a request body against a Zod schema; a mismatch becomes a 400. */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException(z.prettifyError(parsed.error));
    }
    return parsed.data;
  }
}
