import path from 'node:path';

import compiler, { TypeScriptFile } from '../../compiler';
import type { Model } from '../../openApi';
import type { Client } from '../../types/client';
import type { Config } from '../../types/config';
import { escapeDescription } from '../escape';
import type { Templates } from '../handlebars';

const escapeNewline = (value: string) => value.replace(/\n/g, '\\n');

const arraySchema = (config: Config, model: Model) => {
    const properties: Record<string, unknown> = {
        type: 'array',
    };

    if (model.link) {
        properties.contains = modelToExpression(config, model.link);
    } else {
        properties.contains = {
            type: model.base,
        };
    }

    if (model.default !== undefined) {
        properties.default = model.default;
    }

    if (model.isReadOnly) {
        properties.isReadOnly = true;
    }

    if (model.isRequired) {
        properties.isRequired = true;
    }

    if (model.isNullable) {
        properties.isNullable = true;
    }

    return properties;
};

const compositionSchema = (config: Config, model: Model) => {
    const properties: Record<string, unknown> = {
        type: model.export,
    };
    if (model.description) {
        properties.description = `\`${escapeDescription(model.description)}\``;
    }

    properties.contains = model.properties.map(property => modelToExpression(config, property));

    if (model.default !== undefined) {
        properties.default = model.default;
    }

    if (model.isReadOnly) {
        properties.isReadOnly = true;
    }

    if (model.isRequired) {
        properties.isRequired = true;
    }

    if (model.isNullable) {
        properties.isNullable = true;
    }

    return properties;
};

const dictSchema = (config: Config, model: Model) => {
    const properties: Record<string, unknown> = {
        type: 'dictionary',
    };

    if (model.link) {
        properties.contains = modelToExpression(config, model.link);
    } else {
        properties.contains = {
            type: model.base,
        };
    }

    if (model.default !== undefined) {
        properties.default = model.default;
    }

    if (model.isReadOnly) {
        properties.isReadOnly = true;
    }

    if (model.isRequired) {
        properties.isRequired = true;
    }

    if (model.isNullable) {
        properties.isNullable = true;
    }

    return properties;
};

const enumSchema = (config: Config, model: Model) => {
    const properties: Record<string, unknown> = {
        type: 'Enum',
    };
    if (model.enum.length) {
        properties.enum = model.enum.map(enumerator => enumerator.value);
    }

    if (model.default !== undefined) {
        properties.default = model.default;
    }

    if (model.isReadOnly) {
        properties.isReadOnly = true;
    }

    if (model.isRequired) {
        properties.isRequired = true;
    }

    if (model.isNullable) {
        properties.isNullable = true;
    }

    return properties;
};

const genericSchema = (config: Config, model: Model) => {
    const properties: Record<string, unknown> = {};
    if (model.type) {
        properties.type = model.type;
    }

    if (model.description) {
        properties.description = `\`${escapeDescription(model.description)}\``;
    }

    if (model.default !== undefined) {
        properties.default = model.default;
    }

    if (model.isReadOnly) {
        properties.isReadOnly = true;
    }

    if (model.isRequired) {
        properties.isRequired = true;
    }

    if (model.isNullable) {
        properties.isNullable = true;
    }

    if (model.format) {
        properties.format = model.format;
    }

    if (model.maximum !== undefined && model.maximum !== null) {
        properties.maximum = model.maximum;
    }

    if (model.exclusiveMaximum !== undefined && model.exclusiveMaximum !== null) {
        properties.exclusiveMaximum = model.exclusiveMaximum;
    }

    if (model.minimum !== undefined && model.minimum !== null) {
        properties.minimum = model.minimum;
    }

    if (model.exclusiveMinimum !== undefined && model.exclusiveMinimum !== null) {
        properties.exclusiveMinimum = model.exclusiveMinimum;
    }

    if (model.multipleOf !== undefined && model.multipleOf !== null) {
        properties.multipleOf = model.multipleOf;
    }

    if (model.maxLength !== undefined && model.maxLength !== null) {
        properties.maxLength = model.maxLength;
    }

    if (model.minLength !== undefined && model.minLength !== null) {
        properties.minLength = model.minLength;
    }

    if (model.pattern) {
        properties.pattern = escapeNewline(model.pattern);
    }

    if (model.maxItems !== undefined && model.maxItems !== null) {
        properties.maxItems = model.maxItems;
    }

    if (model.minItems !== undefined && model.minItems !== null) {
        properties.minItems = model.minItems;
    }

    if (model.uniqueItems !== undefined && model.uniqueItems !== null) {
        properties.uniqueItems = model.uniqueItems;
    }

    if (model.maxProperties !== undefined && model.maxProperties !== null) {
        properties.maxProperties = model.maxProperties;
    }

    if (model.minProperties !== undefined && model.minProperties !== null) {
        properties.minProperties = model.minProperties;
    }

    return properties;
};

const interfaceSchema = (config: Config, model: Model) => {
    const properties: Record<string, unknown> = {};

    if (model.description) {
        properties.description = `\`${escapeDescription(model.description)}\``;
    }

    const props: Record<string, unknown> = {};
    model.properties
        .filter(property => property.name !== '[key: string]')
        .forEach(property => {
            props[property.name] = modelToExpression(config, property);
        });
    properties.properties = props;

    if (model.default !== undefined) {
        properties.default = model.default;
    }

    if (model.isReadOnly) {
        properties.isReadOnly = true;
    }

    if (model.isRequired) {
        properties.isRequired = true;
    }

    if (model.isNullable) {
        properties.isNullable = true;
    }

    return properties;
};

const modelToExpression = (config: Config, model: Model) => {
    switch (model.export) {
        case 'all-of':
        case 'any-of':
        case 'one-of':
            return compositionSchema(config, model);
        case 'array':
            return arraySchema(config, model);
        case 'dictionary':
            return dictSchema(config, model);
        case 'enum':
            return enumSchema(config, model);
        case 'interface':
            return interfaceSchema(config, model);
        default:
            return genericSchema(config, model);
    }
};

const exportSchema = (config: Config, model: Model) => {
    const jsonSchema = modelToExpression(config, model);
    const obj = compiler.types.object(jsonSchema);
    return compiler.export.asConst(`$${model.name}`, obj);
};

/**
 * Generate Schemas using the Handlebar template and write to disk.
 * @param client Client containing models, schemas, and services
 * @param templates The loaded handlebar templates
 * @param outputPath Directory to write the generated files to
 * @param config {@link Config} passed to the `createClient()` method
 */
export const writeClientSchemas = async (
    client: Client,
    templates: Templates,
    outputPath: string,
    config: Config
): Promise<void> => {
    if (!client.models.length) {
        return;
    }

    const file = new TypeScriptFile();
    for (const model of client.models) {
        const result = exportSchema(config, model);
        file.push(result);
    }
    file.write(path.resolve(outputPath, 'schemas.ts'), '\n\n');
};
