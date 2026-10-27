import grpc from '@grpc/grpc-js';
import { createStudyKitServer } from './grpcServer.js';
import { activeAlgorithm } from './rules.js';
const port = Number(process.env.PLUGIN_PORT || 50001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PLUGIN_PORT');
const server = createStudyKitServer();
await new Promise((resolve, reject) => {
  server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (error) => {
    if (error) reject(error);
    else resolve();
  });
});
console.log(`Study Kit Checker ${activeAlgorithm} gRPC listening on ${port}`);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.tryShutdown(() => process.exit(0));
    setTimeout(() => {
      server.forceShutdown();
      process.exit(0);
    }, 3000).unref();
  });
}
