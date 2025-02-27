import type { IRContext } from '../../../ir/context';
import type { IRSchemaObject } from '../../../ir/ir';
import { addItemsToSchema } from '../../../ir/utils';
import { refToName } from '../../../utils/ref';
import { discriminatorValue } from '../../shared/utils/discriminator';
import type { ReferenceObject, SchemaObject } from '../types/spec';

interface SchemaContext {
  /**
   * Optional schema $ref. This will be only defined for reusable components
   * from the OpenAPI specification.
   */
  $ref?: string;
  context: IRContext;
}

type SchemaWithRequired<K extends keyof Required<SchemaObject>> = Omit<
  SchemaObject,
  K
> &
  Pick<Required<SchemaObject>, K>;

type SchemaType = Required<SchemaObject>['type'];

export const getSchemaType = ({
  schema,
}: {
  schema: SchemaObject;
}): SchemaType | undefined => {
  if (schema.type) {
    return schema.type;
  }

  // infer object based on the presence of properties
  if (schema.properties) {
    return 'object';
  }
};

const parseSchemaJsDoc = ({
  irSchema,
  schema,
}: {
  irSchema: IRSchemaObject;
  schema: SchemaObject;
}) => {
  if (schema.deprecated !== undefined) {
    irSchema.deprecated = schema.deprecated;
  }

  if (schema.description) {
    irSchema.description = schema.description;
  }

  if (schema.title) {
    irSchema.title = schema.title;
  }
};

const parseSchemaMeta = ({
  irSchema,
  schema,
}: {
  irSchema: IRSchemaObject;
  schema: SchemaObject;
}) => {
  if (schema.default !== undefined) {
    irSchema.default = schema.default;
  }

  if (schema.exclusiveMaximum) {
    if (schema.maximum !== undefined) {
      irSchema.exclusiveMaximum = schema.maximum;
    }
  } else if (schema.maximum !== undefined) {
    irSchema.maximum = schema.maximum;
  }

  if (schema.exclusiveMinimum) {
    if (schema.minimum !== undefined) {
      irSchema.exclusiveMinimum = schema.minimum;
    }
  } else if (schema.minimum !== undefined) {
    irSchema.minimum = schema.minimum;
  }

  if (schema.format) {
    irSchema.format = schema.format;
  }

  if (schema.maxItems !== undefined) {
    irSchema.maxItems = schema.maxItems;
  }

  if (schema.maxLength !== undefined) {
    irSchema.maxLength = schema.maxLength;
  }

  if (schema.minItems !== undefined) {
    irSchema.minItems = schema.minItems;
  }

  if (schema.minLength !== undefined) {
    irSchema.minLength = schema.minLength;
  }

  if (schema.readOnly) {
    irSchema.accessScope = 'read';
  } else if (schema.writeOnly) {
    irSchema.accessScope = 'write';
  }
};

const parseArray = ({
  context,
  irSchema = {},
  schema,
}: SchemaContext & {
  irSchema?: IRSchemaObject;
  schema: SchemaObject;
}): IRSchemaObject => {
  if (schema.maxItems && schema.maxItems === schema.minItems) {
    irSchema.type = 'tuple';
  } else {
    irSchema.type = 'array';
  }

  let schemaItems: Array<IRSchemaObject> = [];

  if (schema.items) {
    const irItemsSchema = schemaToIrSchema({
      context,
      schema: schema.items,
    });

    if (
      !schemaItems.length &&
      schema.maxItems &&
      schema.maxItems === schema.minItems
    ) {
      schemaItems = Array(schema.maxItems).fill(irItemsSchema);
    } else {
      if ('$ref' in schema.items) {
        schemaItems.push(irItemsSchema);
      } else {
        const ofArray =
          schema.items.allOf || schema.items.anyOf || schema.items.oneOf;
        if (ofArray && ofArray.length > 1 && !schema.items.nullable) {
          // bring composition up to avoid incorrectly nested arrays
          irSchema = {
            ...irSchema,
            ...irItemsSchema,
          };
        } else {
          schemaItems.push(irItemsSchema);
        }
      }
    }
  }

  irSchema = addItemsToSchema({
    items: schemaItems,
    schema: irSchema,
  });

  return irSchema;
};

const parseBoolean = ({
  irSchema = {},
}: SchemaContext & {
  irSchema?: IRSchemaObject;
  schema: SchemaObject;
}): IRSchemaObject => {
  irSchema.type = 'boolean';

  return irSchema;
};

const parseNumber = ({
  irSchema = {},
}: SchemaContext & {
  irSchema?: IRSchemaObject;
  schema: SchemaObject;
}): IRSchemaObject => {
  irSchema.type = 'number';

  return irSchema;
};

const parseObject = ({
  context,
  irSchema = {},
  schema,
}: SchemaContext & {
  irSchema?: IRSchemaObject;
  schema: SchemaObject;
}): IRSchemaObject => {
  irSchema.type = 'object';

  const schemaProperties: Record<string, IRSchemaObject> = {};

  for (const name in schema.properties) {
    const property = schema.properties[name];
    if (typeof property === 'boolean') {
      // TODO: parser - handle boolean properties
    } else {
      schemaProperties[name] = schemaToIrSchema({
        context,
        schema: property,
      });
    }
  }

  if (Object.keys(schemaProperties).length) {
    irSchema.properties = schemaProperties;
  }

  if (schema.additionalProperties === undefined) {
    if (!irSchema.properties) {
      irSchema.additionalProperties = {
        type: 'unknown',
      };
    }
  } else if (typeof schema.additionalProperties === 'boolean') {
    irSchema.additionalProperties = {
      type: schema.additionalProperties ? 'unknown' : 'never',
    };
  } else {
    const irAdditionalPropertiesSchema = schemaToIrSchema({
      context,
      schema: schema.additionalProperties,
    });
    // no need to add "any" additional properties if there are no defined properties
    if (
      irSchema.properties ||
      irAdditionalPropertiesSchema.type !== 'unknown'
    ) {
      irSchema.additionalProperties = irAdditionalPropertiesSchema;
    }
  }

  if (schema.required) {
    irSchema.required = schema.required;
  }

  return irSchema;
};

const parseString = ({
  irSchema = {},
}: SchemaContext & {
  irSchema?: IRSchemaObject;
  schema: SchemaObject;
}): IRSchemaObject => {
  irSchema.type = 'string';

  return irSchema;
};

const initIrSchema = ({ schema }: { schema: SchemaObject }): IRSchemaObject => {
  const irSchema: IRSchemaObject = {};

  parseSchemaJsDoc({
    irSchema,
    schema,
  });

  return irSchema;
};

const parseAllOf = ({
  $ref,
  context,
  schema,
}: SchemaContext & {
  schema: SchemaWithRequired<'allOf'>;
}): IRSchemaObject => {
  let irSchema = initIrSchema({ schema });

  const schemaItems: Array<IRSchemaObject> = [];
  const schemaType = getSchemaType({ schema });

  const compositionSchemas = schema.allOf;

  for (const compositionSchema of compositionSchemas) {
    const irCompositionSchema = schemaToIrSchema({
      context,
      schema: compositionSchema,
    });

    if (schema.required) {
      if (irCompositionSchema.required) {
        irCompositionSchema.required = [
          ...irCompositionSchema.required,
          ...schema.required,
        ];
      } else {
        irCompositionSchema.required = schema.required;
      }
    }

    schemaItems.push(irCompositionSchema);

    if ('$ref' in compositionSchema) {
      const ref = context.resolveRef<SchemaObject>(compositionSchema.$ref);
      // `$ref` should be passed from the root `parseSchema()` call
      if (ref.discriminator && $ref) {
        const irDiscriminatorSchema: IRSchemaObject = {
          properties: {
            [ref.discriminator.propertyName]: {
              const: discriminatorValue($ref, ref.discriminator.mapping),
              type: 'string',
            },
          },
          type: 'object',
        };
        if (ref.required?.includes(ref.discriminator.propertyName)) {
          irDiscriminatorSchema.required = [ref.discriminator.propertyName];
        }
        schemaItems.push(irDiscriminatorSchema);
      }
    }
  }

  if (schemaType === 'object') {
    const irObjectSchema = parseOneType({
      context,
      schema: {
        ...schema,
        type: 'object',
      },
    });

    if (irObjectSchema.properties) {
      for (const requiredProperty of irObjectSchema.required ?? []) {
        if (!irObjectSchema.properties[requiredProperty]) {
          for (const compositionSchema of compositionSchemas) {
            // TODO: parser - this could be probably resolved more accurately
            const finalCompositionSchema =
              '$ref' in compositionSchema
                ? context.resolveRef<SchemaObject>(compositionSchema.$ref)
                : compositionSchema;

            if (
              getSchemaType({ schema: finalCompositionSchema }) === 'object'
            ) {
              const irCompositionSchema = parseOneType({
                context,
                schema: {
                  ...finalCompositionSchema,
                  type: 'object',
                },
              });

              if (irCompositionSchema.properties?.[requiredProperty]) {
                irObjectSchema.properties[requiredProperty] =
                  irCompositionSchema.properties[requiredProperty];
                break;
              }
            }
          }
        }
      }
      schemaItems.push(irObjectSchema);
    }
  }

  irSchema = addItemsToSchema({
    items: schemaItems,
    logicalOperator: 'and',
    mutateSchemaOneItem: true,
    schema: irSchema,
  });

  if (schema.nullable) {
    // nest composition to avoid producing an intersection with null
    const nestedItems: Array<IRSchemaObject> = [
      {
        type: 'null',
      },
    ];

    if (schemaItems.length) {
      nestedItems.unshift(irSchema);
    }

    irSchema = {
      items: nestedItems,
      logicalOperator: 'or',
    };

    // TODO: parser - this is a hack to bring back up meta fields
    // without it, some schemas were missing original deprecated
    if (nestedItems[0].deprecated) {
      irSchema.deprecated = nestedItems[0].deprecated;
    }

    // TODO: parser - this is a hack to bring back up meta fields
    // without it, some schemas were missing original description
    if (nestedItems[0].description) {
      irSchema.description = nestedItems[0].description;
    }
  }

  return irSchema;
};

const parseAnyOf = ({
  context,
  schema,
}: SchemaContext & {
  schema: SchemaWithRequired<'anyOf'>;
}): IRSchemaObject => {
  let irSchema = initIrSchema({ schema });

  const schemaItems: Array<IRSchemaObject> = [];
  const schemaType = getSchemaType({ schema });

  const compositionSchemas = schema.anyOf;

  for (const compositionSchema of compositionSchemas) {
    let irCompositionSchema = schemaToIrSchema({
      context,
      schema: compositionSchema,
    });

    // `$ref` should be defined with discriminators
    if (schema.discriminator && '$ref' in compositionSchema) {
      const irDiscriminatorSchema: IRSchemaObject = {
        properties: {
          [schema.discriminator.propertyName]: {
            const: discriminatorValue(
              compositionSchema.$ref,
              schema.discriminator.mapping,
            ),
            type: 'string',
          },
        },
        type: 'object',
      };
      irCompositionSchema = {
        items: [irDiscriminatorSchema, irCompositionSchema],
        logicalOperator: 'and',
      };
    }

    schemaItems.push(irCompositionSchema);
  }

  if (schema.nullable) {
    schemaItems.push({ type: 'null' });
  }

  irSchema = addItemsToSchema({
    items: schemaItems,
    mutateSchemaOneItem: true,
    schema: irSchema,
  });

  if (schemaType === 'object') {
    // nest composition to avoid producing a union with object properties
    const irObjectSchema = parseOneType({
      context,
      schema: {
        ...schema,
        type: 'object',
      },
    });

    if (irObjectSchema.properties) {
      irSchema = {
        items: [irSchema, irObjectSchema],
        logicalOperator: 'and',
      };
    }
  }

  return irSchema;
};

const parseEnum = ({
  context,
  schema,
}: SchemaContext & {
  schema: SchemaWithRequired<'enum'>;
}): IRSchemaObject => {
  let irSchema = initIrSchema({ schema });

  irSchema.type = 'enum';

  const schemaItems: Array<IRSchemaObject> = [];

  for (const [index, enumValue] of schema.enum.entries()) {
    const typeOfEnumValue = typeof enumValue;
    let enumType: SchemaType | 'null' | undefined;

    if (
      typeOfEnumValue === 'string' ||
      typeOfEnumValue === 'number' ||
      typeOfEnumValue === 'boolean'
    ) {
      enumType = typeOfEnumValue;
    } else if (enumValue === null) {
      // nullable must be true
      if (schema.nullable) {
        enumType = 'null';
      }
    } else {
      console.warn(
        '🚨',
        `unhandled "${typeOfEnumValue}" typeof value "${enumValue}" for enum`,
        schema.enum,
      );
    }

    if (!enumType) {
      continue;
    }

    const enumSchema = parseOneType({
      context,
      schema: {
        description: schema['x-enum-descriptions']?.[index],
        title:
          schema['x-enum-varnames']?.[index] ?? schema['x-enumNames']?.[index],
        // cast enum to string temporarily
        type: enumType === 'null' ? 'string' : enumType,
      },
    });

    enumSchema.const = enumValue;

    // cast enum back
    if (enumType === 'null') {
      enumSchema.type = enumType;
    }

    schemaItems.push(enumSchema);
  }

  irSchema = addItemsToSchema({
    items: schemaItems,
    schema: irSchema,
  });

  return irSchema;
};

const parseOneOf = ({
  context,
  schema,
}: SchemaContext & {
  schema: SchemaWithRequired<'oneOf'>;
}): IRSchemaObject => {
  let irSchema = initIrSchema({ schema });

  let schemaItems: Array<IRSchemaObject> = [];
  const schemaType = getSchemaType({ schema });

  const compositionSchemas = schema.oneOf;

  for (const compositionSchema of compositionSchemas) {
    let irCompositionSchema = schemaToIrSchema({
      context,
      schema: compositionSchema,
    });

    // `$ref` should be defined with discriminators
    if (schema.discriminator && '$ref' in compositionSchema) {
      const irDiscriminatorSchema: IRSchemaObject = {
        properties: {
          [schema.discriminator.propertyName]: {
            const: discriminatorValue(
              compositionSchema.$ref,
              schema.discriminator.mapping,
            ),
            type: 'string',
          },
        },
        type: 'object',
      };
      irCompositionSchema = {
        items: [irDiscriminatorSchema, irCompositionSchema],
        logicalOperator: 'and',
      };
    }

    // since we know oneOf will be using "or" logical operator, if the parsed
    // composition schema also has an "or" operator, we can bring it up
    // to avoid unnecessary brackets
    if (
      irCompositionSchema.logicalOperator === 'or' &&
      irCompositionSchema.items
    ) {
      schemaItems = schemaItems.concat(irCompositionSchema.items);
    } else {
      schemaItems.push(irCompositionSchema);
    }
  }

  if (schema.nullable) {
    schemaItems.push({ type: 'null' });
  }

  irSchema = addItemsToSchema({
    items: schemaItems,
    mutateSchemaOneItem: true,
    schema: irSchema,
  });

  if (schemaType === 'object') {
    // nest composition to avoid producing a union with object properties
    const irObjectSchema = parseOneType({
      context,
      schema: {
        ...schema,
        type: 'object',
      },
    });

    if (irObjectSchema.properties) {
      irSchema = {
        items: [irSchema, irObjectSchema],
        logicalOperator: 'and',
      };
    }
  }

  return irSchema;
};

const parseRef = ({
  schema,
}: SchemaContext & {
  schema: ReferenceObject;
}): IRSchemaObject => {
  const irSchema: IRSchemaObject = {};

  // refs using unicode characters become encoded, didn't investigate why
  // but the suspicion is this comes from `@apidevtools/json-schema-ref-parser`
  irSchema.$ref = decodeURI(schema.$ref);

  return irSchema;
};

const parseNullableType = ({
  context,
  irSchema,
  schema,
}: SchemaContext & {
  irSchema?: IRSchemaObject;
  schema: SchemaWithRequired<'type'>;
}): IRSchemaObject => {
  if (!irSchema) {
    irSchema = initIrSchema({ schema });
  }

  const typeIrSchema: IRSchemaObject = {};

  parseSchemaMeta({
    irSchema: typeIrSchema,
    schema,
  });

  const schemaItems: Array<IRSchemaObject> = [
    parseOneType({
      context,
      irSchema: typeIrSchema,
      schema,
    }),
    {
      type: 'null',
    },
  ];

  irSchema = addItemsToSchema({
    items: schemaItems,
    schema: irSchema,
  });

  return irSchema;
};

const parseType = ({
  context,
  schema,
}: SchemaContext & {
  schema: SchemaWithRequired<'type'>;
}): IRSchemaObject => {
  const irSchema = initIrSchema({ schema });

  parseSchemaMeta({
    irSchema,
    schema,
  });

  const type = getSchemaType({ schema });

  if (!type) {
    return irSchema;
  }

  if (!schema.nullable) {
    return parseOneType({
      context,
      irSchema,
      schema: {
        ...schema,
        type,
      },
    });
  }

  return parseNullableType({
    context,
    irSchema,
    schema: {
      ...schema,
      type,
    },
  });
};

const parseOneType = ({
  context,
  irSchema,
  schema,
}: SchemaContext & {
  irSchema?: IRSchemaObject;
  schema: SchemaWithRequired<'type'>;
}): IRSchemaObject => {
  if (!irSchema) {
    irSchema = initIrSchema({ schema });

    parseSchemaMeta({
      irSchema,
      schema,
    });
  }

  switch (schema.type) {
    case 'array':
      return parseArray({
        context,
        irSchema,
        schema,
      });
    case 'boolean':
      return parseBoolean({
        context,
        irSchema,
        schema,
      });
    case 'integer':
    case 'number':
      return parseNumber({
        context,
        irSchema,
        schema,
      });
    case 'object':
      return parseObject({
        context,
        irSchema,
        schema,
      });
    case 'string':
      return parseString({
        context,
        irSchema,
        schema,
      });
    default:
      // gracefully handle invalid type
      return parseUnknown({
        context,
        irSchema,
        schema,
      });
  }
};

const parseUnknown = ({
  irSchema,
  schema,
}: SchemaContext & {
  irSchema?: IRSchemaObject;
  schema: SchemaObject;
}): IRSchemaObject => {
  if (!irSchema) {
    irSchema = initIrSchema({ schema });
  }

  irSchema.type = 'unknown';

  parseSchemaMeta({
    irSchema,
    schema,
  });

  return irSchema;
};

export const schemaToIrSchema = ({
  $ref,
  context,
  schema,
}: SchemaContext & {
  schema: SchemaObject | ReferenceObject;
}): IRSchemaObject => {
  if ('$ref' in schema) {
    return parseRef({
      $ref,
      context,
      schema,
    });
  }

  if (schema.enum) {
    return parseEnum({
      $ref,
      context,
      schema: schema as SchemaWithRequired<'enum'>,
    });
  }

  if (schema.allOf) {
    return parseAllOf({
      $ref,
      context,
      schema: schema as SchemaWithRequired<'allOf'>,
    });
  }

  if (schema.anyOf) {
    return parseAnyOf({
      $ref,
      context,
      schema: schema as SchemaWithRequired<'anyOf'>,
    });
  }

  if (schema.oneOf) {
    return parseOneOf({
      $ref,
      context,
      schema: schema as SchemaWithRequired<'oneOf'>,
    });
  }

  // infer object based on the presence of properties
  if (schema.type || schema.properties) {
    return parseType({
      $ref,
      context,
      schema: schema as SchemaWithRequired<'type'>,
    });
  }

  return parseUnknown({
    $ref,
    context,
    schema,
  });
};

export const parseSchema = ({
  $ref,
  context,
  schema,
}: Required<SchemaContext> & {
  schema: SchemaObject | ReferenceObject;
}) => {
  if (!context.ir.components) {
    context.ir.components = {};
  }

  if (!context.ir.components.schemas) {
    context.ir.components.schemas = {};
  }

  context.ir.components.schemas[refToName($ref)] = schemaToIrSchema({
    $ref,
    context,
    schema,
  });
};
