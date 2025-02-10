export type ErrorType = string;
export type ValidationError = { path?: string; errors: ErrorType[] };

export type ValidationResult<T> = {
  isValid: boolean;
  errors: ValidationError[];
  value: T;
};

export type Schema<T> = (value: any) => ValidationResult<T>;
export type Infer<V> = V extends Schema<infer T> ? T : never;
export type ObjectSchema<T> = { [K in keyof T]: Schema<T[K]> };

/**
 * Combines multiple validators into a single schema.
 * @param validators - An array of schema validators.
 * @returns A schema that applies all validators in sequence.
 */
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

/**
 * Validates that the value is a string.
 * @param validators - An array of schema validators to apply.
 * @returns A schema that checks if the value is a string.
 */
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

/**
 * Validates that the value is a number.
 * @param validators - An array of schema validators to apply.
 * @returns A schema that checks if the value is a number.
 */
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

/**
 * Creates a schema that allows a value to be of a specified type or undefined or null.
 * @param schema - The schema to validate the value against.
 * @returns A schema that checks if the value is valid or undefined/null.
 */
export function optional<T>(schema: Schema<T>): Schema<T | undefined | null> {
  return (value: unknown) => {
    if (value === undefined || value === null) {
      return { isValid: true, errors: [], value };
    }
    return schema(value);
  };
}

/**
 * Creates a validator based on a custom rule.
 * @param rule - A function that returns an error message or undefined.
 * @returns A schema that applies the custom validation rule.
 */
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

/**
 * Validates that the value has a minimum length.
 * @param length - The minimum length required.
 * @param message - The error message if validation fails.
 * @returns A schema that checks if the value meets the minimum length.
 */
export function minLength<T extends string | Array<any>>(
  length: number,
  message = `Minimum length is ${length}`
): Schema<T> {
  return createValidator((value) =>
    value.length >= length ? undefined : message
  );
}

/**
 * Validates that the value has a maximum length.
 * @param length - The maximum length allowed.
 * @param message - The error message if validation fails.
 * @returns A schema that checks if the value meets the maximum length.
 */
export function maxLength<T extends string | Array<any>>(
  length: number,
  message = `Maximum length is ${length}`
): Schema<T> {
  return createValidator((value) =>
    value.length <= length ? undefined : message
  );
}

/**
 * Validates that the value matches a specified regular expression pattern.
 * @param regex - The regular expression to match against.
 * @param message - The error message if validation fails.
 * @returns A schema that checks if the value matches the pattern.
 */
export function pattern(
  regex: RegExp,
  message = "Invalid pattern format"
): Schema<string> {
  return createValidator((value) => (regex.test(value) ? undefined : message));
}

/**
 * Validates that the value is a valid email format.
 * @param message - The error message if validation fails.
 * @returns A schema that checks if the value is a valid email.
 */
export function email(message = "Invalid email format"): Schema<string> {
  return createValidator((value) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? undefined : message
  );
}

/**
 * Validates that the value is at least a specified minimum.
 * @param min - The minimum value allowed.
 * @param message - The error message if validation fails.
 * @returns A schema that checks if the value is at least the minimum.
 */
export function min(
  min: number,
  message = `Must be at least ${min}`
): Schema<number> {
  return createValidator((value) => (value >= min ? undefined : message));
}

/**
 * Validates that the value is at most a specified maximum.
 * @param max - The maximum value allowed.
 * @param message - The error message if validation fails.
 * @returns A schema that checks if the value is at most the maximum.
 */
export function max(
  max: number,
  message = `Must be at most ${max}`
): Schema<number> {
  return createValidator((value) => (value <= max ? undefined : message));
}

/**
 * Validates that the value is an object matching a specified schema.
 * @param schema - The schema to validate the object against.
 * @returns A schema that checks if the value is a valid object.
 */
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

/**
 * Validates that the value is an array of items matching specified schemas.
 * @param schema - An array of schemas to validate each item in the array.
 * @returns A schema that checks if the value is a valid array.
 */
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

/**
 * Validates that the value is a boolean.
 * @returns A schema that checks if the value is a boolean.
 */
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

/**
 * Validates that the value is a valid Date object.
 * @returns A schema that checks if the value is a valid date.
 */
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

/**
 * Validates that the value is exactly equal to a specified literal.
 * @param expected - The expected value.
 * @returns A schema that checks if the value matches the expected literal.
 */
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

/**
 * Validates that the value matches one of the specified schemas.
 * @param schemas - An array of schemas to validate against.
 * @returns A schema that checks if the value matches one of the schemas.
 */
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
