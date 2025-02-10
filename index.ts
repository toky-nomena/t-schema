type ErrorType = string;
type ValidationError = { path?: string; errors: ErrorType[] };

type ValidationResult<T> = {
  isValid: boolean;
  errors: ValidationError[];
  value: T;
};

export type Schema<T> = (value: any) => ValidationResult<T>;
export type Infer<V> = V extends Schema<infer T> ? T : never;
export type ObjectSchema<T> = { [K in keyof T]: Schema<T[K]> };

export function pipe<T>(...validators: Schema<T>[]): Schema<T> {
  return (value) => {
    return validators.reduce(
      (acc, validator) => {
        const { errors, isValid } = validator(value);
        return {
          value,
          isValid: acc.isValid && isValid,
          errors: acc.errors.concat(errors),
        };
      },
      { isValid: true, errors: [], value } as ValidationResult<T>
    );
  };
}

export function string(...validators: Schema<string>[]): Schema<string> {
  return (value: unknown) => {
    if (typeof value !== "string") {
      return {
        isValid: false,
        errors: [{ errors: ["Must be a string"] }],
        value: "",
      };
    }
    return pipe(...validators)(value);
  };
}

export function number(...validators: Schema<number>[]): Schema<number> {
  return (value: unknown) => {
    if (typeof value !== "number") {
      return {
        isValid: false,
        errors: [{ errors: ["Must be a number"] }],
        value: 0,
      };
    }
    return pipe(...validators)(value);
  };
}

export function optional<T>(schema: Schema<T>): Schema<T | undefined | null> {
  return (value: unknown) => {
    if (value === undefined || value === null) {
      return { isValid: true, errors: [], value };
    }
    return schema(value);
  };
}

export function createValidator<T>(
  rule: (value: T) => ErrorType | undefined
): Schema<T> {
  return (value) => {
    const error = rule(value);
    return error
      ? { isValid: false, errors: [{ errors: [error] }], value }
      : { isValid: true, errors: [], value };
  };
}

export function minLength<T extends string | Array<any>>(
  length: number,
  message = `Minimum length is ${length}`
): Schema<T> {
  return createValidator((value) =>
    value.length >= length ? undefined : message
  );
}

export function maxLength<T extends string | Array<any>>(
  length: number,
  message = `Maximum length is ${length}`
): Schema<T> {
  return createValidator((value) =>
    value.length <= length ? undefined : message
  );
}

export function pattern(
  regex: RegExp,
  message = "Invalid pattern format"
): Schema<string> {
  return createValidator((value) => (regex.test(value) ? undefined : message));
}

export function email(message = "Invalid email format"): Schema<string> {
  return createValidator((value) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? undefined : message
  );
}

export function min(
  min: number,
  message = `Must be at least ${min}`
): Schema<number> {
  return createValidator((value) => (value >= min ? undefined : message));
}

export function max(
  max: number,
  message = `Must be at most ${max}`
): Schema<number> {
  return createValidator((value) => (value <= max ? undefined : message));
}

export function object<T extends object>(
  schema: ObjectSchema<T>
): Schema<T> & { schema: ObjectSchema<T> } {
  const validator = <T>(value: T): ValidationResult<T> => {
    if (typeof value !== "object" || value === null) {
      return {
        isValid: false,
        errors: [{ errors: ["Must be an object"] }],
        value: {} as T,
      };
    }

    let isValid = true;
    const errors: ValidationResult<T>["errors"] = [];

    for (const [key, current] of Object.entries(schema)) {
      const fieldValue = (value as any)[key];
      const result = (current as Schema<unknown>)(fieldValue);

      if (!result.isValid) {
        isValid = false;
        errors.push(
          ...result.errors.map((err) => ({
            path: err.path ? `${key}.${err.path}` : key,
            errors: err.errors,
          }))
        );
      }
    }

    return { isValid, errors, value: value as T };
  };

  return Object.assign(validator, { schema });
}

export function array<T>(...schema: Schema<T>[]): Schema<T[]> {
  return (value: T[]) => {
    if (!Array.isArray(value)) {
      return {
        isValid: false,
        errors: [{ errors: ["Must be an array"] }],
        value: [],
      };
    }

    let isValid = true;
    const errors: ValidationResult<unknown>["errors"] = [];

    for (let index = 0; index < value.length; index++) {
      const result = pipe(...schema)(value[index]);

      if (!result.isValid) {
        isValid = false;
        errors.push(
          ...result.errors.map((err) => ({
            path: err.path ? `${index}.${err.path}` : `${index}`,
            errors: err.errors,
          }))
        );
      }
    }

    return { isValid, errors, value };
  };
}

export function boolean(): Schema<boolean> {
  return (value: unknown) => {
    if (typeof value !== "boolean") {
      return {
        isValid: false,
        errors: [{ errors: ["Must be a boolean"] }],
        value: false,
      };
    }
    return { isValid: true, errors: [], value };
  };
}

export function date(): Schema<Date> {
  return (value: unknown) => {
    if (!(value instanceof Date) || isNaN(value.getTime())) {
      return {
        isValid: false,
        errors: [{ errors: ["Must be a valid date"] }],
        value: new Date(0),
      };
    }
    return { isValid: true, errors: [], value };
  };
}
export function literal<const T>(expected: T): Schema<T> {
  return (value) => {
    if (value !== expected) {
      return {
        isValid: false,
        errors: [{ errors: [`Must be exactly '${expected}'`] }],
        value: expected,
      };
    }
    return { isValid: true, errors: [], value: value as T };
  };
}

export function union<const T extends readonly unknown[]>(
  schemas: [...{ [K in keyof T]: Schema<T[K]> }]
): Schema<T[number]> {
  return (value: unknown) => {
    const results = schemas.map((schema) => schema(value));
    const validResult = results.find((result) => result.isValid);

    if (validResult) {
      return validResult;
    }

    const values = results.map((r) => r.value).join(", ");

    return {
      isValid: false,
      errors: [
        {
          errors: [
            `Value must match one of the ${schemas.length} values (${values})`,
          ],
        },
      ],
      value: value as T[number],
    };
  };
}

// Example usage with the updated schema
const userSchema = array(
  object({
    date: date(),
    email: string(minLength(8, "Minimum length is 8 for email"), email()),
    password: string(minLength(8, "Minimum length is 8 for password")),
    age: number(min(18)),
    address: optional(
      object({
        street: string(),
        city: string(),
        zipCode: string(),
        country: optional(string()),
      })
    ),
    phoneNumber: optional(string(pattern(/^\+?[\d\s-]{10,}$/))),
    hobbies: array(string()),
    literal: literal("test"),
    status: union([literal("active"), literal("inactive"), literal("pending")]),
    isEnabled: union([literal("TRUE"), literal("FALSE")]),
  })
);

const result = userSchema([
  {
    date: new Date(),
    email: "test@example.com",
    password: "password123",
    age: 25,
    hobbies: ["reading"],
    literal: "test",
  },
]);

console.log(result);
