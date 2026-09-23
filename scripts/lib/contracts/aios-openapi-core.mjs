import { readFileSync } from 'node:fs';

import {
  AIOS_API_VERSION_PREFIX,
  AIOS_RUST_ROUTE_SOURCES,
  AIOS_RUST_SCHEMA_SOURCES,
  AIOS_TYPED_OPERATION_OVERRIDES,
} from '../../config/contracts/aios-api-contract.mjs';
import { collectRustRouteOperations } from './rust-route-extractor.mjs';
import { collectRustStructSchemas } from './rust-schema-extractor.mjs';

const METHOD_ORDER = Object.freeze(['get', 'post', 'put', 'patch', 'delete']);

function readUtf8(filePath) {
  return readFileSync(filePath, 'utf8');
}

function versionedPath(path) {
  return `${AIOS_API_VERSION_PREFIX}${path === '/' ? '' : path}`;
}

function operationId(operation) {
  const suffix = operation.path
    .replace(/[{}]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return `${operation.tag.replace(/-/g, '_')}_${operation.method}_${suffix}`;
}

function pathParameters(path) {
  return [...path.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((match) => ({
    name: match[1],
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }));
}

function schemaReference(schemaName) {
  return schemaName ? { $ref: `#/components/schemas/${schemaName}` } : {};
}

function responseContent(schemaName, schema) {
  return {
    'application/json': {
      schema: schema ?? schemaReference(schemaName),
    },
  };
}

function requestContent(override) {
  if (override.multipartRequest) {
    const field = override.multipartRequest.field;
    return {
      'multipart/form-data': {
        schema: {
          type: 'object',
          additionalProperties: false,
          required: [field],
          properties: {
            [field]: { type: 'string', format: 'binary' },
          },
        },
      },
    };
  }
  return responseContent(override.request, override.requestSchema);
}

function successResponses(override) {
  const status = override?.successStatus ?? 200;
  return {
    [status]: {
      description: 'Successful response',
      ...(!override?.emptyResponse ? {
        content: responseContent(override?.response, override?.responseSchema),
      } : {}),
    },
  };
}

function buildOperation(operation) {
  const path = versionedPath(operation.path);
  const override = AIOS_TYPED_OPERATION_OVERRIDES[`${operation.method.toUpperCase()} ${path}`];
  const parameters = [
    ...pathParameters(path),
    ...(override?.queryParameters ?? []),
  ];
  return {
    tags: [operation.tag],
    summary: `${operation.method.toUpperCase()} ${path}`,
    operationId: operationId(operation),
    ...(parameters.length ? { parameters } : {}),
    ...(override?.request || override?.multipartRequest ? {
      requestBody: {
        required: true,
        content: requestContent(override),
      },
    } : {}),
    responses: {
      ...successResponses(override),
      401: {
        description: 'Authentication required',
        content: responseContent('ErrorResponse'),
      },
      500: {
        description: 'Internal server error',
        content: responseContent('ErrorResponse'),
      },
    },
    security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    'x-aios-contract-maturity': override ? 'typed' : 'route-inventory',
    'x-aios-rust-source': operation.file,
  };
}

function buildPaths(operations) {
  const paths = {};
  for (const operation of operations) {
    const path = versionedPath(operation.path);
    paths[path] ??= {};
    paths[path][operation.method] = buildOperation(operation);
  }
  for (const path of Object.keys(paths)) {
    paths[path] = Object.fromEntries(
      Object.entries(paths[path]).sort(([left], [right]) => METHOD_ORDER.indexOf(left) - METHOD_ORDER.indexOf(right)),
    );
  }
  return paths;
}

function buildSchemas(extractedSchemas) {
  return {
    ErrorResponse: {
      type: 'object',
      additionalProperties: true,
      properties: {
        code: { type: 'string' },
        detail: { type: 'string' },
        message: { type: 'string' },
      },
    },
    ...extractedSchemas,
  };
}

export function buildAiosOpenApi({ readFile = readUtf8 } = {}) {
  const operations = collectRustRouteOperations(AIOS_RUST_ROUTE_SOURCES, readFile);
  const schemas = collectRustStructSchemas(AIOS_RUST_SCHEMA_SOURCES, readFile);
  return {
    openapi: '3.1.0',
    info: {
      title: 'AIOS API v2',
      version: '2.0.0',
      description: 'Generated from active Rust route declarations and selected Rust serde structs.',
    },
    paths: buildPaths(operations),
    components: {
      schemas: buildSchemas(schemas),
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        cookieAuth: { type: 'apiKey', in: 'cookie', name: 'aios_access_token' },
      },
    },
    tags: [...new Set(operations.map((operation) => operation.tag))].sort().map((name) => ({ name })),
    'x-aios-contract': {
      generatedFrom: 'rust-router-and-serde-source',
      operationCount: operations.length,
      routeSourceCount: AIOS_RUST_ROUTE_SOURCES.length,
      typedOperationCount: Object.keys(AIOS_TYPED_OPERATION_OVERRIDES).length,
      v1RemovalAuthorized: false,
    },
  };
}

export function renderAiosOpenApi(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}
