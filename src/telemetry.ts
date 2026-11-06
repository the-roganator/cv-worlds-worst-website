/**
 * OpenTelemetry for the shop: traces, metrics and logs, sent over OTLP to a collector.
 *
 * Preloaded with `node --import ./src/telemetry.ts`, so the instrumentation is in place before the server imports
 * the modules it patches. Configured by the standard OTEL_* environment variables; the endpoint defaults to
 * http://localhost:4318, and nothing breaks if no collector is listening there.
 *
 * Every signal carries the commit as `service.version`, so two versions running side by side can be told apart.
 */
import { register } from 'node:module';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { measured } from './measured.ts';

// ES modules are patched through a loader hook, which has to be registered before they are imported.
register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);

const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME ?? 'website',
  resource: resourceFromAttributes({ 'service.version': process.env.GIT_COMMIT ?? 'dev' }),
  instrumentations: [
    // An ignored request has no span and is left out of the request metrics.
    new HttpInstrumentation({ ignoreIncomingRequestHook: (req) => !measured(req) }),
    new PinoInstrumentation(),
  ],
});
sdk.start();

/** Flushes whatever is buffered. Call it once, as the process stops. */
export function shutdownTelemetry(): Promise<void> {
  return sdk.shutdown();
}
