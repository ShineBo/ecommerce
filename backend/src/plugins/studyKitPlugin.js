import { fileURLToPath } from 'node:url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { z } from 'zod';
import { AppError } from '../middleware/errors.js';

const definition = protoLoader.loadSync(
  fileURLToPath(new URL('./studyKit.proto', import.meta.url)),
  {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  },
);
const Service = grpc.loadPackageDefinition(definition).simple_shop.study_kit.v1.StudyKitPlugin;
const identifier = z.string().regex(/^[a-z][a-z0-9-]{0,49}$/);
const productId = z.string().regex(/^[a-f0-9]{24}$/);
const algorithmFields = {
  algorithm_id: z.string().regex(/^[A-Z][A-Z0-9]{0,9}$/),
  algorithm_name: z.string().min(1).max(80),
  algorithm_description: z.string().min(1).max(300),
};
const infoSchema = z.object({
  ...algorithmFields,
  id: z.literal('study-kit'),
  name: z.string().min(1).max(80),
  version: z.string().min(1).max(40),
  api_version: z.literal(1),
  purposes: z
    .array(
      z.object({
        id: identifier,
        name: z.string().min(1).max(80),
        description: z.string().max(300),
      }),
    )
    .min(1)
    .max(20),
});
const resultSchema = z.object({
  ...algorithmFields,
  purpose_id: identifier,
  purpose_name: z.string().min(1).max(80),
  cart_version: z.string().regex(/^\d+$/),
  complete: z.boolean(),
  completed_count: z.number().int().nonnegative(),
  required_count: z.number().int().positive(),
  requirements: z
    .array(
      z.object({
        id: identifier,
        label: z.string().min(1).max(120),
        satisfied: z.boolean(),
        minimum_quantity: z.number().int().min(1).max(99),
        present_quantity: z.number().int().min(0).max(4950),
        matched_product_ids: z.array(productId).max(50),
        suggested_product_ids: z.array(productId).max(3),
      }),
    )
    .min(1)
    .max(20),
});
export function pluginUnavailable() {
  return new AppError(
    503,
    'PLUGIN_UNAVAILABLE',
    'Kit checking is temporarily unavailable. You can keep shopping.',
  );
}
// Core extension adapter: transport, deadline, compatibility, and safe failure handling.
// Kit suitability rules are implemented exclusively by the separate plug-in.
export function createStudyKitPlugin({
  enabled = true,
  host = 'study-kit-plugin',
  port = 50001,
  timeoutMs = 1500,
} = {}) {
  let client;
  let closed = false;
  function call(method, request) {
    if (!enabled || closed) return Promise.reject(pluginUnavailable());
    client ||= new Service(`${host}:${port}`, grpc.credentials.createInsecure(), {
      'grpc.initial_reconnect_backoff_ms': 250,
      'grpc.max_reconnect_backoff_ms': 1000,
    });
    return new Promise((resolve, reject) => {
      client[method](request, { deadline: Date.now() + timeoutMs }, (error, response) => {
        if (!error) resolve(response);
        else if (error.code === grpc.status.INVALID_ARGUMENT)
          reject(
            new AppError(
              422,
              'KIT_PURPOSE_INVALID',
              'Choose a supported kit purpose and try again.',
            ),
          );
        else reject(pluginUnavailable());
      });
    });
  }
  return {
    async getStatus() {
      try {
        const info = infoSchema.parse(await call('getInfo', {}));
        return { ...info, available: true, state: 'available' };
      } catch {
        return {
          id: 'study-kit',
          name: 'Study Kit Checker',
          available: false,
          state: enabled ? 'unavailable' : 'disabled',
          purposes: [],
        };
      }
    },
    async checkKit(request) {
      const raw = await call('checkKit', request);
      const parsed = resultSchema.safeParse(raw);
      if (!parsed.success) throw pluginUnavailable();
      const result = parsed.data;
      const catalog = new Set(request.catalog_items.map((item) => item.product_id));
      const cart = new Set(request.cart_items.map((item) => item.product_id));
      const quantities = new Map(
        request.cart_items.map((item) => [item.product_id, item.quantity]),
      );
      const satisfied = result.requirements.filter((item) => item.satisfied).length;
      const invalidRequirement = result.requirements.some((item) => {
        const hasMatches = item.matched_product_ids.length > 0;
        const unknownMatch = item.matched_product_ids.some(
          (id) => !catalog.has(id) || !cart.has(id),
        );
        const invalidSuggestion = item.suggested_product_ids.some(
          (id) => !catalog.has(id) || (cart.has(id) && !item.matched_product_ids.includes(id)),
        );
        const units = item.matched_product_ids.reduce(
          (sum, id) => sum + (quantities.get(id) || 0),
          0,
        );
        return (
          item.satisfied !== item.present_quantity >= item.minimum_quantity ||
          hasMatches !== item.present_quantity > 0 ||
          item.present_quantity > units ||
          new Set(item.matched_product_ids).size !== item.matched_product_ids.length ||
          new Set(item.suggested_product_ids).size !== item.suggested_product_ids.length ||
          unknownMatch ||
          invalidSuggestion ||
          (item.satisfied && item.suggested_product_ids.length > 0)
        );
      });
      if (
        result.purpose_id !== request.purpose_id ||
        result.cart_version !== String(request.cart_version) ||
        result.required_count !== result.requirements.length ||
        result.completed_count !== satisfied ||
        result.complete !== (satisfied === result.required_count) ||
        new Set(result.requirements.map((item) => item.id)).size !== result.requirements.length ||
        invalidRequirement
      )
        throw pluginUnavailable();
      return result;
    },
    close() {
      closed = true;
      client?.close();
    },
  };
}
