/**
 * A deliberately small JSON Schema validator.
 *
 * It supports exactly the keywords `.cairn/schema.json` uses and nothing else.
 * Anything it does not understand is reported rather than ignored, so the
 * schema can never silently under-validate: an unsupported keyword is a bug
 * in this file, not a document that quietly passes.
 *
 * Keeping this in-tree is what lets the published package have zero runtime
 * dependencies, which matters for a tool people run against untrusted repos.
 */

const SUPPORTED = new Set([
  '$schema', '$id', 'title', 'description', 'default', 'cairnFormatVersion',
  'type', 'required', 'properties', 'additionalProperties',
  'enum', 'pattern', 'minLength', 'maxLength', 'minItems', 'items',
  'format',
]);

// Deliberately strict: an ISO-8601 UTC instant, which is the only form we write.
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function typeOf(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function join(path, key) {
  return path ? `${path}.${key}` : String(key);
}

/**
 * @returns {{path: string, message: string}[]} empty when the document is valid
 */
export function validate(data, schema, path = '') {
  const errors = [];

  for (const keyword of Object.keys(schema)) {
    if (!SUPPORTED.has(keyword)) {
      errors.push({
        path,
        message: `schema uses unsupported keyword '${keyword}'; this validator would not enforce it`,
      });
    }
  }

  if (schema.type) {
    const actual = typeOf(data);
    const expected = schema.type === 'integer' ? 'number' : schema.type;
    if (actual !== expected) {
      errors.push({ path, message: `expected ${schema.type}, got ${actual}` });
      // Further checks assume the type held, so stop here.
      return errors;
    }
  }

  if (schema.enum && !schema.enum.includes(data)) {
    errors.push({
      path,
      message: `'${data}' is not one of: ${schema.enum.join(', ')}`,
    });
  }

  if (typeof data === 'string') {
    if (schema.minLength !== undefined && data.length < schema.minLength) {
      errors.push({ path, message: `must not be empty` });
    }
    if (schema.maxLength !== undefined && data.length > schema.maxLength) {
      errors.push({
        path,
        message: `is ${data.length} characters; the limit is ${schema.maxLength}`,
      });
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(data)) {
      errors.push({ path, message: `'${data}' does not match ${schema.pattern}` });
    }
    if (schema.format === 'date-time' && !DATE_TIME.test(data)) {
      errors.push({
        path,
        message: `'${data}' is not an ISO-8601 timestamp (expected e.g. 2026-04-01T09:00:00Z)`,
      });
    }
  }

  if (Array.isArray(data)) {
    if (schema.minItems !== undefined && data.length < schema.minItems) {
      errors.push({
        path,
        message: `needs at least ${schema.minItems} item${schema.minItems === 1 ? '' : 's'}`,
      });
    }
    if (schema.items) {
      data.forEach((item, i) => {
        errors.push(...validate(item, schema.items, `${path}[${i}]`));
      });
    }
  }

  if (data && typeOf(data) === 'object') {
    for (const key of schema.required || []) {
      if (data[key] === undefined) {
        errors.push({ path: join(path, key), message: 'is required but missing' });
      }
    }

    if (schema.additionalProperties === false && schema.properties) {
      for (const key of Object.keys(data)) {
        if (!(key in schema.properties)) {
          errors.push({ path: join(path, key), message: 'is not a recognised field' });
        }
      }
    }

    for (const [key, subSchema] of Object.entries(schema.properties || {})) {
      if (data[key] !== undefined) {
        errors.push(...validate(data[key], subSchema, join(path, key)));
      }
    }
  }

  return errors;
}
