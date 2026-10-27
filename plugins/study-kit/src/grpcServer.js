import { fileURLToPath } from 'node:url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { activeAlgorithm, checkKit, getPluginInfo, InvalidKitRequest } from './rules.js';

// Local source uses the same canonical file as the backend. Docker packages that file too.
const protoPath =
  process.env.STUDY_KIT_PROTO_PATH ||
  fileURLToPath(new URL('../../../backend/src/plugins/studyKit.proto', import.meta.url));
const definition = protoLoader.loadSync(protoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
export const StudyKitPlugin =
  grpc.loadPackageDefinition(definition).simple_shop.study_kit.v1.StudyKitPlugin;
export function createStudyKitServer({ algorithm = activeAlgorithm } = {}) {
  const server = new grpc.Server();
  server.addService(StudyKitPlugin.service, {
    getInfo: (_call, callback) => callback(null, getPluginInfo(algorithm)),
    checkKit: (call, callback) => {
      try {
        const result = checkKit(call.request, algorithm);
        console.log(
          JSON.stringify({
            event: 'kit_checked',
            algorithm: result.algorithm_id,
            purpose: result.purpose_id,
            completed: result.completed_count,
            required: result.required_count,
          }),
        );
        callback(null, result);
      } catch (error) {
        callback({
          code:
            error instanceof InvalidKitRequest
              ? grpc.status.INVALID_ARGUMENT
              : grpc.status.INTERNAL,
          details: error instanceof InvalidKitRequest ? error.message : 'Kit checking failed.',
        });
      }
    },
  });
  return server;
}
