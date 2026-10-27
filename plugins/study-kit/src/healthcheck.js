import grpc from '@grpc/grpc-js';
import { StudyKitPlugin } from './grpcServer.js';
const client = new StudyKitPlugin(
  `127.0.0.1:${process.env.PLUGIN_PORT || 50001}`,
  grpc.credentials.createInsecure(),
);
client.getInfo({}, { deadline: Date.now() + 2000 }, (error, reply) => {
  client.close();
  process.exit(!error && reply?.id === 'study-kit' && reply.api_version === 1 ? 0 : 1);
});
